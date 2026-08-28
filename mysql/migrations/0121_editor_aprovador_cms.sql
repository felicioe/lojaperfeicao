-- =============================================================================
-- Migração 0121: papéis `editor_cms` e `aprovador_cms` (issue #391)
--
-- Até aqui, manter o site institucional (Notícias, Páginas) era tarefa
-- exclusiva do super_admin — tudo ou nada. Isso não escala para um site com
-- colunistas: cada um deveria só mexer na própria coluna, sem ver/editar a
-- dos outros, e sem herdar o resto dos poderes de super_admin.
--
-- Dois papéis novos, por Loja como os demais (papel escopado por loja_id
-- desde a 0092):
--   - editor_cms: escreve/edita conteúdo, mas só dentro do que foi
--     explicitamente atribuído a ele (uma ou mais colunas de notícia, uma ou
--     mais páginas do site). Nunca publica direto — todo rascunho pronto
--     precisa passar por aprovação.
--   - aprovador_cms: vê e aprova/rejeita o rascunho de QUALQUER editor_cms
--     (sem atribuição própria — é o papel de revisão geral do CMS). Só
--     aprova ou rejeita; não edita o conteúdo em si.
--
-- Agenda Pública (derivada de `sessoes`, dado interno da secretaria) e Menu
-- do Site (config única, sem "grão" que faça sentido por colunista) ficam
-- de fora dos dois papéis nesta v1 — decisão registrada na issue #391.
-- =============================================================================

ALTER TABLE usuarios_papeis
  MODIFY COLUMN papel
    ENUM('admin', 'tesoureiro', 'secretario', 'irmao', 'super_admin', 'editor_cms', 'aprovador_cms')
    NOT NULL;

-- Coluna de notícia (categoria/seção — "Palavra do Venerável", "Coluna do
-- Orador" etc.). Cada coluna pertence, no máximo, a UM editor_cms — ver
-- editor_cms_colunas abaixo, que tem PRIMARY KEY em coluna_id justamente pra
-- garantir isso (decisão do usuário: sem colunista compartilhado).
CREATE TABLE IF NOT EXISTS noticias_colunas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_noticias_colunas_loja_nome (loja_id, nome),
  CONSTRAINT fk_noticias_colunas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id)
) ENGINE=InnoDB;

ALTER TABLE noticias
  ADD COLUMN coluna_id CHAR(36) NULL AFTER loja_id,
  ADD COLUMN motivo_rejeicao TEXT NULL AFTER status,
  ADD CONSTRAINT fk_noticias_coluna FOREIGN KEY (coluna_id) REFERENCES noticias_colunas(id) ON DELETE SET NULL,
  ADD KEY idx_noticias_coluna (coluna_id);

-- `aguardando_aprovacao` é o estado novo: editor_cms manda o rascunho pra lá,
-- aprovador_cms aprova (vira `publicado`) ou rejeita (volta pra `rascunho`,
-- com o motivo em noticias.motivo_rejeicao). super_admin continua publicando
-- direto, sem passar por este estado.
ALTER TABLE noticias
  MODIFY COLUMN status ENUM('rascunho', 'aguardando_aprovacao', 'publicado') NOT NULL DEFAULT 'rascunho';

ALTER TABLE paginas_site
  ADD COLUMN motivo_rejeicao TEXT NULL AFTER status;

ALTER TABLE paginas_site
  MODIFY COLUMN status ENUM('rascunho', 'aguardando_aprovacao', 'publicado') NOT NULL DEFAULT 'rascunho';

-- Atribuição usuário → coluna/página. PRIMARY KEY no recurso (não no par)
-- garante o "1 editor por coluna/página" — atribuir de novo troca o dono em
-- vez de acumular um segundo.
CREATE TABLE IF NOT EXISTS editor_cms_colunas (
  coluna_id CHAR(36) NOT NULL PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  loja_id CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_editor_cms_colunas_usuario (usuario_id),
  CONSTRAINT fk_editor_cms_colunas_coluna FOREIGN KEY (coluna_id) REFERENCES noticias_colunas(id) ON DELETE CASCADE,
  CONSTRAINT fk_editor_cms_colunas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_editor_cms_colunas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS editor_cms_paginas (
  pagina_id CHAR(36) NOT NULL PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  loja_id CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_editor_cms_paginas_usuario (usuario_id),
  CONSTRAINT fk_editor_cms_paginas_pagina FOREIGN KEY (pagina_id) REFERENCES paginas_site(id) ON DELETE CASCADE,
  CONSTRAINT fk_editor_cms_paginas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_editor_cms_paginas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id)
) ENGINE=InnoDB;
