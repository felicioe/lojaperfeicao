-- =============================================================================
-- Migração 0129: editar e excluir transferência entre contas (issue #474)
--
-- CONTEXTO. `criar_transferencia` (0096) grava a transferência já com
-- pago=TRUE e já lançada na contabilidade (registrar_lancamento_contabil,
-- origem_tipo='transferencia') no mesmo INSERT. Isso deixava a tela sem
-- como editar/excluir depois: `AcoesLancamento` só libera os botões de
-- editar/cancelar quando `!lancamento.pago`, e uma transferência nasce
-- sempre paga — então o único jeito de mexer nela era "Desmarcar pago"
-- (desmarcarLancamentoPago), que só zera pago/data_pagamento/valor_pago
-- sem desfazer a contrapartida na conta destino nem o lançamento contábil,
-- deixando os saldos das duas contas errados.
--
-- `atualizar_transferencia` e `estornar_transferencia` seguem o mesmo
-- padrão de `criar_transferencia`: validam permissão, escopo de loja e que
-- o lançamento é mesmo uma transferência; bloqueiam se ela já foi
-- conciliada com uma linha do extrato (mesma checagem de
-- listarLancamentosParaConciliar: ofx_lancamentos.lancamento_id OU
-- conciliacao_lancamentos com conciliação ativa) — decisão tomada com o
-- usuário: uma transferência conciliada só pode ser editada/excluída depois
-- de desfazer o vínculo, igual já vale pros demais lançamentos. Editar
-- permite trocar inclusive as contas de origem/destino (outra decisão do
-- usuário), por isso não basta um UPDATE: apaga o lançamento contábil
-- antigo e posta um novo com as contas atualizadas, atômico com o UPDATE de
-- `lancamentos` (mesma transação). O gatilho de período fechado
-- (trg_lancamentos_bloqueia_periodo_fechado_update, da 0045) já cobre de
-- graça o caso de editar uma transferência cuja data original está em
-- período encerrado.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS atualizar_transferencia$$
CREATE PROCEDURE atualizar_transferencia(
  IN p_lancamento_id CHAR(36),
  IN p_conta_origem_id CHAR(36),
  IN p_conta_destino_id CHAR(36),
  IN p_valor DECIMAL(14,2),
  IN p_data DATE,
  IN p_descricao VARCHAR(500)
)
BEGIN
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_conciliada BOOLEAN;
  DECLARE v_plano_origem CHAR(36);
  DECLARE v_plano_destino CHAR(36);
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
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;
  IF p_conta_origem_id = p_conta_destino_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta de origem e destino devem ser diferentes';
  END IF;

  SELECT tipo INTO v_tipo FROM lancamentos
   WHERE id = p_lancamento_id AND loja_id = @current_loja_id
   FOR UPDATE;
  IF v_tipo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transferência não encontrada';
  END IF;
  IF v_tipo <> 'transferencia' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento não é uma transferência';
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
      'Esta transferência já foi conciliada com uma linha do extrato — desfaça a conciliação antes de editar';
  END IF;

  -- Mesma checagem de criar_transferencia: as duas contas (novas ou
  -- mantidas) precisam ser desta loja e ter plano de contas vinculado.
  SELECT plano_conta_id INTO v_plano_origem FROM contas_financeiras
   WHERE id = p_conta_origem_id AND loja_id = @current_loja_id;
  SELECT plano_conta_id INTO v_plano_destino FROM contas_financeiras
   WHERE id = p_conta_destino_id AND loja_id = @current_loja_id;
  IF v_plano_origem IS NULL OR v_plano_destino IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Ambas as contas precisam ser desta loja e ter conta do plano de contas vinculada';
  END IF;

  DELETE lci FROM lancamentos_contabeis_itens lci
    JOIN lancamentos_contabeis lc ON lc.id = lci.lancamento_id
   WHERE lci.loja_id = @current_loja_id AND lc.loja_id = @current_loja_id
     AND lc.origem_tipo = 'transferencia' AND lc.origem_id = p_lancamento_id;
  DELETE FROM lancamentos_contabeis
   WHERE loja_id = @current_loja_id AND origem_tipo = 'transferencia' AND origem_id = p_lancamento_id;

  -- data_pagamento acompanha data: uma transferência é atômica (a mesma
  -- data em que "sai" também é a data em que "entra"), mesmo invariante já
  -- estabelecido por criar_transferencia.
  UPDATE lancamentos
     SET data = p_data, data_pagamento = p_data, descricao = p_descricao, valor = p_valor,
         conta_id = p_conta_origem_id, conta_destino_id = p_conta_destino_id
   WHERE id = p_lancamento_id AND loja_id = @current_loja_id;

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data), p_descricao,
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_destino, 'tipo', 'debito', 'valor', CAST(p_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_plano_origem, 'tipo', 'credito', 'valor', CAST(p_valor AS DECIMAL(14,2)))
    ),
    'transferencia', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS estornar_transferencia$$
CREATE PROCEDURE estornar_transferencia(
  IN p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_tipo VARCHAR(20);
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

  SELECT tipo INTO v_tipo FROM lancamentos
   WHERE id = p_lancamento_id AND loja_id = @current_loja_id
   FOR UPDATE;
  IF v_tipo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transferência não encontrada';
  END IF;
  IF v_tipo <> 'transferencia' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento não é uma transferência';
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
