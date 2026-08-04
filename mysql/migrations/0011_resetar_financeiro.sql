-- =========================================
-- RESETAR FINANCEIRO — substitui zerar_faturas (0010). O usuário
-- esclareceu que o "zerar" deve cobrir todo o módulo financeiro, não só
-- as faturas: apaga todo movimento (lancamentos, de qualquer tipo/status),
-- lançamentos contábeis, recibos, parcelamentos, conciliação bancária
-- (OFX), orçamento anual e fechamento de exercício — como se o sistema
-- fosse reiniciado do zero para começar os lançamentos de novo. Os
-- cadastros básicos NÃO são tocados: irmãos, corpos maçônicos, gestões,
-- sessões, fornecedores/clientes, plano de contas, contas financeiras (as
-- contas em si, só o saldo delas é recalculado pela ausência de
-- lançamentos), usuários, parâmetros financeiros e os modelos de
-- despesas recorrentes (só os lançamentos já gerados por eles são
-- apagados, o cadastro do modelo continua).
--
-- Igual ao critério de risco já usado no restante do módulo financeiro
-- (fechar_exercicio, reabrir_exercicio, aprovar_orcamento e
-- reabrir_orcamento em 0005_orcamento_fechamento.sql são admin-only,
-- diferente das demais operações do dia a dia que também liberam
-- tesoureiro): como este reset apaga fechamentos de exercício e
-- orçamentos inteiros — algo mais consequente que fechar/reabrir um
-- único exercício — a procedure abaixo é admin-only.
--
-- Ordem de exclusão respeitando as FKs (RESTRICT) que ainda existirem:
-- recibo_itens.lancamento_id é RESTRICT, então recibos (que cascade pra
-- recibo_itens) precisa sair antes de lancamentos. O resto é
-- CASCADE/SET NULL e não impõe ordem.
-- =========================================
DROP PROCEDURE IF EXISTS zerar_faturas;

DROP PROCEDURE IF EXISTS resetar_financeiro;
DELIMITER $$
CREATE PROCEDURE resetar_financeiro(
  OUT p_total_lancamentos INT
)
BEGIN
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

  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT COUNT(*) INTO p_total_lancamentos FROM lancamentos;

  DELETE FROM ofx_lancamentos;
  DELETE FROM fechamentos_exercicio;
  DELETE FROM orcamentos;
  DELETE FROM recibos;
  DELETE FROM parcelamentos;
  DELETE FROM lancamentos_contabeis;
  DELETE FROM lancamentos;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
