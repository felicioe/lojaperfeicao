-- =========================================
-- CORREÇÕES DO PAGAMENTO PARCIAL (issue #131, revisão pós-entrega) —
-- revisão criteriosa encontrou vários lugares que ficaram inconsistentes
-- com o novo invariante "pago = TRUE implica valor_pago >= valor":
--
-- 1) baixar_faturas (baixa integral) não sabia de valor_pago: cobrava o
--    `valor` cheio de novo mesmo numa fatura que já tinha pagamento
--    parcial (cobrança em dobro), e nunca setava valor_pago ao fechar —
--    quebrando o invariante pra toda baixa integral normal daqui pra
--    frente. Mesmo problema em baixar_conta_pagar (saída).
-- 2) registrar_recebimento_avulso e criar_lancamento_de_ofx criam
--    lançamento já com pago=TRUE mas sem valor_pago — mesma quebra do
--    invariante (afeta, por exemplo, o "Total pago" do extrato do
--    irmão, que soma valor_pago).
-- 3) baixar_pagamento_parcial e conciliar_ofx_lote liam valor_pago sem
--    travar a linha (sem FOR UPDATE) — duas chamadas concorrentes na
--    mesma fatura podiam se sobrescrever. Também não rejeitavam
--    lancamento_id duplicado dentro da mesma alocação (a UI nunca manda
--    duplicado, mas a procedure não pode confiar só nisso).
-- 4) desfazer_conciliacao só enxergava contribuições posteriores feitas
--    por OUTRA conciliação (conciliacao_lancamentos). Uma fatura que
--    recebeu parcial via conciliação e depois foi fechada por um
--    pagamento parcial MANUAL (baixar_pagamento_parcial, que só grava
--    em recibo_itens) passava batido pela guarda — desfazer o evento de
--    conciliação apagaria a contribuição dele sem checar que uma baixa
--    manual posterior já tinha fechado a fatura contando com ela.
-- =========================================

-- ---------- 0) precisão de timestamp pra guarda LIFO de desfazer_conciliacao ----------
-- TIMESTAMP (granularidade de 1 segundo) faz a comparação "evento
-- posterior" abaixo falhar quando uma conciliação parcial e a baixa
-- manual que a completa acontecem dentro do mesmo segundo (reproduzido
-- em teste manual) — silenciosamente permite desfazer um evento que já
-- foi complementado, corrompendo pago/valor_pago. TIMESTAMP(6)
-- (microssegundos) resolve na prática: nenhuma chamada real a estas
-- procedures (cada uma com várias instruções + commit) roda rápido o
-- bastante pra colidir no microssegundo.
ALTER TABLE conciliacao_lancamentos
  MODIFY COLUMN criado_em TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
ALTER TABLE recibos
  MODIFY COLUMN criado_em TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

