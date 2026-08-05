-- =========================================
-- BAIXA DE FATURAS — juros adicional e outra receita. O usuário pediu pra
-- "manutenção de faturas" cobrir, além de editar/estornar (já existentes),
-- poder incluir na baixa um juros/multa manual (além do que a fórmula de
-- calcular_multa_juros calcula sozinha) e um valor extra recebido junto
-- que pertence a outra conta de receita (ex.: doação junto com a
-- mensalidade) — tudo isso precisa virar lançamento contábil de partida
-- dobrada, igual ao resto da baixa.
--
-- recibos ganha duas colunas pra registrar esse extra de forma rastreável
-- (não só embutido em observações): valor_extra e a conta de receita pra
-- onde ele foi lançado.
-- =========================================
ALTER TABLE recibos
  ADD COLUMN valor_extra DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER desconto,
  ADD COLUMN plano_conta_extra_id CHAR(36) NULL AFTER valor_extra,
  ADD CONSTRAINT fk_recibos_plano_extra FOREIGN KEY (plano_conta_extra_id) REFERENCES plano_contas(id) ON DELETE SET NULL;

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

  SELECT COUNT(DISTINCT irmao_id) INTO v_n_irmaos FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO v_irmao_id FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) LIMIT 1;

  IF EXISTS (SELECT 1 FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND (tipo <> 'entrada' OR pago)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura selecionada já está paga ou não é uma fatura em aberto';
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
    SET pago = TRUE, data_pagamento = p_data_pagamento, conta_id = p_conta_financeira_id,
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
