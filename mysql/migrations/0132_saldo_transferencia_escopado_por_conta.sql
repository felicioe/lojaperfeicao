-- =============================================================================
-- Migração 0132: soma de eventos de transferência escopada por conta (issue #476)
--
-- CONTEXTO. A 0131 corrigiu o caso em que a transferência é conciliada pelo
-- lado da conta de ORIGEM (o mais comum — reconciliar a conta corrente de
-- onde saiu o Pix): adicionou um branch espelhado que credita
-- conta_destino_id sempre que existe QUALQUER vínculo de OFX com o
-- lançamento, sem checar a qual conta esse vínculo pertence.
--
-- Isso reabriu o mesmo tipo de furo por outro ângulo (achado da revisão de
-- código pós-#476): `listarLancamentosParaConciliar` já lista a
-- transferência como candidata pros DOIS lados (origem e destino — é assim
-- que uma aplicação automática como "RDC - APLIC AUTOMÁTICA" também pode ter
-- seu próprio extrato importado e conciliado). Se o vínculo de OFX
-- encontrado pertence à conta de DESTINO (não à de origem), o branch
-- "OFX confirmado" (que só sabe debitar, com `CASE WHEN entrada THEN valor
-- ELSE -valor`) debita a própria conta de destino, e o branch espelhado da
-- 0131 credita ela de volta — o líquido na conta de destino fica ZERO, pior
-- que o bug original (agora nenhuma das duas contas registra a
-- movimentação).
--
-- CORREÇÃO. Em vez de compensar com mais um branch, resolve na raiz: os três
-- branches relevantes passam a saber a qual conta cada vínculo pertence.
--   1. "OFX confirmado": o sinal fica ciente de transferência — credita
--      (+valor) quando o vínculo é da conta de DESTINO, debita (-valor)
--      quando é da conta de ORIGEM (e continua tratando entrada/saída como
--      antes).
--   2. "Avulso origem" (conta_id): a exclusão por vínculo de OFX passa a
--      checar que o vínculo é especificamente da conta de origem
--      (`o.conta_financeira_id = l.conta_id`), não "existe algum vínculo em
--      qualquer conta". Para entrada/saída isso não muda nada (só existe
--      uma conta possível); só importa pra transferência.
--   3. "Avulso destino" (conta_destino_id): mesma ideia, escopado pra
--      `o.conta_financeira_id = l.conta_destino_id`.
-- O branch espelhado adicionado pela 0131 é removido — com os três ajustes
-- acima, ele fica redundante (e era a fonte do novo furo).
--
-- Os quatro cenários (nenhum lado conciliado / só origem / só destino /
-- os dois) foram conferidos manualmente e batem: a transferência sempre
-- debita a origem e credita o destino em exatamente uma fonte cada,
-- independente de qual conta o extrato bancário confirmou primeiro.
-- =============================================================================
CREATE OR REPLACE VIEW v_saldo_contas AS
SELECT
  c.id, c.loja_id, c.nome, c.tipo, c.banco, c.plano_conta_id, c.saldo_inicial,
  c.saldo_inicial + COALESCE(m.total, 0) AS saldo_atual
FROM contas_financeiras c
LEFT JOIN (
  SELECT conta_financeira_id, loja_id, SUM(valor_sinal) AS total
  FROM (
    SELECT r.conta_financeira_id AS conta_financeira_id, r.loja_id AS loja_id,
           r.valor_total AS valor_sinal
    FROM recibos r

    UNION ALL

    SELECT c2.conta_financeira_id, c2.loja_id,
           CASE WHEN l.tipo = 'entrada' THEN cl.valor_aplicado ELSE -cl.valor_aplicado END
    FROM conciliacoes c2
    JOIN conciliacao_lancamentos cl ON cl.conciliacao_id = c2.id AND cl.loja_id = c2.loja_id
    JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = c2.loja_id
    WHERE c2.status = 'ativa'

    UNION ALL

    -- "OFX confirmado" — sinal ciente de transferência: credita quando o
    -- vínculo é da conta de destino, debita quando é da conta de origem
    -- (entrada/saída continuam com a regra original, uma conta só).
    SELECT o.conta_financeira_id, o.loja_id,
           CASE
             WHEN l.tipo = 'entrada' THEN l.valor
             WHEN l.tipo = 'transferencia' AND o.conta_financeira_id = l.conta_destino_id
               THEN l.valor
             ELSE -l.valor
           END
    FROM ofx_lancamentos o
    JOIN lancamentos l ON l.id = o.lancamento_id AND l.loja_id = o.loja_id
    WHERE o.conciliado = TRUE AND o.conciliacao_id IS NULL

    UNION ALL

    -- "Avulso origem" — exclusão escopada à conta de origem
    -- (o.conta_financeira_id = l.conta_id), não a qualquer vínculo do
    -- lançamento.
    SELECT l.conta_id, l.loja_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.conta_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM recibo_itens ri
         WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id
                            AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o
         WHERE o.lancamento_id = l.id AND o.loja_id = l.loja_id AND o.conciliacao_id IS NULL
           AND o.conta_financeira_id = l.conta_id
      )

    UNION ALL

    -- "Avulso destino" — exclusão escopada à conta de destino
    -- (o.conta_financeira_id = l.conta_destino_id).
    SELECT l.conta_destino_id, l.loja_id, l.valor
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.tipo = 'transferencia' AND l.conta_destino_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM recibo_itens ri
         WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id
                            AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o
         WHERE o.lancamento_id = l.id AND o.loja_id = l.loja_id AND o.conciliacao_id IS NULL
           AND o.conta_financeira_id = l.conta_destino_id
      )
  ) eventos
  GROUP BY conta_financeira_id, loja_id
) m ON m.conta_financeira_id = c.id AND m.loja_id = c.loja_id;
