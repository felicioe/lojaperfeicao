-- =============================================================================
-- Migração 0130: desfazer_lancamento_ofx não reabre transferência (issue #476)
--
-- CONTEXTO. Achado ao testar ao vivo a issue #474: `desfazer_lancamento_ofx`
-- (0101) foi escrita assumindo que toda linha do OFX desvinculada aponta pra
-- uma fatura normal (entrada/saída) que só fica "paga" no momento da baixa —
-- por isso, ao desfazer, ela reabre a fatura incondicionalmente:
--
--   UPDATE lancamentos
--   SET pago = FALSE, valor_pago = ..., data_pagamento = NULL, conta_id = NULL, ...
--   WHERE id = v_lancamento_id AND loja_id = @current_loja_id;
--
-- Uma transferência (tipo='transferencia', criada por criar_transferencia,
-- 0096) não segue essa semântica: ela nasce SEMPRE paga, com conta_id sendo
-- dado estrutural permanente (a conta de origem), não algo que só existe por
-- causa de uma baixa. Rodar esse UPDATE nela zera pago e conta_id
-- incondicionalmente — como não havia filtro por tipo, a procedure tratava a
-- transferência exatamente como uma fatura reaberta.
--
-- Efeito real observado em produção (transferência de R$10.632,48, Sicoob
-- Conta Corrente → RDC - APLIC AUTOMÁTICA): depois de vincular essa
-- transferência a uma linha do extrato (conciliar_ofx_existente) e desfazer
-- em seguida, o registro ficou com pago=FALSE e conta_id=NULL. Como
-- v_saldo_contas (0127) só credita/debita uma transferência enquanto
-- pago=TRUE, os dois lados sumiram do painel de saldo (um subiu, o outro
-- desceu o mesmo valor — o total bateu por coincidência, os saldos
-- individuais não). O lançamento contábil de partida dobrada
-- (lancamentos_contabeis, origem_tipo='transferencia') não foi tocado — só a
-- linha em `lancamentos` ficou incorreta. Corrigido manualmente em produção
-- via UPDATE direto antes desta migração existir.
--
-- CORREÇÃO. `conciliar_ofx_existente` só faz `UPDATE ofx_lancamentos` — nunca
-- toca em pago/conta_id/data_pagamento/forma_pagamento de `lancamentos`.
-- Logo, desfazer esse vínculo não precisa (e não deve) mexer nesses campos
-- pra NENHUM tipo que chegue por esse caminho 1:1 — mas o filtro abaixo é
-- restrito a `tipo <> 'transferencia'` (não vira um "não reabre nada mais"
-- genérico) porque o restante da procedure (estorno contábil de
-- 'ofx_importado'/'conciliacao_baixa', e a reabertura de entrada/saída) segue
-- válido e testado para os casos que já usava.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS desfazer_lancamento_ofx$$
CREATE PROCEDURE desfazer_lancamento_ofx(IN p_ofx_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_lancamento_id CHAR(36);
  DECLARE v_conciliacao_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_itens JSON;
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
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT lancamento_id, conciliacao_id, data INTO v_lancamento_id, v_conciliacao_id, v_data
  FROM ofx_lancamentos
  WHERE id = p_ofx_id AND conciliado = TRUE AND loja_id = @current_loja_id;
  IF v_lancamento_id IS NULL AND v_conciliacao_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha do extrato não encontrada ou não está conciliada';
  END IF;
  IF v_conciliacao_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta linha faz parte de um evento de conciliação em lote — use desfazer_conciliacao';
  END IF;
  IF periodo_esta_fechado(v_data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, lancamento_id = NULL
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;

  SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
  WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lancamento_id AND loja_id = @current_loja_id
  LIMIT 1;

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
      FROM lancamentos_contabeis_itens
      WHERE lancamento_id = v_lanc_contabil_id AND loja_id = @current_loja_id
    );
    CALL registrar_lancamento_contabil(
      v_data, mes_competencia(v_data), 'Estorno de lançamento criado via conciliação (desfeito)',
      v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
    );
    DELETE FROM lancamentos WHERE id = v_lancamento_id AND loja_id = @current_loja_id;
  ELSE
    SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
    WHERE origem_tipo = 'conciliacao_baixa' AND origem_id = v_lancamento_id AND loja_id = @current_loja_id
    LIMIT 1;

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
        FROM lancamentos_contabeis_itens
        WHERE lancamento_id = v_lanc_contabil_id AND loja_id = @current_loja_id
      );
      CALL registrar_lancamento_contabil(
        v_data, mes_competencia(v_data), 'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
      );
    END IF;

    -- tipo <> 'transferencia' (issue #476): uma transferência nasce sempre
    -- paga e sua conta_id é estrutural, não fruto de uma baixa — desfazer o
    -- vínculo com o OFX não deve reabri-la nem apagar sua conta de origem.
    UPDATE lancamentos
    SET pago = FALSE,
        valor_pago = CASE WHEN valor_pago >= valor THEN 0 ELSE valor_pago END,
        data_pagamento = NULL, conta_id = NULL,
        forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
    WHERE id = v_lancamento_id AND loja_id = @current_loja_id
      AND tipo <> 'transferencia';
  END IF;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
