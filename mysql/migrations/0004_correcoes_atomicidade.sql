-- =========================================
-- Correção de atomicidade: ativar_gestao (issue #50/0002_cadastros.sql).
--
-- Achado durante a revisão criteriosa da issue #51: qualquer stored
-- procedure MySQL/MariaDB que faça mais de uma escrita não é atômica por
-- padrão (diferente do Postgres, onde cada chamada de função já é uma
-- transação implícita) — se uma escrita no meio falhar, as anteriores já
-- foram commitadas e ficam "penduradas". Esse mesmo problema foi encontrado
-- e corrigido em todas as procedures de 0003_contabil_tesouraria.sql
-- (ex.: uma fatura avulsa com rateio inválido chegou a inserir a linha em
-- `lancamentos` mesmo com a parte contábil falhando).
--
-- `ativar_gestao` (0002) tem o mesmo formato de risco: duas escritas
-- sequenciais (desativa as demais gestões do corpo, depois ativa a
-- indicada) sem transação — se a segunda falhar por qualquer motivo depois
-- da primeira já ter sido commitada, o corpo fica sem nenhuma gestão
-- ativa. Não chegou a ser reproduzido um caso real de falha aqui (ao
-- contrário do bug de 0003, que foi reproduzido com dados reais), mas o
-- padrão de risco é idêntico — corrigido pela mesma técnica: transação
-- própria só quando não há uma já em andamento (`@@in_transaction`), com
-- ROLLBACK + RESIGNAL em caso de erro.
--
-- Não editamos 0002_cadastros.sql diretamente (já aplicada) — mesma
-- convenção usada no lado Postgres deste projeto (issues #8, #18): correção
-- via CREATE OR REPLACE / DROP+CREATE numa migration nova.
-- =========================================

DROP PROCEDURE IF EXISTS ativar_gestao;
DELIMITER $$
CREATE PROCEDURE ativar_gestao(IN p_gestao_id CHAR(36))
BEGIN
  DECLARE v_org_id CHAR(36);
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

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT org_id INTO v_org_id FROM gestoes WHERE id = p_gestao_id;
  IF v_org_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gestão não encontrada';
  END IF;

  UPDATE gestoes SET ativo = FALSE, org_id_se_ativo = NULL WHERE org_id = v_org_id AND id <> p_gestao_id AND ativo;
  UPDATE gestoes SET ativo = TRUE, org_id_se_ativo = org_id WHERE id = p_gestao_id;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
