-- filas_email.tipo é ENUM (0091, ampliado em 0095/0128) — toda vez que um
-- `tipo` novo é usado em email-dispatch.ts, o ENUM da coluna precisa ser
-- ampliado numa migração própria, senão o INSERT falha em produção com erro
-- de valor inválido pro ENUM. Três tipos já em uso no código não tinham
-- passado por essa migração:
--   - 'interstico_completo' (enviarEmailIntersticioCompleto, já existente
--     antes desta sessão — nunca tinha sido adicionado ao ENUM);
--   - 'noticia_publicada' (issue #663, newsletter avulsa por notícia);
--   - 'edicao_jornal' (issue #665, jornalzinho agrupando notícias).
ALTER TABLE filas_email
  MODIFY COLUMN tipo ENUM(
    'fatura_emitida',
    'boas_vindas',
    'comunicado',
    'cobranca_manual',
    'relatorio_manual',
    'lembrete_vencida',
    'convite_admin',
    'fatura_aberta_lote',
    'interstico_completo',
    'noticia_publicada',
    'edicao_jornal'
  ) NOT NULL;
