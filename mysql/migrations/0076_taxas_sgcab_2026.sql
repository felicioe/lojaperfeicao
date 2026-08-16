-- ================================================================
-- TABELA OFICIAL SGCAB 2026
-- Fonte: ATO No 001/2026, de 02/01/2026.
--
-- A carga e idempotente:
--   1. atualiza apenas as parcelas oficiais (SGCAB, ritual e diploma)
--      das taxas por grau, preservando a taxa propria de cada corpo;
--   2. registra na tabela de referencia os valores que nao sao por grau.
--
-- A taxa de iniciacao somente e aplicavel aos graus 4 a 13. A selecao
-- abaixo alcanca qualquer corpo Adonhiramita ativo cuja faixa contenha o
-- grau, sem depender de IDs especificos do banco de producao.
-- ================================================================

INSERT INTO taxas_grau
  (org_id, ano, grau, sgcab, ritual, diploma, taxa_propria, ativo)
SELECT
  o.id,
  2026,
  oficial.grau,
  oficial.valor_iniciacao,
  35.00,
  35.00,
  0.00,
  TRUE
FROM orgs o
JOIN (
  SELECT 4 AS grau, 135.00 AS valor_iniciacao
  UNION ALL SELECT 5, 135.00
  UNION ALL SELECT 6, 135.00
  UNION ALL SELECT 7, 135.00
  UNION ALL SELECT 8, 160.00
  UNION ALL SELECT 9, 160.00
  UNION ALL SELECT 10, 160.00
  UNION ALL SELECT 11, 160.00
  UNION ALL SELECT 12, 275.00
  UNION ALL SELECT 13, 410.00
) oficial
  ON oficial.grau BETWEEN o.grau_min AND o.grau_max
WHERE o.ativo = TRUE
  AND LOWER(COALESCE(o.rito, '')) LIKE '%adonhiram%'
ON DUPLICATE KEY UPDATE
  sgcab = VALUES(sgcab),
  ritual = VALUES(ritual),
  diploma = VALUES(diploma),
  ativo = TRUE;

-- Valores gerais e itens avulsos do mesmo Ato. Sao mantidos como catalogo
-- de referencia e nao geram lancamentos contabeis automaticamente.
INSERT INTO tabela_valores
  (tipo, org_id, valor, vigencia_inicio, observacoes)
SELECT
  oficial.tipo,
  NULL,
  oficial.valor,
  '2026-01-02',
  oficial.observacoes
FROM (
  SELECT 'sgcab_anuidade_jan_jun_2026' AS tipo, 210.00 AS valor,
         'Anuidade SGCAB 2026 - graus 4 a 13 - janeiro a junho. ATO No 001/2026.' AS observacoes
  UNION ALL SELECT 'sgcab_anuidade_jul_set_2026', 160.00,
         'Anuidade SGCAB 2026 - graus 4 a 13 - julho a setembro. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_anuidade_out_dez_2026', 110.00,
         'Anuidade SGCAB 2026 - graus 4 a 13 - outubro a dezembro. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_carta_constitutiva_2026', 135.00,
         'Carta constitutiva. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_filiacao_equivalencia_taxa_2026', 120.00,
         'Taxa-base de filiacao/equivalencia; somar a anuidade do periodo. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_regularizacao_taxa_2026', 160.00,
         'Taxa-base de regularizacao; somar a anuidade atual. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_regularizacao_anuidade_2026', 210.00,
         'Anuidade indicada na linha de regularizacao. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_ritual_2026', 35.00,
         'Ritual. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_compendio_filosofico_2026', 40.00,
         'Compendio Filosofico. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_diploma_2026', 35.00,
         'Diploma. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_painel_grau_2026', 60.00,
         'Painel do grau. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_historia_rito_adonhiramita_2026', 40.00,
         'Historia do Rito Adonhiramita. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_bandeira_2026', 300.00,
         'Bandeira do SGCAB. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_boton_2026', 30.00,
         'Boton do SGCAB. ATO No 001/2026.'
  UNION ALL SELECT 'sgcab_boton_grau_13_2026', 30.00,
         'Boton do grau 13. ATO No 001/2026.'
) oficial
WHERE NOT EXISTS (
  SELECT 1
  FROM tabela_valores tv
  WHERE tv.tipo = oficial.tipo
    AND tv.org_id IS NULL
    AND tv.vigencia_inicio = '2026-01-02'
);

-- Conferencia esperada no banco:
-- 10 valores oficiais de iniciacao (graus 4 a 13), distribuidos conforme
-- a faixa de cada corpo, e 15 itens gerais/avulsos no catalogo.
SELECT
  o.nome AS corpo,
  tg.grau,
  tg.sgcab,
  tg.ritual,
  tg.diploma,
  tg.taxa_propria
FROM taxas_grau tg
JOIN orgs o ON o.id = tg.org_id
WHERE tg.ano = 2026
  AND tg.grau BETWEEN 4 AND 13
ORDER BY o.grau_min, o.nome, tg.grau;