-- ---------- 1a) baixar_faturas: guarda + seta valor_pago ao fechar ----------
DROP PROCEDURE IF EXISTS baixar_faturas;
DELIMITER $$
CREATE PROCEDURE baixar_faturas(
  IN p_lancamento_ids JSON,
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE,
  IN p_desconto DECIMAL(14,2),
  IN p_observacoes TEXT,
  IN p_juros_adicional DECIMAL(14,2),
  IN p_valor_extra DECIMAL(14,2),
  IN p_plano_conta_extra_id CHAR(36),
  OUT p_recibo_id CHAR(36)
)
BEGIN
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_n_irmaos INT;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_receber_id CHAR(36);
  DECLARE v_multas_juros_id CHAR(36);
  DECLARE v_soma_original DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_multa DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_juros DECIMAL(14,2) DEFAULT 0;
  DECLARE v_juros_adicional DECIMAL(14,2) DEFAULT COALESCE(p_juros_adicional, 0);
  DECLARE v_valor_extra DECIMAL(14,2) DEFAULT COALESCE(p_valor_extra, 0);
  DECLARE v_total DECIMAL(14,2);
  DECLARE v_itens JSON;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_vencimento DATE;
  DECLARE v_multa DECIMAL(14,2);
  DECLARE v_juros DECIMAL(14,2);
  DECLARE v_dias INT;
  DECLARE v_calc_total DECIMAL(14,2);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR SELECT id, valor, data_vencimento FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_lancamento_ids IS NULL OR JSON_LENGTH(p_lancamento_ids) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos uma fatura';
  END IF;
  IF v_valor_extra > 0 AND p_plano_conta_extra_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione a conta de receita do valor extra';
  END IF;

  -- Trava as linhas envolvidas (mesmo motivo do FOR UPDATE em
  -- baixar_pagamento_parcial/conciliar_ofx_lote abaixo).
  SELECT id FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) FOR UPDATE;

  SELECT COUNT(DISTINCT irmao_id) INTO v_n_irmaos FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO v_irmao_id FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) LIMIT 1;

  -- valor_pago > 0 = fatura já tem pagamento parcial registrado; baixa
  -- integral cobraria o valor cheio de novo (cobrança em dobro). Precisa
  -- ser concluída via Pagamento Parcial.
  IF EXISTS (SELECT 1 FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND (tipo <> 'entrada' OR pago OR valor_pago > 0)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura selecionada já está paga, já tem pagamento parcial registrado, ou não é uma fatura em aberto';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
  END IF;

  SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';
  SELECT id INTO v_multas_juros_id FROM plano_contas WHERE codigo = '4.1.06';

  OPEN cur;
  calc_loop: LOOP
    FETCH cur INTO v_id, v_valor, v_vencimento;
    IF v_done THEN LEAVE calc_loop; END IF;
    CALL calcular_multa_juros(v_valor, v_vencimento, p_data_pagamento, v_multa, v_juros, v_dias, v_calc_total);
    SET v_soma_original = v_soma_original + v_valor;
    SET v_soma_multa = v_soma_multa + v_multa;
    SET v_soma_juros = v_soma_juros + v_juros;
  END LOOP;
  CLOSE cur;
  SET v_soma_juros = v_soma_juros + v_juros_adicional;

  SET v_total = v_soma_original + v_soma_multa + v_soma_juros + v_valor_extra - COALESCE(p_desconto, 0);
  IF v_total < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Desconto maior que o valor total da baixa';
  END IF;

  SET p_recibo_id = UUID();
  INSERT INTO recibos (
    id, irmao_id, data, valor_original, valor_multa, valor_juros, desconto,
    valor_extra, plano_conta_extra_id, valor_total, forma_pagamento, conta_financeira_id,
    observacoes, criado_por
  ) VALUES (
    p_recibo_id, v_irmao_id, p_data_pagamento, v_soma_original, v_soma_multa, v_soma_juros, COALESCE(p_desconto, 0),
    v_valor_extra, p_plano_conta_extra_id, v_total, p_forma_pagamento, p_conta_financeira_id,
    p_observacoes, @current_usuario_id
  );

  SET v_done = FALSE;
  OPEN cur;
  itens_loop: LOOP
    FETCH cur INTO v_id, v_valor, v_vencimento;
    IF v_done THEN LEAVE itens_loop; END IF;
    CALL calcular_multa_juros(v_valor, v_vencimento, p_data_pagamento, v_multa, v_juros, v_dias, v_calc_total);

    INSERT INTO recibo_itens (recibo_id, lancamento_id, valor_original, valor_multa, valor_juros)
    VALUES (p_recibo_id, v_id, v_valor, v_multa, v_juros);

    UPDATE lancamentos
    SET pago = TRUE, valor_pago = v_valor, data_pagamento = p_data_pagamento, conta_id = p_conta_financeira_id,
        forma_pagamento = p_forma_pagamento, recibo_id = p_recibo_id
    WHERE id = v_id;
  END LOOP;
  CLOSE cur;

  SET v_itens = JSON_ARRAY(JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_total AS DECIMAL(14,2))));
  IF COALESCE(p_desconto, 0) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', (SELECT id FROM plano_contas WHERE codigo = '5.1.06'), 'tipo', 'debito', 'valor', CAST(p_desconto AS DECIMAL(14,2))));
  END IF;
  SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_soma_original AS DECIMAL(14,2))));
  IF (v_soma_multa + v_soma_juros) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_multas_juros_id, 'tipo', 'credito', 'valor', CAST(v_soma_multa + v_soma_juros AS DECIMAL(14,2))));
  END IF;
  IF v_valor_extra > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', p_plano_conta_extra_id, 'tipo', 'credito', 'valor', CAST(v_valor_extra AS DECIMAL(14,2))));
  END IF;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento),
    'Recibo (baixa de fatura)', v_itens, 'recibo_baixa', p_recibo_id, @lanc_contabil_id
  );
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- ---------- 1b) baixar_conta_pagar: mesma guarda + valor_pago ----------
DROP PROCEDURE IF EXISTS baixar_conta_pagar;
DELIMITER $$
CREATE PROCEDURE baixar_conta_pagar(
  IN p_lancamento_id CHAR(36),
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE
)
BEGIN
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao VARCHAR(500);
  DECLARE v_pago BOOLEAN;
  DECLARE v_valor_pago DECIMAL(14,2);
  DECLARE v_conta_pagar_id CHAR(36);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;
  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT valor, descricao, pago, valor_pago INTO v_valor, v_descricao, v_pago, v_valor_pago
  FROM lancamentos WHERE id = p_lancamento_id AND tipo = 'saida' FOR UPDATE;
  IF v_valor IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta a pagar não encontrada';
  END IF;
  IF v_pago THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conta a pagar já foi baixada';
  END IF;
  IF v_valor_pago > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conta a pagar já tem pagamento parcial registrado';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
  END IF;

  SELECT id INTO v_conta_pagar_id FROM plano_contas WHERE codigo = '2.1.01';

  UPDATE lancamentos
  SET pago = TRUE, valor_pago = v_valor, data_pagamento = p_data_pagamento, conta_id = p_conta_financeira_id, forma_pagamento = p_forma_pagamento
  WHERE id = p_lancamento_id;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento), CONCAT('Baixa: ', v_descricao),
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'debito', 'valor', CAST(v_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor AS DECIMAL(14,2)))
    ),
    'conta_pagar_baixa', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- ---------- 2a) registrar_recebimento_avulso: seta valor_pago no insert ----------
