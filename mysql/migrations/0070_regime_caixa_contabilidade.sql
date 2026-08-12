-- ============================================================
-- CONTABILIDADE EM REGIME DE CAIXA
--
-- A competência da cobrança continua existindo em `lancamentos` para
-- identificar mensalidades/faturas. Para fins contábeis, porém, receitas e
-- despesas passam a ser reconhecidas exclusivamente na data do efetivo
-- recebimento/pagamento.
--
-- A migração também converte todo o histórico do razão:
--   * remove provisões de contas em aberto;
--   * troca Contas a Receber/Pagar pela conta de resultado do financeiro;
--   * usa a data do evento de caixa como período contábil;
--   * elimina contabilizações de parcelamentos sem entrada (mera novação).
-- ============================================================

DROP FUNCTION IF EXISTS conta_resultado_caixa;
DELIMITER $$
CREATE FUNCTION conta_resultado_caixa(
  p_origem_tipo VARCHAR(50),
  p_origem_id CHAR(36),
  p_natureza VARCHAR(20)
) RETURNS CHAR(36)
READS SQL DATA
BEGIN
  DECLARE v_conta_id CHAR(36);

  IF p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial') THEN
    SELECT l.plano_conta_id INTO v_conta_id
    FROM recibo_itens ri
    JOIN lancamentos l ON l.id = ri.lancamento_id
    WHERE ri.recibo_id = p_origem_id AND l.plano_conta_id IS NOT NULL
    ORDER BY ri.id LIMIT 1;
  ELSE
    SELECT l.plano_conta_id INTO v_conta_id
    FROM lancamentos l
    WHERE l.id = p_origem_id
    LIMIT 1;
  END IF;

  -- Parcelas de acordos antigos não guardavam a categoria na própria linha.
  IF v_conta_id IS NULL THEN
    SELECT original.plano_conta_id INTO v_conta_id
    FROM lancamentos parcela
    JOIN lancamentos original
      ON original.parcelamento_id = parcela.parcelamento_id
     AND original.plano_conta_id IS NOT NULL
    WHERE parcela.id = p_origem_id
    ORDER BY original.data, original.id LIMIT 1;
  END IF;

  IF v_conta_id IS NULL AND p_natureza = 'entrada' THEN
    SELECT id INTO v_conta_id FROM plano_contas WHERE codigo = '4.1.01' LIMIT 1;
  ELSEIF v_conta_id IS NULL AND p_natureza = 'saida' THEN
    SELECT id INTO v_conta_id FROM plano_contas
    WHERE tipo = 'despesa' AND analitica = TRUE ORDER BY codigo LIMIT 1;
  END IF;

  RETURN v_conta_id;
END$$
DELIMITER ;

-- A conciliação antiga só contabilizava quando encontrava uma provisão.
-- Como provisões não existem no regime de caixa, toda alocação conciliada
-- passa a gerar o evento contábil diretamente na data do extrato.
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

    SET v_lanc_contabil_id_novo = NULL;
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

    INSERT INTO conciliacao_lancamentos (conciliacao_id, lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id)
    VALUES (p_conciliacao_id, v_id, v_valor_aplicado, v_fecha, v_lanc_contabil_id_novo);
  END LOOP;
  CLOSE cur;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;


-- Conversão integral do histórico. Estornos continuam válidos porque têm as
-- mesmas contas invertidas; somente a conta transitória é substituída.
UPDATE lancamentos_contabeis
SET competencia = mes_competencia(data);

DELETE FROM lancamentos_contabeis
WHERE origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao');

-- Parcelamento sem entrada não movimenta caixa e, portanto, não é fato
-- contábil no regime de caixa.
DELETE lc FROM lancamentos_contabeis lc
JOIN parcelamentos p ON p.id = lc.origem_id
WHERE lc.origem_tipo = 'parcelamento' AND COALESCE(p.entrada, 0) = 0;

-- Baixas de recebimentos: substitui a conta transitória pela receita que
-- originou a cobrança. Multas, juros, descontos e extras já possuem contas
-- próprias e permanecem intactos.
UPDATE lancamentos_contabeis_itens i
JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id
JOIN plano_contas pc ON pc.id = i.conta_id AND pc.codigo = '1.1.02'
SET i.conta_id = conta_resultado_caixa(lc.origem_tipo, lc.origem_id, 'entrada')
WHERE lc.origem_tipo IN (
  'recibo_baixa', 'recibo_baixa_parcial', 'conciliacao_baixa',
  'conciliacao_estorno', 'parcelamento'
);

