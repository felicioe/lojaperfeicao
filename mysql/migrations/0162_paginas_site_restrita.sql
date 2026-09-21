-- issue #692 — página do CMS do site institucional pode ser marcada como
-- restrita a Irmão autenticado (flag genérica, não hardcode por slug, pra
-- não precisar de nova migração se outra página além de "publicacoes"
-- precisar do mesmo tratamento no futuro).
ALTER TABLE paginas_site
  ADD COLUMN restrita BOOLEAN NOT NULL DEFAULT FALSE;

-- Marca a página "Publicações" como restrita, se ela já existir em
-- produção com esse slug (decisão já confirmada com o usuário). Idempotente
-- e silencioso se a página ainda não tiver sido criada — nesse caso, marcar
-- pela própria tela do CMS depois.
UPDATE paginas_site SET restrita = TRUE WHERE slug = 'publicacoes';
