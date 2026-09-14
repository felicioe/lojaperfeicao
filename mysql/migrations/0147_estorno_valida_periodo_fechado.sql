-- =============================================================================
-- Migração 0147: estorno de transferência passa a validar período fechado
-- (issue #577 da auditoria de contabilidade x financeiro)
--
-- CONTEXTO. `atualizar_transferencia` (0129) termina com um UPDATE em
-- `lancamentos`, o que dispara trg_lancamentos_bloqueia_periodo_fechado_update
-- (0045) e bloqueia a edição se a data original estiver num período/exercício
-- já fechado — de graça. `estornar_transferencia` (também 0129), porém, só
-- faz DELETEs (contábil e depois `lancamentos`) e não termina em INSERT/UPDATE
-- nenhum: nenhum trigger dispara, então hoje é possível excluir uma
-- transferência datada dentro de um período já fechado sem reabri-lo,
-- alterando retroativamente o balancete de um período encerrado.
--
-- Corrige adicionando a mesma checagem já usada em desfazer_conciliacao e
-- desfazer_lancamento_ofx: `periodo_esta_fechado(data)` explícito no início
-- da procedure, antes de qualquer DELETE.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS estornar_transferencia$$
CREATE PROCEDURE estornar_transferencia(
  IN p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_data DATE;
  DECLARE v_conciliada BOOLEAN;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT tipo, data INTO v_tipo, v_data FROM lancamentos
   WHERE id = p_lancamento_id AND loja_id = @current_loja_id
   FOR UPDATE;
  IF v_tipo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transferência não encontrada';
  END IF;
  IF v_tipo <> 'transferencia' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento não é uma transferência';
  END IF;
  IF periodo_esta_fechado(v_data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Esta transferência pertence a um período/exercício contábil já encerrado — reabra o fechamento antes de excluir';
  END IF;

  SELECT
    EXISTS(SELECT 1 FROM ofx_lancamentos o
            WHERE o.loja_id = @current_loja_id AND o.lancamento_id = p_lancamento_id)
    OR EXISTS(SELECT 1 FROM conciliacao_lancamentos cl
                JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id
               WHERE cl.lancamento_id = p_lancamento_id AND cl.loja_id = @current_loja_id
                 AND c.status = 'ativa')
    INTO v_conciliada;
  IF v_conciliada THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Esta transferência já foi conciliada com uma linha do extrato — desfaça a conciliação antes de excluir';
  END IF;

  DELETE lci FROM lancamentos_contabeis_itens lci
    JOIN lancamentos_contabeis lc ON lc.id = lci.lancamento_id
   WHERE lci.loja_id = @current_loja_id AND lc.loja_id = @current_loja_id
     AND lc.origem_tipo = 'transferencia' AND lc.origem_id = p_lancamento_id;
  DELETE FROM lancamentos_contabeis
   WHERE loja_id = @current_loja_id AND origem_tipo = 'transferencia' AND origem_id = p_lancamento_id;

  DELETE FROM lancamentos WHERE id = p_lancamento_id AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
