-- =============================================================================
-- Migração 0131: v_saldo_contas credita a conta destino de transferência
-- conciliada (issue #476)
--
-- CONTEXTO. Além da corrupção corrigida em 0130 (desfazer_lancamento_ofx
-- reabrindo transferência), há um segundo defeito, permanente (não só
-- transitório durante um desfazer): a view v_saldo_contas (0127) só credita
-- conta_destino_id de uma transferência ENQUANTO nenhuma linha do extrato
-- estiver vinculada a ela (`NOT EXISTS ofx_lancamentos WHERE
-- o.lancamento_id = l.id`). Assim que a transferência é conciliada
-- (conciliar_ofx_existente), esse branch para de contribuir — mas nenhum
-- outro branch assume esse crédito de volta. O branch "OFX confirmado"
-- (linhas 30-36 de 0127) só credita/debita `o.conta_financeira_id`, que é
-- sempre a conta de ORIGEM (onde o extrato foi importado), nunca a conta de
-- destino. Resultado: a conta de destino fica permanentemente sem esse
-- crédito enquanto a transferência estiver conciliada — reproduzido ao vivo
-- em produção com a transferência Sicoob Conta Corrente → RDC - APLIC
-- AUTOMÁTICA de R$10.632,48 (RDC ficou mostrando R$0,00 no painel "Saldo de
-- outras aplicações" assim que vinculada à linha do extrato).
--
-- CORREÇÃO. Novo branch, espelhando o existente (linhas 59-77) mas para o
-- caso conciliado: credita conta_destino_id quando HÁ um vínculo ativo com
-- o OFX, em vez de quando NÃO há. Os dois branches juntos cobrem os dois
-- estados (não conciliada / conciliada) sem sobreposição, já que são
-- exatamente complementares na mesma condição EXISTS/NOT EXISTS.
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

    UNION ALL

    -- Espelho do branch acima: quando a transferência JÁ tem uma linha do
    -- extrato vinculada (issue #476), credita conta_destino_id por aqui —
    -- o branch acima parou de cobrir esse caso, e o branch "OFX confirmado"
    -- (mais acima) só toca em o.conta_financeira_id, que é sempre a conta
    -- de origem, nunca a de destino.
    SELECT l.conta_destino_id, l.loja_id, l.valor
    FROM lancamentos l
    JOIN ofx_lancamentos o ON o.lancamento_id = l.id AND o.loja_id = l.loja_id
    WHERE l.pago = TRUE AND l.tipo = 'transferencia' AND l.conta_destino_id IS NOT NULL
      AND o.conciliado = TRUE AND o.conciliacao_id IS NULL
  ) eventos
  GROUP BY conta_financeira_id, loja_id
) m ON m.conta_financeira_id = c.id AND m.loja_id = c.loja_id;
