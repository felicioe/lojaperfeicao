-- =============================================================================
-- Migração 0142: conciliar_ofx_existente exige lançamento já pago (issue #505)
--
-- CONTEXTO. Achado durante a mesma auditoria da migração 0141.
-- `conciliar_ofx_existente` só confere que o lançamento é desta loja antes
-- de vincular a linha do extrato a ele — não confere `pago = TRUE`. Essa
-- garantia vivia inteiramente no frontend (conciliacao.tsx, só oferece o
-- botão quando `eh_transferencia || ja_pago`).
--
-- Uma chamada direta ao server function com o id de um lançamento ainda em
-- ABERTO marcaria a linha do extrato como conciliada sem nunca dar baixa
-- nele nem lançar contabilidade nenhuma — reproduzindo, por um caminho de
-- escrita diferente, o mesmo problema de fundo que a issue #356 já
-- documentou do lado da leitura (linha do extrato "conciliada" sem lastro
-- real).
--
-- CORREÇÃO. A procedure passa a exigir que o lançamento já esteja pago
-- (`pago = TRUE`) ou seja uma transferência (que nasce sempre paga) antes
-- de aceitar o vínculo — nunca confiar só na UI pra uma garantia de
-- integridade financeira.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS conciliar_ofx_existente$$
CREATE PROCEDURE conciliar_ofx_existente(IN p_ofx_id CHAR(36), IN p_lancamento_id CHAR(36))
BEGIN
  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ofx_lancamentos
     WHERE id = p_ofx_id AND NOT conciliado AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;
  -- Sem este filtro, uma linha do extrato podia ser amarrada ao lançamento de
  -- outra Loja passando o id — e o saldo das duas passava a mentir.
  IF NOT EXISTS (
    SELECT 1 FROM lancamentos WHERE id = p_lancamento_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento não encontrado';
  END IF;
  -- Fix 0142 (issue #505): esta procedure não dá baixa em nada — só amarra a
  -- linha do extrato a um lançamento que JÁ tem seu próprio lastro
  -- financeiro (pago por outro fluxo, ou transferência, que nasce sempre
  -- paga). Vincular a algo ainda em aberto marcaria a linha como conciliada
  -- sem contabilização nenhuma por trás — o mesmo problema de fundo da
  -- issue #356, por um caminho de escrita diferente.
  IF NOT EXISTS (
    SELECT 1 FROM lancamentos
     WHERE id = p_lancamento_id AND loja_id = @current_loja_id
       AND (pago = TRUE OR tipo = 'transferencia')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Este lançamento ainda não foi pago — use o fluxo de conciliação em lote (Vincular) para dar baixa nele.';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;
END$$

DELIMITER ;
