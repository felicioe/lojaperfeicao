-- =========================================
-- Snapshot de aprovação do orçamento passa a incluir contas orçadas como
-- zero (issue #593 da reavaliação do módulo de orçamento).
--
-- aprovar_orcamento (0149) filtrava `valor <> 0` ao copiar orcamento_itens/
-- orcamento_caixa_itens para orcamento_versoes_itens, fazendo uma conta
-- orçada explicitamente como R$ 0,00 ficar indistinguível de uma conta que
-- nunca foi tocada. Como as duas tabelas só têm uma linha por conta/mês
-- quando o usuário efetivamente definiu um valor (mesmo que zero), não há
-- ganho em filtrar — remove o filtro pra preservar o dado real do
-- snapshot.
-- =========================================
DROP PROCEDURE IF EXISTS aprovar_orcamento;
DELIMITER $$
CREATE PROCEDURE aprovar_orcamento(IN p_orcamento_id CHAR(36))
BEGIN
  DECLARE v_versao INT;
  DECLARE v_versao_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin aprova o orçamento';
  END IF;

  SELECT versao INTO v_versao FROM orcamentos
   WHERE id = p_orcamento_id AND status = 'rascunho' AND loja_id = @current_loja_id;
  IF v_versao IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou já aprovado';
  END IF;

  SET v_versao_id = UUID();
  INSERT INTO orcamento_versoes (id, loja_id, orcamento_id, versao, aprovado_por, aprovado_em)
  VALUES (v_versao_id, @current_loja_id, p_orcamento_id, v_versao, @current_usuario_id, NOW());

  INSERT INTO orcamento_versoes_itens (loja_id, orcamento_versao_id, regime, conta_id, mes, valor)
  SELECT @current_loja_id, v_versao_id, 'competencia', conta_id, mes, valor
  FROM orcamento_itens WHERE orcamento_id = p_orcamento_id AND loja_id = @current_loja_id;

  INSERT INTO orcamento_versoes_itens (loja_id, orcamento_versao_id, regime, conta_id, mes, valor)
  SELECT @current_loja_id, v_versao_id, 'caixa', conta_id, mes, valor
  FROM orcamento_caixa_itens WHERE orcamento_id = p_orcamento_id AND loja_id = @current_loja_id;

  UPDATE orcamentos SET status = 'aprovado', aprovado_por = @current_usuario_id, aprovado_em = NOW()
  WHERE id = p_orcamento_id AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$
DELIMITER ;
