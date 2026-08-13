-- Normaliza o indicador redundante das conciliacoes historicas.
-- O vinculo com lancamento ou conciliacao ativa e a evidencia principal;
-- esta atualizacao nao cria baixas nem altera valores financeiros.
UPDATE ofx_lancamentos o
LEFT JOIN conciliacoes c ON c.id = o.conciliacao_id AND c.status = 'ativa'
SET o.conciliado = TRUE
WHERE o.conciliado = FALSE
  AND (o.lancamento_id IS NOT NULL OR c.id IS NOT NULL);

-- Verificacao especifica solicitada: Enio e Francisco em 08/01/2026.
SELECT
  o.data,
  o.descricao AS historico_banco,
  o.valor AS valor_banco,
  CASE
    WHEN o.lancamento_id IS NOT NULL OR c.id IS NOT NULL THEN 'CONCILIADO'
    ELSE 'PENDENTE'
  END AS status_efetivo,
  l.descricao AS fatura_vinculada,
  l.data_pagamento,
  l.valor_pago,
  i.nome_civil AS irmao
FROM ofx_lancamentos o
LEFT JOIN conciliacoes c ON c.id = o.conciliacao_id AND c.status = 'ativa'
LEFT JOIN lancamentos l ON l.id = o.lancamento_id
LEFT JOIN irmaos i ON i.id = l.irmao_id
WHERE o.data = '2026-01-08'
  AND (o.descricao LIKE '%ENIO%' OR o.descricao LIKE '%FRANCISCO%')
ORDER BY o.descricao;