DROP PROCEDURE IF EXISTS registrar_recebimento_avulso;
DELIMITER $$
CREATE PROCEDURE registrar_recebimento_avulso(
  IN p_valor DECIMAL(14,2),
  IN p_categoria VARCHAR(20),
  IN p_plano_conta_id CHAR(36),
  IN p_conta_financeira_id CHAR(36),
  IN p_data DATE,
  IN p_forma_pagamento VARCHAR(50),
  IN p_irmao_id CHAR(36),
  IN p_terceiro_id CHAR(36),
  IN p_descricao VARCHAR(500),
  IN p_observacoes TEXT,
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_label VARCHAR(50);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;
  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
  END IF;

  SET v_label = CASE p_categoria
    WHEN 'mensalidade' THEN 'Mensalidade'
    WHEN 'taxa_grau' THEN 'Taxa Grau'
    WHEN 'tronco' THEN 'Tronco'
    WHEN 'doacao' THEN 'Doação'
    ELSE 'Outros'
  END;
  SET v_desc = COALESCE(p_descricao, v_label);
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, forma_pagamento, observacoes, criado_por
  ) VALUES (
    p_lancamento_id, p_data, p_data, v_desc, p_valor, p_valor, 'entrada', p_conta_financeira_id, p_plano_conta_id,
    p_irmao_id, p_terceiro_id, p_categoria, TRUE, p_forma_pagamento, p_observacoes, @current_usuario_id
  );

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data), v_desc,
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(p_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'credito', 'valor', CAST(p_valor AS DECIMAL(14,2)))
    ),
    'recebimento_avulso', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- ---------- 2b) criar_lancamento_de_ofx: seta valor_pago no insert ----------
