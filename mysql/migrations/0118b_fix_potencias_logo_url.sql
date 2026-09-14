-- Correção pontual: a migração 0118 usou MODIFY COLUMN em potencias.logo_url,
-- assumindo que a coluna já existia (adicionada pela migração 0105). Em
-- produção ela não existe — a migração 0105 não chegou a aplicar essa parte
-- (ver comentário abaixo sobre possíveis outras partes da 0105 faltando).
-- Roda com ADD COLUMN em vez de MODIFY, já direto como MEDIUMTEXT.
--
-- IF NOT EXISTS (achado #601 da reavaliação SaaS/multi-loja): num replay
-- sequencial completo do zero, a 0105 já cria esta coluna (como VARCHAR) e
-- a 0118 já roda o MODIFY para MEDIUMTEXT antes de chegar aqui — sem a
-- guarda, este ADD COLUMN quebrava com "Duplicate column name". Em
-- produção (onde a 0105 nunca rodou) o comportamento não muda.
ALTER TABLE potencias
  ADD COLUMN IF NOT EXISTS logo_url MEDIUMTEXT NULL AFTER site;
