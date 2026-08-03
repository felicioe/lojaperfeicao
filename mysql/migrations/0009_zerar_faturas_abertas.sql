-- =========================================
-- ZERAR FATURAS EM ABERTO — equivalente ao menu do sistema legado que
-- limpava as faturas pendentes para o usuário relançar tudo do zero.
-- Escopo deliberadamente restrito: só apaga lancamentos com
-- tipo='entrada' AND is_mensalidade=TRUE AND pago=FALSE (a mesma definição
-- de "fatura em aberto" já usada por listarFaturasAbertas em
-- src/lib/backend/tesouraria-faturas.ts) e a provisão contábil
-- correspondente (origem_tipo='fatura_provisao', postada por
-- _postar_provisao_fatura). Faturas já pagas têm recibo vinculado
-- (fk_recibo_itens_lancamento é RESTRICT) e não são tocadas; nenhuma outra
-- tabela (contas, plano de contas, fornecedores, parcelamentos, recibos
-- etc.) é afetada.
-- =========================================
DROP PROCEDURE IF EXISTS zerar_faturas_abertas;
DELIMITER $$
CREATE PROCEDURE zerar_faturas_abertas(
  OUT p_total INT
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

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT COUNT(*) INTO p_total FROM lancamentos
  WHERE tipo = 'entrada' AND is_mensalidade = TRUE AND pago = FALSE;

  DELETE lc FROM lancamentos_contabeis lc
  JOIN lancamentos l ON l.id = lc.origem_id AND lc.origem_tipo = 'fatura_provisao'
  WHERE l.tipo = 'entrada' AND l.is_mensalidade = TRUE AND l.pago = FALSE;

  DELETE FROM lancamentos
  WHERE tipo = 'entrada' AND is_mensalidade = TRUE AND pago = FALSE;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
