-- Correção pontual: a migração 0118 usou MODIFY COLUMN em potencias.logo_url,
-- assumindo que a coluna já existia (adicionada pela migração 0105). Em
-- produção ela não existe — a migração 0105 não chegou a aplicar essa parte
-- (ver comentário abaixo sobre possíveis outras partes da 0105 faltando).
-- Roda com ADD COLUMN em vez de MODIFY, já direto como MEDIUMTEXT.
ALTER TABLE potencias
  ADD COLUMN logo_url MEDIUMTEXT NULL AFTER site;
