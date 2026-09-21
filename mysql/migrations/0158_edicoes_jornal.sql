-- Achado #665 — edição em formato "jornalzinho" agrupando várias notícias
-- num único envio (e-mail) + página pública. O HTML é gravado como
-- snapshot no momento da publicação (não recalculado depois): editar uma
-- notícia mais tarde não deve alterar silenciosamente uma edição já
-- enviada/publicada, mesma lógica de "documento assinado" já usada pelas
-- faturas em PDF.
CREATE TABLE IF NOT EXISTS edicoes_jornal (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  -- Sequencial por Loja (Edição nº 1, 2, 3...) — não é AUTO_INCREMENT porque
  -- precisa ser calculado com escopo de loja_id, não global.
  numero INT NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  manchete_noticia_id CHAR(36) NOT NULL,
  -- IDs das notícias incluídas, na ordem de exibição (a primeira é sempre a
  -- manchete). Guardado por referência (não bloqueia a notícia original de
  -- ser editada/despublicada depois) — só o snapshot em `html` é imutável.
  noticias_ids_json TEXT NOT NULL,
  html LONGTEXT NOT NULL,
  criado_por CHAR(36) NULL,
  publicado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_edicoes_jornal_loja_numero (loja_id, numero),
  CONSTRAINT fk_edicoes_jornal_loja FOREIGN KEY (loja_id) REFERENCES lojas(id)
) ENGINE=InnoDB;
CREATE INDEX idx_edicoes_jornal_loja_publicado ON edicoes_jornal (loja_id, publicado_em);
