-- =============================================================================
-- Migração 0141: desfazer_lancamento_ofx não reabre fatura já paga por outro
-- fluxo (issue #504)
--
-- CONTEXTO. Achado durante auditoria geral de contabilidade x financeiro
-- (garantir que lancamentos_contabeis seja sempre reflexo fiel de
-- lancamentos), motivada pela investigação do erro de conciliação bancária
-- resolvido nas migrações 0139/0140.
--
-- `desfazer_lancamento_ofx` só sabe reverter contabilidade quando encontra
-- um lançamento contábil com origem_tipo 'ofx_importado' ou
-- 'conciliacao_baixa' pra este lançamento. Mas o UPDATE que reabre a fatura
-- (pago=FALSE, valor_pago=0, data_pagamento=NULL, conta_id=NULL) roda
-- incondicionalmente no ELSE, mesmo quando nenhum dos dois é encontrado.
--
-- Isso quebra quando a fatura foi paga por um fluxo diferente
-- (baixar_faturas/baixar_pagamento_parcial/baixar_conta_pagar — origem_tipo
-- 'recibo_baixa'/'recibo_baixa_parcial'/'conta_pagar_baixa') e só depois
-- vinculada retroativamente a uma linha do extrato via
-- conciliar_ofx_existente (o branch "já paga fora da conciliação" de
-- listarLancamentosParaConciliar, issue #497). "Desfazer" nesse vínculo:
-- não acha lançamento contábil pra estornar (está em 'recibo_baixa', não em
-- 'ofx_importado'/'conciliacao_baixa') mas MESMO ASSIM reabre a fatura —
-- deixando o lançamento contábil da baixa original órfão (ou, se a fatura
-- reaberta for depois excluída pelo fluxo normal de estorno, definitivamente
-- sem lastro nenhum).
--
-- CORREÇÃO. Antes de reabrir a fatura no caso em que nenhum lançamento
-- contábil próprio foi encontrado, confere se ela já está paga por um
-- desses três fluxos legítimos (ou é uma transferência, que nunca deveria
-- chegar aqui de qualquer forma — filtro já existente desde a 0130). Se
-- sim, o "Desfazer" apenas desvincula a linha do OFX (já feito antes desta
-- checagem) e NÃO mexe em pago/conta_id/data_pagamento — a baixa original
-- continua intacta e com lastro contábil íntegro. Só reabre no caso legado
-- (nenhuma prova de contabilização em lugar nenhum), preservando o
-- comportamento histórico que a 0101/0130 sempre trataram.
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

      -- tipo <> 'transferencia' (issue #476): uma transferência nasce sempre
      -- paga e sua conta_id é estrutural, não fruto de uma baixa.
      UPDATE lancamentos
      SET pago = FALSE,
          valor_pago = CASE WHEN valor_pago >= valor THEN 0 ELSE valor_pago END,
          data_pagamento = NULL, conta_id = NULL,
          forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
      WHERE id = v_lancamento_id AND loja_id = @current_loja_id
        AND tipo <> 'transferencia';
    ELSEIF NOT EXISTS (
        -- Fix 0141 (issue #504): este vínculo pode ter sido feito via
        -- conciliar_ofx_existente sobre um lançamento já pago por um fluxo
        -- diferente (baixar_faturas/baixar_pagamento_parcial/
        -- baixar_conta_pagar) — nenhum deles gera lançamento contábil com
        -- origem 'ofx_importado'/'conciliacao_baixa', então nada foi
        -- encontrado acima. Reabrir a fatura aqui deixaria a contabilidade
        -- da baixa original órfã, sem lastro financeiro. Confere se é
        -- exatamente esse caso (ou uma transferência, que nunca deveria
        -- ter conta_id/pago tocados de qualquer forma) antes de decidir.
        SELECT 1 FROM lancamentos_contabeis
        WHERE origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'conta_pagar_baixa')
          AND origem_id = v_lancamento_id AND loja_id = @current_loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM lancamentos
        WHERE id = v_lancamento_id AND loja_id = @current_loja_id AND tipo = 'transferencia'
      ) THEN
      -- Nenhuma prova de contabilização em lugar nenhum (nem
      -- conciliacao_baixa, nem baixa por outro fluxo, nem transferência) —
      -- comportamento histórico preservado: reabre como sempre.
      UPDATE lancamentos
      SET pago = FALSE,
          valor_pago = CASE WHEN valor_pago >= valor THEN 0 ELSE valor_pago END,
          data_pagamento = NULL, conta_id = NULL,
          forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
      WHERE id = v_lancamento_id AND loja_id = @current_loja_id
        AND tipo <> 'transferencia';
    END IF;
    -- Se caiu aqui sem entrar em nenhum dos dois ramos acima: a fatura já
    -- está paga por um fluxo legítimo (ou é transferência) — o "Desfazer"
    -- só desvincula a linha do OFX (já feito no início da procedure), sem
    -- tocar em pago/conta_id/data_pagamento.
  END IF;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
