-- CMS de páginas de conteúdo do site institucional (issue #380) — primeira
-- peça de um site institucional leve embutido neste app (ver também #381,
-- menu de navegação, e #382, as rotas públicas em si). "Quem Somos",
-- "História", "Contato" etc.
--
-- slug é único por Loja (não globalmente) — mesmo padrão multi-tenant do
-- resto do schema. Reaproveita o mesmo desenho de noticias.ts (migração
-- 0113): status rascunho/publicado, sanitização de HTML só na leitura
-- pública (rich-text-server.ts), nunca na escrita.
CREATE TABLE IF NOT EXISTS paginas_site (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  conteudo MEDIUMTEXT NOT NULL,
  status ENUM('rascunho', 'publicado') NOT NULL DEFAULT 'rascunho',
  publicado_em TIMESTAMP NULL,
  autor_id CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_paginas_site_loja_slug (loja_id, slug),
  KEY idx_paginas_site_status (status),
  CONSTRAINT fk_paginas_site_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_paginas_site_usuario FOREIGN KEY (autor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
