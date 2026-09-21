-- Achado #664 — comentários em notícias publicadas, com moderação por
-- editor_cms (só nas próprias colunas) / super_admin (tudo), mesmo espírito
-- de cms-editorial-authz.ts.
CREATE TABLE IF NOT EXISTS noticias_comentarios (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  noticia_id CHAR(36) NOT NULL,
  autor_id CHAR(36) NOT NULL,
  texto VARCHAR(2000) NOT NULL,
  status ENUM('visivel', 'oculto') NOT NULL DEFAULT 'visivel',
  moderado_por CHAR(36) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_noticias_comentarios_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_noticias_comentarios_noticia FOREIGN KEY (noticia_id) REFERENCES noticias(id) ON DELETE CASCADE,
  CONSTRAINT fk_noticias_comentarios_autor FOREIGN KEY (autor_id) REFERENCES irmaos(id)
) ENGINE=InnoDB;
CREATE INDEX idx_noticias_comentarios_noticia ON noticias_comentarios (noticia_id, criado_em);
CREATE INDEX idx_noticias_comentarios_loja ON noticias_comentarios (loja_id);
