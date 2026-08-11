-- =========================================
-- VERIFICAÇÃO pós-migração 0061 — não altera nada, só consulta. Rode no
-- phpMyAdmin (aba SQL) do banco de produção depois de aplicar a 0061.
--
-- Parte 1: confirma que as procedures foram REDEFINIDAS pela 0061 (não
-- só que existem — elas já existiam desde 0054/0060, o que importa é
-- checar se é a versão nova).
-- Parte 2: checagens gerais de consistência financeira, cobrindo os
-- tipos de bug corrigidos ao longo desta auditoria (valor_pago fora do
-- range, fatura parcelada com status errado, linha de OFX órfã depois
-- de desfazer etc.). Toda linha "OK" (contagem 0) é o esperado; qualquer
-- contagem > 0 merece uma olhada antes de considerar o banco saudável.
-- =========================================

-- ---------- Parte 1: versão das procedures ----------

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

-- ---------- Parte 2: consistência financeira geral ----------

-- valor_pago não pode passar do valor de face nem ficar negativo.
SELECT 'lancamentos com valor_pago fora do range [0, valor]' AS checagem,
       COUNT(*) AS encontrados
FROM lancamentos
WHERE valor_pago < 0 OR valor_pago > valor;

-- Fatura original absorvida por parcelamento tem que continuar pago=TRUE
-- (senão ela reaparece como fatura em aberto ao lado das parcelas).
SELECT 'faturas parceladas (parcelado=TRUE) com pago=FALSE' AS checagem,
       COUNT(*) AS encontrados
FROM lancamentos
WHERE parcelado = TRUE AND pago = FALSE;

-- Linha de OFX marcada como conciliada tem que apontar pra algo (baixa
-- legada 1:1 OU evento de conciliação em lote) — nunca as duas nem
-- nenhuma das duas.
SELECT 'linhas de OFX conciliado=TRUE sem lancamento_id nem conciliacao_id' AS checagem,
       COUNT(*) AS encontrados
FROM ofx_lancamentos
WHERE conciliado = TRUE AND lancamento_id IS NULL AND conciliacao_id IS NULL;

-- Depois de desfazer_conciliacao, a linha de OFX tem que voltar pra
-- conciliado=FALSE — se ainda aponta pra uma conciliação 'desfeita' com
-- conciliado=TRUE, o desfazimento não reverteu o extrato corretamente.
SELECT 'linhas de OFX ainda conciliado=TRUE apontando pra conciliação desfeita' AS checagem,
       COUNT(*) AS encontrados
FROM ofx_lancamentos o
JOIN conciliacoes c ON c.id = o.conciliacao_id
WHERE o.conciliado = TRUE AND c.status = 'desfeita';

-- Lançamento fabricado por rateio/OFX (origem_tipo='ofx_importado') que
-- deveria ter sido apagado no desfazimento mas sobrou sem nenhuma
-- conciliacao_lancamentos viva apontando pra ele nem estar pago.
SELECT 'lançamentos fabricados por OFX órfãos (sem conciliação ativa nem pagos)' AS checagem,
       COUNT(*) AS encontrados
FROM lancamentos l
JOIN lancamentos_contabeis lc ON lc.origem_tipo = 'ofx_importado' AND lc.origem_id = l.id
WHERE l.pago = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM conciliacao_lancamentos cl
    JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.status = 'ativa'
    WHERE cl.lancamento_id = l.id
  );

-- Mensalidade marcada como valor customizado, mas sem irmão vinculado
-- (não deveria existir — indica dado corrompido/edição fora do fluxo normal).
SELECT 'irmaos.valor_mensalidade_customizado com valor_mensalidade nulo' AS checagem,
       COUNT(*) AS encontrados
FROM irmaos
WHERE valor_mensalidade_customizado = TRUE AND valor_mensalidade IS NULL;
