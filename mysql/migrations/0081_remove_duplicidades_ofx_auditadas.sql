-- Remove somente as 12 linhas duplicadas identificadas na auditoria
-- irmao por irmao do backup de producao de 12/08/2026.
--
-- Salvaguardas:
-- 1. a linha a remover continua sem conciliacao efetiva;
-- 2. existe outra linha efetivamente conciliada na mesma conta, data e valor;
-- 3. o historico bancario normalizado tambem e igual.
--
-- Nenhuma fatura, baixa, conciliacao ou lancamento contabil e alterado.
DELETE duplicado
FROM ofx_lancamentos duplicado
JOIN ofx_lancamentos confirmado
  ON confirmado.id <> duplicado.id
 AND confirmado.conta_financeira_id = duplicado.conta_financeira_id
 AND confirmado.data = duplicado.data
 AND confirmado.valor = duplicado.valor
 AND LOWER(TRIM(confirmado.descricao)) = LOWER(TRIM(duplicado.descricao))
LEFT JOIN conciliacoes c
  ON c.id = confirmado.conciliacao_id
 AND c.status = 'ativa'
WHERE duplicado.id IN (
  'a24993a8-967b-11f1-8a34-13be824f052c',
  'a2499460-967b-11f1-8a34-13be824f052c',
  'a249951b-967b-11f1-8a34-13be824f052c',
  'a24995cb-967b-11f1-8a34-13be824f052c',
  'a2499680-967b-11f1-8a34-13be824f052c',
  'a2499731-967b-11f1-8a34-13be824f052c',
  'a24a0d89-967b-11f1-8a34-13be824f052c',
  'a24a0f1d-967b-11f1-8a34-13be824f052c',
  'a24a0fdc-967b-11f1-8a34-13be824f052c',
  'a24a108f-967b-11f1-8a34-13be824f052c',
  'a24a112e-967b-11f1-8a34-13be824f052c',
  'a24a11ca-967b-11f1-8a34-13be824f052c'
)
AND duplicado.conciliado = FALSE
AND duplicado.lancamento_id IS NULL
AND duplicado.conciliacao_id IS NULL
AND (
  confirmado.conciliado = TRUE
  OR confirmado.lancamento_id IS NOT NULL
  OR c.id IS NOT NULL
);

-- A conferencia deve retornar zero linhas.
SELECT
  o.id,
  o.data,
  o.valor,
  o.descricao
FROM ofx_lancamentos o
WHERE o.id IN (
  'a24993a8-967b-11f1-8a34-13be824f052c',
  'a2499460-967b-11f1-8a34-13be824f052c',
  'a249951b-967b-11f1-8a34-13be824f052c',
  'a24995cb-967b-11f1-8a34-13be824f052c',
  'a2499680-967b-11f1-8a34-13be824f052c',
  'a2499731-967b-11f1-8a34-13be824f052c',
  'a24a0d89-967b-11f1-8a34-13be824f052c',
  'a24a0f1d-967b-11f1-8a34-13be824f052c',
  'a24a108f-967b-11f1-8a34-13be824f052c',
  'a24a112e-967b-11f1-8a34-13be824f052c',
  'a24a11ca-967b-11f1-8a34-13be824f052c'
);