DROP PROCEDURE IF EXISTS criar_lancamento_de_ofx;
DELIMITER $$
CREATE PROCEDURE criar_lancamento_de_ofx(
  IN p_ofx_id CHAR(36),
  IN p_plano_conta_id CHAR(36),
  IN p_categoria VARCHAR(20),
  IN p_irmao_id CHAR(36),
  IN p_terceiro_id CHAR(36),
  IN p_descricao VARCHAR(500),
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_conta_financeira_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao_ofx VARCHAR(500);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_valor_abs DECIMAL(14,2);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_itens JSON;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;
  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT conta_financeira_id, data, valor, descricao INTO v_conta_financeira_id, v_data, v_valor, v_descricao_ofx
  FROM ofx_lancamentos WHERE id = p_ofx_id AND NOT conciliado;
  IF v_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = v_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SET v_valor_abs = ABS(v_valor);
  SET v_tipo = CASE WHEN v_valor >= 0 THEN 'entrada' ELSE 'saida' END;
  SET v_desc = COALESCE(p_descricao, v_descricao_ofx, 'Lançamento importado do extrato');
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, criado_por
  ) VALUES (
    p_lancamento_id, v_data, v_data, v_desc, v_valor_abs, v_valor_abs, v_tipo, v_conta_financeira_id, p_plano_conta_id,
    p_irmao_id, p_terceiro_id, CASE WHEN v_tipo = 'entrada' THEN p_categoria ELSE NULL END, TRUE, @current_usuario_id
  );

  IF v_tipo = 'entrada' THEN
    SET v_itens = JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
    );
  ELSE
    SET v_itens = JSON_ARRAY(
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
    );
  END IF;

  CALL registrar_lancamento_contabil(v_data, mes_competencia(v_data), v_desc, v_itens, 'ofx_importado', p_lancamento_id, @lanc_contabil_id);

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id WHERE id = p_ofx_id;
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- ---------- 3a) baixar_pagamento_parcial: trava as linhas + rejeita duplicata ----------
DROP PROCEDURE IF EXISTS baixar_pagamento_parcial;
DELIMITER $$
CREATE PROCEDURE baixar_pagamento_parcial(
  IN p_alocacao JSON,
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE,
  IN p_observacoes TEXT,
  OUT p_recibo_id CHAR(36)
)
BEGIN
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_n_irmaos INT;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_receber_id CHAR(36);
  DECLARE v_total DECIMAL(14,2) DEFAULT 0;
  DECLARE v_qtd_alocacao INT;
  DECLARE v_qtd_distintos INT;
  DECLARE v_qtd_validos INT;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_valor_fatura DECIMAL(14,2);
  DECLARE v_valor_pago_atual DECIMAL(14,2);
  DECLARE v_novo_valor_pago DECIMAL(14,2);
  DECLARE v_fecha BOOLEAN;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT jt.lancamento_id, jt.valor, l.valor, l.valor_pago
    FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
    JOIN lancamentos l ON l.id = jt.lancamento_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_alocacao IS NULL OR JSON_LENGTH(p_alocacao) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe ao menos uma fatura e o valor a aplicar';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT lancamento_id) INTO v_qtd_alocacao, v_qtd_distintos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt;
  IF v_qtd_distintos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A mesma fatura não pode aparecer duas vezes na alocação';
  END IF;

  -- Trava as linhas envolvidas antes de ler valor_pago, pra duas
  -- chamadas concorrentes na mesma fatura não se sobrescreverem.
  SELECT id FROM lancamentos
  WHERE id IN (SELECT lancamento_id FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt)
  FOR UPDATE;

  SELECT COUNT(DISTINCT l.irmao_id), MIN(l.irmao_id) INTO v_n_irmaos, v_irmao_id
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id;
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;

  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id
  WHERE l.tipo = 'entrada' AND l.pago = FALSE AND jt.valor > 0 AND jt.valor <= (l.valor - l.valor_pago);
  IF v_qtd_validos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura já está paga, não é uma fatura em aberto, ou o valor aplicado é inválido (deve ser maior que zero e não passar do saldo)';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
  END IF;

  SELECT COALESCE(SUM(jt.valor), 0) INTO v_total
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(valor DECIMAL(14,2) PATH '$.valor')) jt;

  SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';

  SET p_recibo_id = UUID();
  INSERT INTO recibos (id, irmao_id, data, valor_original, valor_total, forma_pagamento, conta_financeira_id, observacoes, criado_por)
  VALUES (p_recibo_id, v_irmao_id, p_data_pagamento, v_total, v_total, p_forma_pagamento, p_conta_financeira_id, p_observacoes, @current_usuario_id);

  OPEN cur;
  loop_alocacao: LOOP
    FETCH cur INTO v_lanc_id, v_valor_aplicado, v_valor_fatura, v_valor_pago_atual;
    IF v_done THEN LEAVE loop_alocacao; END IF;

    INSERT INTO recibo_itens (recibo_id, lancamento_id, valor_original) VALUES (p_recibo_id, v_lanc_id, v_valor_aplicado);

    SET v_novo_valor_pago = v_valor_pago_atual + v_valor_aplicado;
    SET v_fecha = (v_novo_valor_pago >= v_valor_fatura);

    UPDATE lancamentos
    SET valor_pago = v_novo_valor_pago,
        pago = v_fecha,
        data_pagamento = IF(v_fecha, p_data_pagamento, data_pagamento),
        conta_id = IF(v_fecha, p_conta_financeira_id, conta_id),
        forma_pagamento = IF(v_fecha, p_forma_pagamento, forma_pagamento),
        recibo_id = IF(v_fecha, p_recibo_id, recibo_id)
    WHERE id = v_lanc_id;
  END LOOP;
  CLOSE cur;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento),
    'Recibo (pagamento parcial)',
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_total AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_total AS DECIMAL(14,2)))
    ),
    'recibo_baixa_parcial', p_recibo_id, @lanc_contabil_id
  );

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- ---------- 3b) conciliar_ofx_lote: trava as linhas + rejeita duplicata ----------
DROP PROCEDURE IF EXISTS conciliar_ofx_lote;
DELIMITER $$
CREATE PROCEDURE conciliar_ofx_lote(
  IN p_ofx_ids JSON,
  IN p_alocacao JSON,
  OUT p_conciliacao_id CHAR(36)
)
BEGIN
  DECLARE v_soma_ofx DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_alocacao DECIMAL(14,2) DEFAULT 0;
  DECLARE v_qtd_ofx INT;
  DECLARE v_qtd_ofx_validas INT;
  DECLARE v_qtd_alocacao INT;
  DECLARE v_qtd_distintos INT;
  DECLARE v_qtd_validos INT;
  DECLARE v_n_contas INT;
  DECLARE v_conta_financeira_id CHAR(36);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_data_conciliacao DATE;
  DECLARE v_receber_id CHAR(36);
  DECLARE v_pagar_id CHAR(36);
  DECLARE v_tem_provisao BOOLEAN;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_valor_fatura DECIMAL(14,2);
  DECLARE v_valor_pago_atual DECIMAL(14,2);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_novo_valor_pago DECIMAL(14,2);
  DECLARE v_fecha BOOLEAN;
  DECLARE v_desc VARCHAR(500);
  DECLARE v_lanc_contabil_id_novo CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT jt.lancamento_id, jt.valor, l.tipo, l.valor, l.valor_pago, l.descricao
    FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
    JOIN lancamentos l ON l.id = jt.lancamento_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_ofx_ids IS NULL OR JSON_LENGTH(p_ofx_ids) = 0 OR p_alocacao IS NULL OR JSON_LENGTH(p_alocacao) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos um item de cada lado';
  END IF;
  SET v_qtd_ofx = JSON_LENGTH(p_ofx_ids);
  SELECT COUNT(*), COUNT(DISTINCT lancamento_id) INTO v_qtd_alocacao, v_qtd_distintos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt;
  IF v_qtd_distintos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A mesma fatura não pode aparecer duas vezes na alocação';
  END IF;

  -- Trava as linhas de lancamentos e de ofx_lancamentos envolvidas antes
  -- de ler valor_pago/conciliado, pro mesmo motivo de baixar_pagamento_parcial.
  SELECT id FROM lancamentos
  WHERE id IN (SELECT lancamento_id FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt)
  FOR UPDATE;
  SELECT id FROM ofx_lancamentos WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id)) FOR UPDATE;

  SELECT COUNT(*), COUNT(DISTINCT conta_financeira_id), COALESCE(SUM(valor), 0), MAX(data)
    INTO v_qtd_ofx_validas, v_n_contas, v_soma_ofx, v_data_conciliacao
  FROM ofx_lancamentos WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id)) AND NOT conciliado;
  IF v_qtd_ofx_validas <> v_qtd_ofx THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma linha do extrato não foi encontrada ou já está conciliada';
  END IF;
  IF v_n_contas <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'As linhas do extrato selecionadas devem ser da mesma conta bancária';
  END IF;
  SELECT conta_financeira_id INTO v_conta_financeira_id
  FROM ofx_lancamentos WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id)) LIMIT 1;

  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id
  WHERE l.pago = FALSE AND l.tipo IN ('entrada', 'saida') AND jt.valor > 0 AND jt.valor <= (l.valor - l.valor_pago);
  IF v_qtd_validos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Algum lançamento selecionado já está pago, não é uma entrada/saída em aberto, ou o valor aplicado é inválido';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = v_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN l.tipo = 'entrada' THEN jt.valor ELSE -jt.valor END), 0) INTO v_soma_alocacao
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id;

  IF v_soma_ofx <> v_soma_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O total do extrato selecionado não bate com o total alocado nos lançamentos selecionados';
  END IF;

  SET p_conciliacao_id = UUID();
  INSERT INTO conciliacoes (id, conta_financeira_id, data_conciliacao, valor_total, criado_por)
  VALUES (p_conciliacao_id, v_conta_financeira_id, v_data_conciliacao, ABS(v_soma_ofx), @current_usuario_id);

  UPDATE ofx_lancamentos SET conciliado = TRUE, conciliacao_id = p_conciliacao_id
  WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id));

  SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';
  SELECT id INTO v_pagar_id FROM plano_contas WHERE codigo = '2.1.01';

  OPEN cur;
  loop_lanc: LOOP
    FETCH cur INTO v_id, v_valor_aplicado, v_tipo, v_valor_fatura, v_valor_pago_atual, v_desc;
    IF v_done THEN LEAVE loop_lanc; END IF;

    SET v_novo_valor_pago = v_valor_pago_atual + v_valor_aplicado;
    SET v_fecha = (v_novo_valor_pago >= v_valor_fatura);

    UPDATE lancamentos
    SET valor_pago = v_novo_valor_pago,
        pago = v_fecha,
        data_pagamento = IF(v_fecha, v_data_conciliacao, data_pagamento),
        conta_id = IF(v_fecha, v_conta_financeira_id, conta_id),
        forma_pagamento = IF(v_fecha, COALESCE(forma_pagamento, 'Conciliação OFX'), forma_pagamento),
        conciliacao_id = IF(v_fecha, p_conciliacao_id, conciliacao_id)
    WHERE id = v_id;

    SELECT EXISTS(
      SELECT 1 FROM lancamentos_contabeis
      WHERE origem_id = v_id AND origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao')
    ) INTO v_tem_provisao;

    SET v_lanc_contabil_id_novo = NULL;
    IF v_tem_provisao THEN
      IF v_tipo = 'entrada' THEN
        CALL registrar_lancamento_contabil(
          v_data_conciliacao, mes_competencia(v_data_conciliacao), CONCAT('Baixa via conciliação: ', v_desc),
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2)))
          ),
          'conciliacao_baixa', v_id, @lanc_contabil_id
        );
      ELSE
        CALL registrar_lancamento_contabil(
          v_data_conciliacao, mes_competencia(v_data_conciliacao), CONCAT('Baixa via conciliação: ', v_desc),
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_pagar_id, 'tipo', 'debito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2)))
          ),
          'conciliacao_baixa', v_id, @lanc_contabil_id
        );
      END IF;
      SET v_lanc_contabil_id_novo = @lanc_contabil_id;
    END IF;

    INSERT INTO conciliacao_lancamentos (conciliacao_id, lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id)
    VALUES (p_conciliacao_id, v_id, v_valor_aplicado, v_fecha, v_lanc_contabil_id_novo);
  END LOOP;
  CLOSE cur;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- ---------- 4) desfazer_conciliacao: guarda LIFO cobre pagamento parcial manual também ----------
