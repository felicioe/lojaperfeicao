-- =========================================
-- ZERAR FATURAS (escopo total) — substitui zerar_faturas_abertas (0009).
-- O usuário esclareceu que o reset deve cobrir TODAS as faturas (mensalidade),
-- abertas ou já pagas/recebidas, e todo o movimento financeiro decorrente
-- delas: a provisão contábil de cada fatura (origem_tipo='fatura_provisao')
-- e, para as já pagas, o recibo emitido (recibo_itens cai em cascata) e o
-- lançamento contábil da baixa (origem_tipo='recibo_baixa'). Todo recibo do
-- sistema é sempre gerado por baixar_faturas (único INSERT em `recibos`),
-- então apagar a tabela inteira de recibos é equivalente e mais seguro do
-- que tentar filtrar por fatura. Nenhuma outra tabela (contas, plano de
-- contas, fornecedores, parcelamentos etc.) é afetada.
-- =========================================
DROP PROCEDURE IF EXISTS zerar_faturas_abertas;

DROP PROCEDURE IF EXISTS zerar_faturas;
DELIMITER $$
CREATE PROCEDURE zerar_faturas(
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

  SELECT COUNT(*) INTO p_total FROM lancamentos WHERE tipo = 'entrada' AND is_mensalidade = TRUE;

  -- Lançamento contábil da baixa de cada recibo (todo recibo é de fatura)
  DELETE FROM lancamentos_contabeis WHERE origem_tipo = 'recibo_baixa';

  -- Provisão contábil de cada fatura, aberta ou paga
  DELETE lc FROM lancamentos_contabeis lc
  JOIN lancamentos l ON l.id = lc.origem_id AND lc.origem_tipo = 'fatura_provisao'
  WHERE l.tipo = 'entrada' AND l.is_mensalidade = TRUE;

  -- Recibos emitidos (recibo_itens cai em cascata via ON DELETE CASCADE)
  DELETE FROM recibos;

  DELETE FROM lancamentos WHERE tipo = 'entrada' AND is_mensalidade = TRUE;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
