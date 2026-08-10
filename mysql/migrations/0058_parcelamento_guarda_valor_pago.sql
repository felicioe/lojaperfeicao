-- =========================================
-- criar_parcelamento faltou na varredura de 0048 (pagamento parcial) que
-- adicionou a guarda "fatura com valor_pago > 0 não pode ser baixada
-- integralmente" em baixar_faturas/baixar_conta_pagar. Sem ela, uma fatura
-- de R$150 com R$100 já pagos entrava no acordo de parcelamento pelo valor
-- CHEIO (R$150, e calcular_multa_juros também rodava sobre os R$150) — o
-- irmão ficaria devendo mais do que realmente deve (achado #10 da
-- auditoria financeira).
-- =========================================
DROP PROCEDURE IF EXISTS criar_parcelamento;
DELIMITER $$
CREATE PROCEDURE criar_parcelamento(
  IN p_lancamento_ids JSON,
  IN p_numero_parcelas INT,
  IN p_entrada DECIMAL(14,2),
  IN p_conta_financeira_id CHAR(36),
  IN p_data DATE,
  IN p_incluir_multa_juros BOOLEAN,
  IN p_observacoes TEXT,
  OUT p_parcelamento_id CHAR(36)
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
  DECLARE v_valor_parcelado DECIMAL(14,2);
  DECLARE v_itens JSON;
  DECLARE v_valor_parcela DECIMAL(14,2);
  DECLARE v_acumulado DECIMAL(14,2) DEFAULT 0;
  DECLARE v_desc VARCHAR(500);
  DECLARE v_i INT;
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
  IF p_numero_parcelas IS NULL OR p_numero_parcelas <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Número de parcelas deve ser maior que zero';
  END IF;

  SELECT COUNT(DISTINCT irmao_id) INTO v_n_irmaos FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO v_irmao_id FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) LIMIT 1;

  IF EXISTS (SELECT 1 FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND (tipo <> 'entrada' OR pago OR valor_pago > 0)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura selecionada já está paga, já tem pagamento parcial registrado, ou não é uma fatura em aberto';
  END IF;

  IF COALESCE(p_entrada, 0) > 0 THEN
    IF p_conta_financeira_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe a conta que recebeu a entrada';
    END IF;
    SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
    IF v_plano_conta_banco IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
    END IF;
  END IF;

  SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';
  SELECT id INTO v_multas_juros_id FROM plano_contas WHERE codigo = '4.1.06';

  OPEN cur;
  calc_loop: LOOP
    FETCH cur INTO v_id, v_valor, v_vencimento;
    IF v_done THEN LEAVE calc_loop; END IF;
    CALL calcular_multa_juros(v_valor, v_vencimento, p_data, v_multa, v_juros, v_dias, v_calc_total);
    SET v_soma_original = v_soma_original + v_valor;
    IF p_incluir_multa_juros THEN
      SET v_soma_multa = v_soma_multa + v_multa;
      SET v_soma_juros = v_soma_juros + v_juros;
    END IF;
  END LOOP;
  CLOSE cur;

  SET v_valor_parcelado = v_soma_original + v_soma_multa + v_soma_juros - COALESCE(p_entrada, 0);
  IF v_valor_parcelado < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Entrada maior que o valor total a parcelar';
  END IF;

  SET p_parcelamento_id = UUID();
  INSERT INTO parcelamentos (
    id, irmao_id, data, valor_original, valor_multa, valor_juros, entrada,
    valor_parcelado, numero_parcelas, observacoes, criado_por
  ) VALUES (
    p_parcelamento_id, v_irmao_id, p_data, v_soma_original, v_soma_multa, v_soma_juros, COALESCE(p_entrada, 0),
    v_valor_parcelado, p_numero_parcelas, p_observacoes, @current_usuario_id
  );

  UPDATE lancamentos
  SET pago = TRUE, parcelado = TRUE, parcelamento_id = p_parcelamento_id, data_pagamento = p_data
  WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));

  IF COALESCE(p_entrada, 0) > 0 THEN
    INSERT INTO lancamentos (
      data, data_vencimento, descricao, valor, tipo, irmao_id,
      pago, data_pagamento, conta_id, forma_pagamento, parcelamento_id, is_mensalidade
    ) VALUES (
      p_data, p_data, 'Entrada — acordo de parcelamento', p_entrada, 'entrada', v_irmao_id,
      TRUE, p_data, p_conta_financeira_id, 'entrada_parcelamento', p_parcelamento_id, FALSE
    );
  END IF;

  SET v_i = 1;
  WHILE v_i <= p_numero_parcelas DO
    IF v_i = p_numero_parcelas THEN
      SET v_valor_parcela = v_valor_parcelado - v_acumulado;
    ELSE
      SET v_valor_parcela = ROUND(v_valor_parcelado / p_numero_parcelas, 2);
      SET v_acumulado = v_acumulado + v_valor_parcela;
    END IF;
    SET v_desc = CONCAT('Parcela ', v_i, '/', p_numero_parcelas, ' — Acordo ', DATE_FORMAT(p_data, '%d/%m/%Y'));

    INSERT INTO lancamentos (
      data, data_vencimento, descricao, valor, tipo, irmao_id,
      pago, parcelamento_id, is_mensalidade
    ) VALUES (
      p_data, DATE_ADD(p_data, INTERVAL v_i MONTH), v_desc, v_valor_parcela, 'entrada', v_irmao_id,
      FALSE, p_parcelamento_id, FALSE
    );

    SET v_i = v_i + 1;
  END WHILE;

  SET v_itens = JSON_ARRAY(JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'debito', 'valor', CAST(v_valor_parcelado AS DECIMAL(14,2))));
  IF COALESCE(p_entrada, 0) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(p_entrada AS DECIMAL(14,2))));
  END IF;
  SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_soma_original AS DECIMAL(14,2))));
  IF (v_soma_multa + v_soma_juros) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_multas_juros_id, 'tipo', 'credito', 'valor', CAST(v_soma_multa + v_soma_juros AS DECIMAL(14,2))));
  END IF;

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data),
    'Parcelamento de faturas em atraso', v_itens, 'parcelamento', p_parcelamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
