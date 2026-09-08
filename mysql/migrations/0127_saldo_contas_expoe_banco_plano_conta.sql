-- v_saldo_contas (migração 0096) listava só id, loja_id, nome, tipo,
-- saldo_inicial e saldo_atual — nunca expôs banco nem plano_conta_id.
-- listarSaldoContas() (src/lib/backend/tesouraria-contas.ts) lê dessa view,
-- então a tela Contas financeiras nunca mostrava o vínculo com o plano de
-- contas: ao editar uma conta e escolher a conta contábil, o UPDATE ia
-- certo pra contas_financeiras, mas a listagem recarregada continuava sem
-- mostrar o vínculo (a coluna nem vinha na resposta), dando a impressão de
-- que a tela não salvava nada.
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

    SELECT o.conta_financeira_id, o.loja_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM ofx_lancamentos o
    JOIN lancamentos l ON l.id = o.lancamento_id AND l.loja_id = o.loja_id
    WHERE o.conciliado = TRUE AND o.conciliacao_id IS NULL

    UNION ALL

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
      )

    UNION ALL

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
      )
  ) eventos
  GROUP BY conta_financeira_id, loja_id
) m ON m.conta_financeira_id = c.id AND m.loja_id = c.loja_id;
