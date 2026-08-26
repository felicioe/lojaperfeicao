-- CMS de notícias/publicações do site institucional (issue #366).
--
-- Reaproveita o editor de texto rico já usado em sessões/eventos
-- (RichTextEditor/Tiptap) para o corpo da notícia. `status` controla o que
-- fica visível no endpoint público (/api/publico/noticias, nos moldes de
-- /api/publico/agenda) — uma notícia só some do rascunho pra publicada
-- quando alguém decide isso explicitamente, nunca por padrão.
CREATE TABLE IF NOT EXISTS noticias (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  resumo VARCHAR(500) NULL,
  conteudo MEDIUMTEXT NOT NULL,
  status ENUM('rascunho', 'publicado') NOT NULL DEFAULT 'rascunho',
  publicado_em TIMESTAMP NULL,
  autor_id CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_noticias_loja (loja_id),
  KEY idx_noticias_status (status),
  CONSTRAINT fk_noticias_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_noticias_usuario FOREIGN KEY (autor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;
