-- =========================================
-- PAGAMENTO PARCIAL DE FATURAS (issue #131) — o usuário quer poder
-- compensar um depósito com faturas parciais e negociar pagamentos
-- parciais, tanto na baixa manual quanto na conciliação bancária, com
-- sugestão automática de alocação (mais antigas primeiro) editável
-- manualmente antes de confirmar.
--
-- `lancamentos` ganha `valor_pago`: `pago` continua boolean e só vira
-- TRUE quando `valor_pago >= valor` (saldo chega a zero) — todo o resto
-- do sistema que já filtra por `pago = FALSE` continua funcionando sem
-- mudança (uma fatura parcialmente paga continua "em aberto", só que
-- com saldo residual em vez do valor cheio).
--
-- Esse fluxo mexe só no principal da fatura — multa/juros calculados
-- automaticamente continuam exclusivos da baixa integral (baixar_faturas,
-- inalterado aqui).
-- =========================================
ALTER TABLE lancamentos
  ADD COLUMN valor_pago DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER valor;
UPDATE lancamentos SET valor_pago = valor WHERE pago = TRUE;

-- Uma fatura agora pode receber contribuições de mais de um evento de
-- conciliação ao longo do tempo (parcial hoje, quitação depois), então a
-- FK única lancamentos.conciliacao_id (que só aponta pro evento que
-- FECHOU a fatura, ver conciliar_ofx_lote abaixo) não é suficiente pra
-- saber o que cada evento fez — precisa de uma tabela de junção.
-- lancamento_contabil_id grava exatamente qual lançamento contábil cada
-- linha gerou (se gerou), pra desfazer_conciliacao estornar o lançamento
-- certo sem ambiguidade quando o mesmo lancamento_id aparece em mais de
-- um evento.
CREATE TABLE IF NOT EXISTS conciliacao_lancamentos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  conciliacao_id CHAR(36) NOT NULL,
  lancamento_id CHAR(36) NOT NULL,
  valor_aplicado DECIMAL(14,2) NOT NULL,
  fechou_fatura BOOLEAN NOT NULL DEFAULT FALSE,
  lancamento_contabil_id CHAR(36) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_concil_lanc_concil FOREIGN KEY (conciliacao_id) REFERENCES conciliacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_concil_lanc_lanc FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id)
) ENGINE=InnoDB;
CREATE INDEX idx_concil_lanc_lanc ON conciliacao_lancamentos (lancamento_id);
CREATE INDEX idx_concil_lanc_concil ON conciliacao_lancamentos (conciliacao_id);

-- Backfill: todo evento de conciliação até hoje sempre bateu o valor
-- cheio (exigência que só agora fica opcional), então cada lançamento já
-- vinculado fechou a fatura com o valor integral dele.
INSERT INTO conciliacao_lancamentos (conciliacao_id, lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id)
SELECT l.conciliacao_id, l.id, l.valor, TRUE,
       (SELECT lc.id FROM lancamentos_contabeis lc
        WHERE lc.origem_tipo = 'conciliacao_baixa' AND lc.origem_id = l.id LIMIT 1)
FROM lancamentos l
WHERE l.conciliacao_id IS NOT NULL;

-- =========================================
-- Baixa manual com alocação parcial (novo — baixar_faturas continua
-- existindo do jeito que está para a baixa integral com multa/juros).
-- p_alocacao: [{"lancamento_id": "...", "valor": 100.00}, ...] onde
-- `valor` é quanto aplicar nessa fatura agora (pode ser menor que o
-- saldo dela = fica parcial; se cobrir o saldo, fecha).
-- =========================================
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

  SELECT COUNT(*) INTO v_qtd_alocacao
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt;

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

-- =========================================
-- Conciliação em lote com alocação parcial — troca p_lancamento_ids
-- (exigia soma exata) por p_alocacao (mesmo formato do procedure acima),
-- que também cobre o caso de valor exato (cada item aplica o saldo
-- cheio). Continua exigindo que a soma do lado OFX bata com a soma do
-- lado alocação (dinheiro não confia só em validação client-side), só
-- que agora a soma alocada pode ser menor que o valor de face das
-- faturas selecionadas.
-- =========================================
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
  SELECT COUNT(*) INTO v_qtd_alocacao
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt;

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

-- =========================================
-- Desfazer conciliação (issue #124), reescrito pra ler de
-- conciliacao_lancamentos em vez de lancamentos.conciliacao_id — com
-- pagamento parcial uma fatura pode ter passado por mais de um evento,
-- então precisa desfazer só a contribuição DESTE evento (não zerar a
-- fatura inteira) e usar o lancamento_contabil_id exato gravado na
-- linha, sem adivinhar por origem_tipo+origem_id (que agora pode
-- aparecer mais de uma vez pro mesmo lançamento).
--
-- Guarda de segurança: só deixa desfazer se nenhuma das faturas deste
-- evento recebeu contribuição de um evento mais recente ainda ativo —
-- senão desfazer um evento antigo poderia deixar `pago=TRUE` com
-- `valor_pago` incoerente (fatura fechada por um evento posterior que
-- contava com a contribuição deste). É preciso desfazer na ordem
-- inversa (mais recente primeiro).
-- =========================================
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

  SELECT COUNT(*) INTO v_bloqueado
  FROM conciliacao_lancamentos cl
  JOIN conciliacao_lancamentos cl2
    ON cl2.lancamento_id = cl.lancamento_id AND cl2.criado_em > cl.criado_em
  JOIN conciliacoes c2 ON c2.id = cl2.conciliacao_id AND c2.status = 'ativa'
  WHERE cl.conciliacao_id = p_conciliacao_id;
  IF v_bloqueado > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma ou mais faturas desta conciliação já receberam outro pagamento depois — desfaça primeiro a conciliação mais recente dessas faturas';
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
