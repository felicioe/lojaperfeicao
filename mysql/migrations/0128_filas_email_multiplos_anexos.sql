-- =============================================================================
-- Migração 0128: filas_email aceita múltiplos anexos (issue #470)
--
-- CONTEXTO. `filas_email` (0091) só tinha uma coluna de anexo (anexo_buffer/
-- anexo_nome/anexo_mime_type) — um arquivo por e-mail. A #470 precisa mandar
-- um e-mail por irmão com o PDF de CADA fatura em aberto dele anexado (podem
-- ser vários). Em vez de uma tabela filha só pra isso, `anexos_json` guarda
-- um array de {nome, mimeType, bufferBase64} — os PDFs em questão são
-- pequenos (poucos KB cada), então base64 dentro do JSON é simples e
-- suficiente; não há hoje nenhum outro lugar do sistema que leia as colunas
-- antigas fora de email-dispatch.ts, então dá pra substituir de vez.
-- =============================================================================

ALTER TABLE filas_email
  MODIFY COLUMN tipo ENUM(
    'fatura_emitida',
    'boas_vindas',
    'comunicado',
    'cobranca_manual',
    'relatorio_manual',
    'lembrete_vencida',
    'convite_admin',
    'fatura_aberta_lote'
  ) NOT NULL;

ALTER TABLE filas_email
  ADD COLUMN anexos_json JSON NULL AFTER anexo_mime_type;

UPDATE filas_email
   SET anexos_json = JSON_ARRAY(JSON_OBJECT(
         'nome', anexo_nome,
         'mimeType', anexo_mime_type,
         'bufferBase64', TO_BASE64(anexo_buffer)
       ))
 WHERE anexo_buffer IS NOT NULL;

ALTER TABLE filas_email
  DROP COLUMN anexo_buffer,
  DROP COLUMN anexo_nome,
  DROP COLUMN anexo_mime_type;