DROP PROCEDURE IF EXISTS desfazer_conciliacao;
DELIMITER $$
CREATE PROCEDURE desfazer_conciliacao(IN p_conciliacao_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_data_conciliacao DATE;
  DECLARE v_status VARCHAR(20);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_fechou_fatura BOOLEAN;
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_estorno_id CHAR(36);
  DECLARE v_itens JSON;
  DECLARE v_bloqueado INT;
  DECLARE cur CURSOR FOR
    SELECT lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id
    FROM conciliacao_lancamentos WHERE conciliacao_id = p_conciliacao_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT data_conciliacao, status INTO v_data_conciliacao, v_status
  FROM conciliacoes WHERE id = p_conciliacao_id;
  IF v_data_conciliacao IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conciliação não encontrada';
  END IF;
  IF v_status <> 'ativa' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conciliação já foi desfeita';
  END IF;
  IF periodo_esta_fechado(v_data_conciliacao) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  -- Bloqueia se alguma fatura deste evento recebeu contribuição
  -- POSTERIOR de outro evento de conciliação ainda ativo OU de um
  -- pagamento parcial manual (baixar_pagamento_parcial, que só grava em
  -- recibo_itens/recibos — não aparece em conciliacao_lancamentos).
  SELECT COUNT(*) INTO v_bloqueado
  FROM conciliacao_lancamentos cl
  WHERE cl.conciliacao_id = p_conciliacao_id
  AND (
    EXISTS (
      SELECT 1 FROM conciliacao_lancamentos cl2
      JOIN conciliacoes c2 ON c2.id = cl2.conciliacao_id AND c2.status = 'ativa'
      WHERE cl2.lancamento_id = cl.lancamento_id AND cl2.criado_em > cl.criado_em
    )
    OR EXISTS (
      SELECT 1 FROM recibo_itens ri
      JOIN recibos r ON r.id = ri.recibo_id
      WHERE ri.lancamento_id = cl.lancamento_id AND r.criado_em > cl.criado_em
    )
  );
  IF v_bloqueado > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma ou mais faturas desta conciliação já receberam outro pagamento depois (conciliação ou baixa manual) — desfaça primeiro o pagamento mais recente dessas faturas';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, conciliacao_id = NULL
  WHERE conciliacao_id = p_conciliacao_id;

  OPEN cur;
  loop_cl: LOOP
    FETCH cur INTO v_lanc_id, v_valor_aplicado, v_fechou_fatura, v_lanc_contabil_id;
    IF v_done THEN LEAVE loop_cl; END IF;

    IF v_lanc_contabil_id IS NOT NULL THEN
      SET v_itens = (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'conta_id', conta_id,
            'tipo', IF(tipo = 'debito', 'credito', 'debito'),
            'valor', valor,
            'descricao', descricao
          )
        )
        FROM lancamentos_contabeis_itens WHERE lancamento_id = v_lanc_contabil_id
      );
      CALL registrar_lancamento_contabil(
        v_data_conciliacao, mes_competencia(v_data_conciliacao),
        'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lanc_id, v_estorno_id
      );
    END IF;

    IF v_fechou_fatura THEN
      UPDATE lancamentos
      SET valor_pago = valor_pago - v_valor_aplicado,
          pago = FALSE, data_pagamento = NULL, conta_id = NULL, conciliacao_id = NULL,
          forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
      WHERE id = v_lanc_id;
    ELSE
      UPDATE lancamentos SET valor_pago = valor_pago - v_valor_aplicado WHERE id = v_lanc_id;
    END IF;
  END LOOP;
  CLOSE cur;

  UPDATE conciliacoes
  SET status = 'desfeita', desfeita_por = @current_usuario_id, desfeita_em = NOW(), motivo_desfazimento = p_motivo
  WHERE id = p_conciliacao_id;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