-- Baixas de pagamentos: substitui Contas a Pagar pela despesa original.
UPDATE lancamentos_contabeis_itens i
JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id
JOIN plano_contas pc ON pc.id = i.conta_id AND pc.codigo = '2.1.01'
SET i.conta_id = conta_resultado_caixa(lc.origem_tipo, lc.origem_id, 'saida')
WHERE lc.origem_tipo IN ('conta_pagar_baixa', 'conciliacao_baixa', 'conciliacao_estorno');

-- O fechamento anual calculado antes desta conversão deixa de representar o
-- novo razão. Reabre-o para que seja apurado novamente sobre o caixa.
UPDATE fechamentos_exercicio
SET status = 'reaberto', lancamento_transporte_id = NULL,
    resultado_apurado = NULL,
    motivo_reabertura = 'Reabertura automática: conversão integral para regime de caixa',
    reaberto_em = NOW()
WHERE status = 'fechado';

DELETE FROM lancamentos_contabeis
WHERE origem_tipo IN ('fechamento_exercicio', 'fechamento_exercicio_reabertura');

-- Ponto único de entrada do razão. As procedures de tesouraria existentes
-- continuam chamando esta rotina; aqui a provisão é ignorada e as contas
-- transitórias são convertidas para resultado na data do caixa.
DROP PROCEDURE IF EXISTS registrar_lancamento_contabil;
DELIMITER $$
CREATE PROCEDURE registrar_lancamento_contabil(
  IN p_data DATE,
  IN p_competencia DATE,
  IN p_descricao VARCHAR(500),
  IN p_itens JSON,
  IN p_origem_tipo VARCHAR(50),
  IN p_origem_id CHAR(36),
  OUT p_lancamento_id CHAR(36)
)
rotina: BEGIN
  DECLARE v_n INT;
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_analitica BOOLEAN;
  DECLARE v_codigo VARCHAR(20);
  DECLARE v_natureza VARCHAR(20);
  DECLARE v_conta_resultado CHAR(36);
  DECLARE v_soma_debito DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_credito DECIMAL(14,2) DEFAULT 0;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  SET p_lancamento_id = NULL;
  IF p_origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao') THEN
    LEAVE rotina;
  END IF;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;
  IF @current_usuario_id IS NOT NULL
     AND NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão para registrar lançamento contábil';
  END IF;

  SET v_natureza = (SELECT tipo FROM lancamentos WHERE id = p_origem_id LIMIT 1);
  IF p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'parcelamento') THEN
    SET v_natureza = 'entrada';
  END IF;
  SET v_conta_resultado = conta_resultado_caixa(p_origem_tipo, p_origem_id, v_natureza);

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Um lançamento contábil precisa de débito e crédito';
  END IF;

  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
    SET v_codigo = (SELECT codigo FROM plano_contas WHERE id = v_conta_id LIMIT 1);
    IF v_codigo IN ('1.1.02', '2.1.01')
       AND p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'conta_pagar_baixa', 'conciliacao_baixa', 'conciliacao_estorno', 'parcelamento') THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    SELECT analitica INTO v_analitica FROM plano_contas WHERE id = v_conta_id;
    IF v_analitica IS NULL OR NOT v_analitica THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta contábil de caixa inválida ou não analítica';
    END IF;
    IF v_tipo = 'debito' THEN
      SET v_soma_debito = v_soma_debito + v_valor;
    ELSEIF v_tipo = 'credito' THEN
      SET v_soma_credito = v_soma_credito + v_valor;
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tipo de linha contábil inválido';
    END IF;
    SET v_i = v_i + 1;
  END WHILE;
  IF v_soma_debito <> v_soma_credito THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento contábil desbalanceado';
  END IF;

  SET p_lancamento_id = UUID();
  INSERT INTO lancamentos_contabeis
    (id, data, competencia, descricao, origem_tipo, origem_id, criado_por)
  VALUES
    (p_lancamento_id, p_data, mes_competencia(p_data), p_descricao, p_origem_tipo, p_origem_id, @current_usuario_id);

  SET v_i = 0;
  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
    SET v_desc = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].descricao')));
    SET v_codigo = (SELECT codigo FROM plano_contas WHERE id = v_conta_id LIMIT 1);
    IF v_codigo IN ('1.1.02', '2.1.01')
       AND p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'conta_pagar_baixa', 'conciliacao_baixa', 'conciliacao_estorno', 'parcelamento') THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    INSERT INTO lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao)
    VALUES (p_lancamento_id, v_conta_id, v_tipo, v_valor, v_desc);
    SET v_i = v_i + 1;
  END WHILE;
  IF v_own_tx THEN COMMIT; END IF;
END$$
DELIMITER ;
