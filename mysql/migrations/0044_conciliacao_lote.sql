-- =========================================
-- CONCILIAÇÃO EM LOTE (issue #110) — hoje a conciliação só aceita 1 linha
-- do extrato OFX pra 1 lançamento do sistema (conciliar_ofx_baixando_lancamento).
-- Na prática isso não cobre o caso comum de um PIX único cobrindo várias
-- mensalidades, ou o inverso (dois depósitos parciais fechando uma fatura
-- só). `conciliacoes` é o registro do "evento" de conciliação: agrupa N
-- linhas OFX e M lançamentos do sistema cujos totais batem exatamente.
-- Cada linha OFX e cada lançamento só pode pertencer a um evento (uma vez
-- conciliado/pago, não entra em outro lote), por isso basta uma FK
-- opcional em cada tabela em vez de uma tabela de junção N:N.
-- =========================================
CREATE TABLE IF NOT EXISTS conciliacoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  conta_financeira_id CHAR(36) NOT NULL,
  data_conciliacao DATE NOT NULL DEFAULT (CURRENT_DATE),
  valor_total DECIMAL(14,2) NOT NULL,
  criado_por CHAR(36),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_conciliacoes_conta FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_conciliacoes_conta_data ON conciliacoes (conta_financeira_id, data_conciliacao);

ALTER TABLE ofx_lancamentos
  ADD COLUMN conciliacao_id CHAR(36) NULL,
  ADD CONSTRAINT fk_ofx_conciliacao FOREIGN KEY (conciliacao_id) REFERENCES conciliacoes(id) ON DELETE SET NULL;

ALTER TABLE lancamentos
  ADD COLUMN conciliacao_id CHAR(36) NULL,
  ADD CONSTRAINT fk_lancamentos_conciliacao FOREIGN KEY (conciliacao_id) REFERENCES conciliacoes(id) ON DELETE SET NULL;
CREATE INDEX idx_lancamentos_conciliacao ON lancamentos (conciliacao_id);

-- Mesma lógica contábil de conciliar_ofx_baixando_lancamento (0026), só
-- que iterando sobre um lote de lançamentos via cursor (mesmo padrão de
-- baixar_faturas) em vez de um único id. A exigência de "os totais sempre
-- batem" é validada aqui dentro (soma das linhas OFX == soma dos
-- lançamentos, com entrada positiva/saída negativa), não só na UI —
-- dinheiro não confia só em validação client-side.
DROP PROCEDURE IF EXISTS conciliar_ofx_lote;
DELIMITER $$
CREATE PROCEDURE conciliar_ofx_lote(
  IN p_ofx_ids JSON,
  IN p_lancamento_ids JSON,
  OUT p_conciliacao_id CHAR(36)
)
BEGIN
  DECLARE v_soma_ofx DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_lanc DECIMAL(14,2) DEFAULT 0;
  DECLARE v_qtd_ofx INT;
  DECLARE v_qtd_ofx_validas INT;
  DECLARE v_qtd_lanc INT;
  DECLARE v_qtd_lanc_validos INT;
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
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR SELECT id, tipo, valor, descricao FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
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
  IF p_ofx_ids IS NULL OR JSON_LENGTH(p_ofx_ids) = 0 OR p_lancamento_ids IS NULL OR JSON_LENGTH(p_lancamento_ids) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos um item de cada lado';
  END IF;
  SET v_qtd_ofx = JSON_LENGTH(p_ofx_ids);
  SET v_qtd_lanc = JSON_LENGTH(p_lancamento_ids);

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

  SELECT COUNT(*) INTO v_qtd_lanc_validos
  FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND pago = FALSE AND tipo IN ('entrada', 'saida');
  IF v_qtd_lanc_validos <> v_qtd_lanc THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Algum lançamento selecionado já está pago ou não é uma entrada/saída em aberto';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = v_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) INTO v_soma_lanc
  FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));

  IF v_soma_ofx <> v_soma_lanc THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O total do extrato selecionado não bate com o total dos lançamentos selecionados';
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
    FETCH cur INTO v_id, v_tipo, v_valor, v_desc;
    IF v_done THEN LEAVE loop_lanc; END IF;

    UPDATE lancamentos
    SET pago = TRUE, data_pagamento = v_data_conciliacao, conta_id = v_conta_financeira_id,
        forma_pagamento = COALESCE(forma_pagamento, 'Conciliação OFX'), conciliacao_id = p_conciliacao_id
    WHERE id = v_id;

    SELECT EXISTS(
      SELECT 1 FROM lancamentos_contabeis
      WHERE origem_id = v_id AND origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao')
    ) INTO v_tem_provisao;

    IF v_tem_provisao THEN
      IF v_tipo = 'entrada' THEN
        CALL registrar_lancamento_contabil(
          v_data_conciliacao, mes_competencia(v_data_conciliacao), CONCAT('Baixa via conciliação: ', v_desc),
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_valor AS DECIMAL(14,2)))
          ),
          'conciliacao_baixa', v_id, @lanc_contabil_id
        );
      ELSE
        CALL registrar_lancamento_contabil(
          v_data_conciliacao, mes_competencia(v_data_conciliacao), CONCAT('Baixa via conciliação: ', v_desc),
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_pagar_id, 'tipo', 'debito', 'valor', CAST(v_valor AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor AS DECIMAL(14,2)))
          ),
          'conciliacao_baixa', v_id, @lanc_contabil_id
        );
      END IF;
    END IF;
  END LOOP;
  CLOSE cur;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
