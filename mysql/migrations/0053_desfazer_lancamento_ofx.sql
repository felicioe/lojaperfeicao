-- =========================================
-- DESFAZER CONCILIAÇÃO — CASO "LEGADO" (linha do OFX vinculada a 1
-- lançamento só, sem passar por conciliar_ofx_lote/criar_lancamentos_de_
-- ofx_rateado, então sem registro em `conciliacoes`) — desfazer_conciliacao
-- (0046) só sabe desfazer eventos com conciliacao_id; essas linhas nunca
-- tinham como ser desfeitas pela UI, mesmo aparecendo como "Conciliado" no
-- relatório de Extrato da Conciliação.
--
-- Duas origens possíveis pra esse vínculo, tratadas de forma diferente:
--  - criar_lancamento_de_ofx: o lançamento só existe por causa dessa linha
--    do extrato (criado + contabilizado junto) — desfazer é reverter a
--    contrapartida e apagar o lançamento inteiro. Identificado pela
--    existência de um lancamentos_contabeis com origem_tipo='ofx_importado'
--    apontando pro lançamento.
--  - conciliar_ofx_existente (fluxo legado, hoje sem UI que o acione, mas
--    pode existir em dados antigos): só vinculou a linha a um lançamento
--    JÁ existente, sem criar nem alterar nada nele — desfazer é só
--    desvincular, sem tocar no lançamento.
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

  SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
  WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lancamento_id
  LIMIT 1;

  UPDATE ofx_lancamentos SET conciliado = FALSE, lancamento_id = NULL WHERE id = p_ofx_id;

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
  END IF;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
