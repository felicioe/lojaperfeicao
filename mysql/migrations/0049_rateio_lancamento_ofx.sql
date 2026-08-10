-- Issue #137: rateio de lançamento avulso do OFX entre várias contas
-- contábeis (ex.: mensalidade + juros recebidos juntos no mesmo depósito).
--
-- Reaproveita o mesmo modelo de conciliacoes/conciliacao_lancamentos usado
-- por conciliar_ofx_lote (issue #110) em vez de inventar um esquema novo:
-- cada item do rateio vira um lançamento próprio, 100% pago na criação, e
-- todos entram juntos num evento de conciliação — o que dá de graça o
-- "desfazer" via desfazer_conciliacao (já existente) e a exibição correta
-- no relatório de extrato da conciliação (issue #113, caso "lote"), sem
-- precisar mexer em nenhum dos dois.
--
-- Diferente do fluxo de baixa (conciliar_ofx_lote), aqui os lançamentos
-- não existem ainda — são criados na hora, um por item do rateio, cada um
-- com sua própria contrapartida contábil banco<->categoria (mesmo padrão
-- de criar_lancamento_de_ofx, só que repetido por item em vez de uma vez
-- só pro valor cheio da linha OFX).

DROP PROCEDURE IF EXISTS criar_lancamentos_de_ofx_rateado;
DELIMITER $$
CREATE PROCEDURE criar_lancamentos_de_ofx_rateado(
  IN p_ofx_id CHAR(36),
  IN p_itens JSON,
  OUT p_conciliacao_id CHAR(36)
)
BEGIN
  DECLARE v_conta_financeira_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao_ofx VARCHAR(500);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_valor_abs DECIMAL(14,2);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_qtd_itens INT;
  DECLARE v_qtd_validos INT;
  DECLARE v_soma_itens DECIMAL(14,2);
  DECLARE v_item_id CHAR(36);
  DECLARE v_plano_conta_id CHAR(36);
  DECLARE v_categoria VARCHAR(20);
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_valor_item DECIMAL(14,2);
  DECLARE v_descricao_item VARCHAR(500);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_itens_contabeis JSON;
  DECLARE v_lanc_contabil_id_novo CHAR(36);
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT jt.plano_conta_id, jt.categoria, jt.irmao_id, jt.valor, jt.descricao
    FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
      plano_conta_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.plano_conta_id',
      categoria VARCHAR(20) PATH '$.categoria',
      irmao_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.irmao_id',
      valor DECIMAL(14,2) PATH '$.valor',
      descricao VARCHAR(500) PATH '$.descricao'
    )) jt;
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
  IF p_itens IS NULL OR JSON_LENGTH(p_itens) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe ao menos um item do rateio';
  END IF;

  SELECT conta_financeira_id, data, valor, descricao INTO v_conta_financeira_id, v_data, v_valor, v_descricao_ofx
  FROM ofx_lancamentos WHERE id = p_ofx_id AND NOT conciliado FOR UPDATE;
  IF v_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = v_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SET v_valor_abs = ABS(v_valor);
  SET v_tipo = CASE WHEN v_valor >= 0 THEN 'entrada' ELSE 'saida' END;

  SELECT COUNT(*), COALESCE(SUM(valor), 0) INTO v_qtd_itens, v_soma_itens
  FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(valor DECIMAL(14,2) PATH '$.valor')) jt;
  IF v_soma_itens <> v_valor_abs THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A soma dos itens do rateio precisa bater exatamente com o valor da linha do extrato';
  END IF;

  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
      plano_conta_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.plano_conta_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  WHERE jt.plano_conta_id IS NOT NULL AND jt.valor > 0;
  IF v_qtd_validos <> v_qtd_itens THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cada item do rateio precisa de uma categoria contábil e valor maior que zero';
  END IF;

  SET p_conciliacao_id = UUID();
  INSERT INTO conciliacoes (id, conta_financeira_id, data_conciliacao, valor_total, criado_por)
  VALUES (p_conciliacao_id, v_conta_financeira_id, v_data, v_valor_abs, @current_usuario_id);

  UPDATE ofx_lancamentos SET conciliado = TRUE, conciliacao_id = p_conciliacao_id WHERE id = p_ofx_id;

  OPEN cur;
  loop_itens: LOOP
    FETCH cur INTO v_plano_conta_id, v_categoria, v_irmao_id, v_valor_item, v_descricao_item;
    IF v_done THEN LEAVE loop_itens; END IF;

    SET v_desc = COALESCE(v_descricao_item, v_descricao_ofx, 'Lançamento importado do extrato');
    SET v_item_id = UUID();

    INSERT INTO lancamentos (
      id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
      irmao_id, categoria_recebimento, pago, conciliacao_id, criado_por
    ) VALUES (
      v_item_id, v_data, v_data, v_desc, v_valor_item, v_valor_item, v_tipo, v_conta_financeira_id, v_plano_conta_id,
      v_irmao_id, CASE WHEN v_tipo = 'entrada' THEN v_categoria ELSE NULL END, TRUE, p_conciliacao_id, @current_usuario_id
    );

    IF v_tipo = 'entrada' THEN
      SET v_itens_contabeis = JSON_ARRAY(
        JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_item AS DECIMAL(14,2))),
        JSON_OBJECT('conta_id', v_plano_conta_id, 'tipo', 'credito', 'valor', CAST(v_valor_item AS DECIMAL(14,2)))
      );
    ELSE
      SET v_itens_contabeis = JSON_ARRAY(
        JSON_OBJECT('conta_id', v_plano_conta_id, 'tipo', 'debito', 'valor', CAST(v_valor_item AS DECIMAL(14,2))),
        JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_item AS DECIMAL(14,2)))
      );
    END IF;

    CALL registrar_lancamento_contabil(v_data, mes_competencia(v_data), v_desc, v_itens_contabeis, 'ofx_importado', v_item_id, v_lanc_contabil_id_novo);

    INSERT INTO conciliacao_lancamentos (conciliacao_id, lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id)
    VALUES (p_conciliacao_id, v_item_id, v_valor_item, TRUE, v_lanc_contabil_id_novo);
  END LOOP;
  CLOSE cur;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
