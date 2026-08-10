-- =========================================
-- v_saldo_contas somava lancamentos.valor (valor de face) pra "entrada"/
-- "saida"/"transferencia" pagos — ignorava por completo multa/juros/
-- desconto/valor extra aplicados numa baixa (recibos.valor_total, que já
-- inclui tudo isso) e pagamento parcial (valor_pago < valor). Divergia do
-- Extrato Bancário (modo "creditado", já correto desde 017b26e) sempre que
-- havia multa/juros/desconto/extra, sempre pra menos, e desconto sempre
-- pra mais — o card "Saldo das contas" (Dashboard, Contas, Fluxo de Caixa)
-- mostrava um número diferente do saldo real do banco (achado #6 da
-- auditoria financeira geral).
--
-- Fix: mesma fonte de verdade de 4 ramos já usada em relatorioExtratoBancario
-- (relatorios.ts) — recibos.valor_total, conciliacao_lancamentos.valor_aplicado,
-- OFX legado vinculado direto, e lançamento avulso/manual pago sem
-- nenhum dos três — agora agregada por conta em vez de listada por evento.
-- =========================================
CREATE OR REPLACE VIEW v_saldo_contas AS
SELECT
  c.id, c.nome, c.tipo, c.saldo_inicial,
  c.saldo_inicial + COALESCE(m.total, 0) AS saldo_atual
FROM contas_financeiras c
LEFT JOIN (
  SELECT conta_financeira_id, SUM(valor_sinal) AS total
  FROM (
    -- Recibos (baixar_faturas): valor_total já inclui multa/juros/desconto/extra.
    SELECT r.conta_financeira_id AS conta_financeira_id, r.valor_total AS valor_sinal
    FROM recibos r

    UNION ALL

    -- Conciliação em lote (ativa): valor_aplicado, não o valor de face da fatura.
    SELECT c2.conta_financeira_id,
           CASE WHEN l.tipo = 'entrada' THEN cl.valor_aplicado ELSE -cl.valor_aplicado END
    FROM conciliacoes c2
    JOIN conciliacao_lancamentos cl ON cl.conciliacao_id = c2.id
    JOIN lancamentos l ON l.id = cl.lancamento_id
    WHERE c2.status = 'ativa'

    UNION ALL

    -- OFX "legado": linha do extrato vinculada direto a 1 lançamento, sem
    -- passar por um evento de conciliação em lote.
    SELECT o.conta_financeira_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM ofx_lancamentos o
    JOIN lancamentos l ON l.id = o.lancamento_id
    WHERE o.conciliado = TRUE AND o.conciliacao_id IS NULL

    UNION ALL

    -- Avulso/manual pago (marcarLancamentoPago, recebimento avulso sem
    -- conciliação, transferência — lado que sai de conta_id) — nenhum dos
    -- três caminhos acima.
    SELECT l.conta_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.conta_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl WHERE cl.lancamento_id = l.id)
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o WHERE o.lancamento_id = l.id AND o.conciliacao_id IS NULL
      )

    UNION ALL

    -- Mesmo lote acima, lado de CRÉDITO de uma transferência (conta_destino_id).
    SELECT l.conta_destino_id, l.valor
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.tipo = 'transferencia' AND l.conta_destino_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl WHERE cl.lancamento_id = l.id)
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o WHERE o.lancamento_id = l.id AND o.conciliacao_id IS NULL
      )
  ) eventos
  GROUP BY conta_financeira_id
) m ON m.conta_financeira_id = c.id;
