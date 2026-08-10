-- =========================================
-- desfazer_lancamento_ofx (0053) só sabia reverter o caso "lançamento
-- criado pela própria importação OFX" (origem_tipo='ofx_importado').
-- O caso "linha do OFX baixou um lançamento JÁ EXISTENTE"
-- (conciliar_ofx_baixando_lancamento, 0026 — hoje sem UI que o acione,
-- só afeta dados históricos) posta a contrapartida com origem_tipo=
-- 'conciliacao_baixa', não 'ofx_importado' — "Desfazer" nesse caso só
-- desvinculava a linha do OFX, sem reabrir o lançamento nem estornar a
-- contabilidade: o lançamento continuava pago=TRUE, a linha do extrato
-- voltava a aparecer como pendente e podia ser conciliada de novo contra
-- a mesma fatura, sem avisar de nada (achado #12 da auditoria financeira).
-- =========================================
DROP PROCEDURE IF EXISTS desfazer_lancamento_ofx;
DELIMITER $$
CREATE PROCEDURE desfazer_lancamento_ofx(IN p_ofx_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_lancamento_id CHAR(36);
  DECLARE v_conciliacao_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_lanc_contabil_id CHAR(36);
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
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT lancamento_id, conciliacao_id, data INTO v_lancamento_id, v_conciliacao_id, v_data
  FROM ofx_lancamentos WHERE id = p_ofx_id AND conciliado = TRUE;
  IF v_lancamento_id IS NULL AND v_conciliacao_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha do extrato não encontrada ou não está conciliada';
  END IF;
  IF v_conciliacao_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta linha faz parte de um evento de conciliação em lote — use desfazer_conciliacao';
  END IF;
  IF periodo_esta_fechado(v_data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, lancamento_id = NULL WHERE id = p_ofx_id;

  -- Caso 1: lançamento CRIADO por essa importação (criar_lancamento_de_ofx)
  -- — desfazer é estornar e apagar o lançamento inteiro.
  SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
  WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lancamento_id
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
      v_data, mes_competencia(v_data), 'Estorno de lançamento criado via conciliação (desfeito)',
      v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
    );
    DELETE FROM lancamentos WHERE id = v_lancamento_id;
  ELSE
    -- Caso 2 (legado): lançamento JÁ EXISTIA e foi baixado por essa linha
    -- (conciliar_ofx_baixando_lancamento) — desfazer é estornar a
    -- contrapartida (se houver — lançamento manual não tem provisão) e
    -- reabrir o lançamento, igual desfazer_conciliacao faz pro caso
    -- equivalente em lote.
    SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
    WHERE origem_tipo = 'conciliacao_baixa' AND origem_id = v_lancamento_id
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
        v_data, mes_competencia(v_data), 'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
      );
    END IF;

    UPDATE lancamentos
    SET pago = FALSE, valor_pago = 0, data_pagamento = NULL, conta_id = NULL,
        forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
    WHERE id = v_lancamento_id;
  END IF;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
