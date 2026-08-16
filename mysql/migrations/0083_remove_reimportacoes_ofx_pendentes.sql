-- Remove reimportacoes OFX que aparecem como pendentes ao lado da mesma
-- transacao ja conciliada. Nao altera faturas, baixas, conciliacoes nem razao.
--
-- Uma linha so e candidata quando:
-- 1. continua totalmente pendente e sem vinculos;
-- 2. foi importada depois de outra linha da mesma conta, data, valor e historico;
-- 3. a linha mais antiga possui conciliacao efetiva.

DROP TEMPORARY TABLE IF EXISTS tmp_ofx_reimportacoes_pendentes;
CREATE TEMPORARY TABLE tmp_ofx_reimportacoes_pendentes (
  id CHAR(36) PRIMARY KEY
);

INSERT IGNORE INTO tmp_ofx_reimportacoes_pendentes (id)
SELECT duplicado.id
FROM ofx_lancamentos duplicado
JOIN ofx_lancamentos confirmado
  ON confirmado.id <> duplicado.id
 AND confirmado.conta_financeira_id = duplicado.conta_financeira_id
 AND confirmado.data = duplicado.data
 AND confirmado.valor = duplicado.valor
 AND LOWER(TRIM(confirmado.descricao)) = LOWER(TRIM(duplicado.descricao))
 AND confirmado.importado_em < duplicado.importado_em
LEFT JOIN conciliacoes c
  ON c.id = confirmado.conciliacao_id
 AND c.status = 'ativa'
WHERE duplicado.conciliado = FALSE
  AND duplicado.lancamento_id IS NULL
  AND duplicado.conciliacao_id IS NULL
  AND (
    confirmado.conciliado = TRUE
    OR confirmado.lancamento_id IS NOT NULL
    OR c.id IS NOT NULL
  );

SELECT
  COUNT(*) AS duplicidades_identificadas,
  COALESCE(SUM(ABS(o.valor)), 0) AS valor_total_duplicado
FROM tmp_ofx_reimportacoes_pendentes t
JOIN ofx_lancamentos o ON o.id = t.id;

DELETE o
FROM ofx_lancamentos o
JOIN tmp_ofx_reimportacoes_pendentes t ON t.id = o.id;

-- Deve retornar zero. Se houver linhas, elas nao atenderam as salvaguardas e
-- permanecem para revisao manual.
SELECT
  duplicado.id,
  duplicado.data,
  duplicado.valor,
  duplicado.descricao
FROM ofx_lancamentos duplicado
JOIN ofx_lancamentos confirmado
  ON confirmado.id <> duplicado.id
 AND confirmado.conta_financeira_id = duplicado.conta_financeira_id
 AND confirmado.data = duplicado.data
 AND confirmado.valor = duplicado.valor
 AND LOWER(TRIM(confirmado.descricao)) = LOWER(TRIM(duplicado.descricao))
 AND confirmado.importado_em < duplicado.importado_em
LEFT JOIN conciliacoes c
  ON c.id = confirmado.conciliacao_id
 AND c.status = 'ativa'
WHERE duplicado.conciliado = FALSE
  AND duplicado.lancamento_id IS NULL
  AND duplicado.conciliacao_id IS NULL
  AND (
    confirmado.conciliado = TRUE
    OR confirmado.lancamento_id IS NOT NULL
    OR c.id IS NOT NULL
  );

DROP TEMPORARY TABLE IF EXISTS tmp_ofx_reimportacoes_pendentes;

