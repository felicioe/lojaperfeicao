-- =========================================
-- VERIFICAÇÃO pós-migração 0061 — PARTE 2 de 2 — não altera nada, só
-- consulta. Rode depois de verificacao_0061_parte1_procedures.sql, como
-- um import separado (ver comentário lá pra saber o motivo de estarem
-- em arquivos diferentes).
--
-- Checagens gerais de consistência financeira, cobrindo os tipos de bug
-- corrigidos ao longo desta auditoria (valor_pago fora do range, fatura
-- parcelada com status errado, linha de OFX órfã depois de desfazer
-- etc.). Toda linha "encontrados = 0" é o esperado; qualquer contagem
-- maior que 0 merece uma olhada antes de considerar o banco saudável.
-- =========================================

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
