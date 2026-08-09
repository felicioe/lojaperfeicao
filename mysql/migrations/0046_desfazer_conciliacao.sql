-- =========================================
-- DESFAZER CONCILIAÇÃO (issue #124) — reverte um evento de conciliação
-- feito por engano: volta a(s) linha(s) OFX pra pendente, volta o(s)
-- lançamento(s) pra em aberto, e estorna a contrapartida contábil que a
-- baixa gerou (mesmo padrão de estorno de reabrir_exercicio, 0005).
-- =========================================
ALTER TABLE conciliacoes
  ADD COLUMN status ENUM('ativa', 'desfeita') NOT NULL DEFAULT 'ativa',
  ADD COLUMN desfeita_por CHAR(36) NULL,
  ADD COLUMN desfeita_em DATETIME NULL DEFAULT NULL,
  ADD COLUMN motivo_desfazimento TEXT NULL;

DROP PROCEDURE IF EXISTS desfazer_conciliacao;
DELIMITER $$
CREATE PROCEDURE desfazer_conciliacao(IN p_conciliacao_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_data_conciliacao DATE;
  DECLARE v_status VARCHAR(20);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_estorno_id CHAR(36);
  DECLARE v_itens JSON;
  DECLARE cur CURSOR FOR SELECT id FROM lancamentos WHERE conciliacao_id = p_conciliacao_id;
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

  UPDATE ofx_lancamentos SET conciliado = FALSE, conciliacao_id = NULL
  WHERE conciliacao_id = p_conciliacao_id;

  OPEN cur;
  loop_lanc: LOOP
    FETCH cur INTO v_lanc_id;
    IF v_done THEN LEAVE loop_lanc; END IF;

    SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
    WHERE origem_tipo = 'conciliacao_baixa' AND origem_id = v_lanc_id
    LIMIT 1;

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
      SET v_lanc_contabil_id = NULL;
    END IF;

    UPDATE lancamentos
    SET pago = FALSE, data_pagamento = NULL, conta_id = NULL, conciliacao_id = NULL,
        forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
    WHERE id = v_lanc_id;
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
