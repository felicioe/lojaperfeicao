-- =========================================
-- Motivo obrigatório e rastro de reabertura do orçamento (issue #590 da
-- reavaliação do módulo de orçamento).
--
-- reabrir_periodo e reabrir_exercicio já exigem motivo obrigatório e
-- registram quem/quando/por quê reabriu. A reescrita de reabrir_orcamento
-- em 0149 (pra incrementar `versao`) manteve o comportamento original de
-- 0096 nesse ponto — sem motivo, sem rastro — deixando o único fluxo de
-- aprovação/reabertura do módulo financeiro sem essa garantia de auditoria.
--
-- Como orcamento_versoes já guarda uma linha por versão aprovada, o rastro
-- de reabertura fica nela mesma (a reabertura sempre fecha a versão
-- corrente antes de incrementar `orcamentos.versao`), sem precisar de uma
-- tabela de eventos separada.
-- =========================================
ALTER TABLE orcamento_versoes
  ADD COLUMN reaberto_por CHAR(36) NULL,
  ADD COLUMN reaberto_em DATETIME NULL,
  ADD COLUMN motivo_reabertura TEXT NULL;

DROP PROCEDURE IF EXISTS reabrir_orcamento;
DELIMITER $$
CREATE PROCEDURE reabrir_orcamento(IN p_orcamento_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_versao INT;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o orçamento';
  END IF;
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo da reabertura';
  END IF;

  SELECT versao INTO v_versao FROM orcamentos
   WHERE id = p_orcamento_id AND status = 'aprovado' AND loja_id = @current_loja_id;
  IF v_versao IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou não está aprovado';
  END IF;

  UPDATE orcamento_versoes
     SET reaberto_por = @current_usuario_id, reaberto_em = NOW(), motivo_reabertura = p_motivo
   WHERE orcamento_id = p_orcamento_id AND versao = v_versao AND loja_id = @current_loja_id;

  UPDATE orcamentos
     SET status = 'rascunho', aprovado_por = NULL, aprovado_em = NULL, versao = versao + 1
   WHERE id = p_orcamento_id AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$
DELIMITER ;
