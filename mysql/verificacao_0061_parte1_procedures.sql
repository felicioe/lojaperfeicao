-- =========================================
-- VERIFICAÇÃO pós-migração 0061 — PARTE 1 de 2 — não altera nada, só
-- consulta. Rode este arquivo primeiro no phpMyAdmin (aba SQL/Importar),
-- depois rode verificacao_0061_parte2_dados.sql separadamente — os dois
-- juntos num só import confundem o phpMyAdmin (erro #1109 "Tabela
-- desconhecida em information_schema" na segunda parte).
--
-- Confirma que desfazer_conciliacao/desfazer_lancamento_ofx foram
-- REDEFINIDAS pela 0061 (elas já existiam desde 0054/0060 — o que
-- importa aqui é checar se é a versão nova).
-- =========================================

SELECT 'desfazer_conciliacao' AS procedure_nome,
       CASE
         WHEN r.ROUTINE_NAME IS NULL THEN 'FALTANDO'
         WHEN r.ROUTINE_DEFINITION LIKE '%v_criado_pelo_evento%' THEN 'OK (versão 0061)'
         ELSE 'DESATUALIZADA (ainda é a versão 0054) — rode a migração 0061'
       END AS status
FROM INFORMATION_SCHEMA.ROUTINES r
WHERE r.ROUTINE_SCHEMA = DATABASE()
  AND r.ROUTINE_NAME = 'desfazer_conciliacao'
  AND r.ROUTINE_TYPE = 'PROCEDURE'

UNION ALL

SELECT 'desfazer_lancamento_ofx' AS procedure_nome,
       CASE
         WHEN r.ROUTINE_NAME IS NULL THEN 'FALTANDO'
         WHEN r.ROUTINE_DEFINITION LIKE '%valor_pago = 0%' THEN 'DESATUALIZADA (ainda é a versão 0060) — rode a migração 0061'
         ELSE 'OK (versão 0061)'
       END AS status
FROM INFORMATION_SCHEMA.ROUTINES r
WHERE r.ROUTINE_SCHEMA = DATABASE()
  AND r.ROUTINE_NAME = 'desfazer_lancamento_ofx'
  AND r.ROUTINE_TYPE = 'PROCEDURE';
