-- =========================================
-- v_saldo_contas (0056) e os ramos de fallback "pago sem recibo/conciliação"
-- de relatorioRecebimentos/listarMovimentosRealizados/obterFluxoAnteriores
-- excluíam um lançamento de todo mundo com `NOT EXISTS (SELECT 1 FROM
-- conciliacao_lancamentos cl WHERE cl.lancamento_id = l.id)` — sem checar
-- se a conciliação daquele vínculo ainda está ativa.
--
-- desfazer_conciliacao NÃO apaga a linha de conciliacao_lancamentos (só
-- marca a conciliação como 'desfeita', de propósito, pra manter o
-- histórico). Um lançamento cuja conciliação foi desfeita e que depois foi
-- pago de novo por outro caminho (ex.: baixar_conta_pagar direto) ficava
-- de fora de TODOS os ramos: não está numa conciliação ativa (não entra no
-- ramo de conciliação), mas o NOT EXISTS acima também bloqueava o ramo de
-- fallback — o pagamento simplesmente sumia do relatório e do saldo da
-- conta (achado #8 da auditoria financeira).
-- =========================================
CREATE OR REPLACE VIEW v_saldo_contas AS
SELECT
  c.id, c.nome, c.tipo, c.saldo_inicial,
  c.saldo_inicial + COALESCE(m.total, 0) AS saldo_atual
FROM contas_financeiras c
LEFT JOIN (
  SELECT conta_financeira_id, SUM(valor_sinal) AS total
  FROM (
    SELECT r.conta_financeira_id AS conta_financeira_id, r.valor_total AS valor_sinal
    FROM recibos r

    UNION ALL

    SELECT c2.conta_financeira_id,
           CASE WHEN l.tipo = 'entrada' THEN cl.valor_aplicado ELSE -cl.valor_aplicado END
    FROM conciliacoes c2
    JOIN conciliacao_lancamentos cl ON cl.conciliacao_id = c2.id
    JOIN lancamentos l ON l.id = cl.lancamento_id
    WHERE c2.status = 'ativa'

    UNION ALL

    SELECT o.conta_financeira_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM ofx_lancamentos o
    JOIN lancamentos l ON l.id = o.lancamento_id
    WHERE o.conciliado = TRUE AND o.conciliacao_id IS NULL

    UNION ALL

    SELECT l.conta_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.conta_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id)
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o WHERE o.lancamento_id = l.id AND o.conciliacao_id IS NULL
      )

    UNION ALL

    SELECT l.conta_destino_id, l.valor
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.tipo = 'transferencia' AND l.conta_destino_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id)
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o WHERE o.lancamento_id = l.id AND o.conciliacao_id IS NULL
      )
  ) eventos
  GROUP BY conta_financeira_id
) m ON m.conta_financeira_id = c.id;
