-- Editor de menu de navegação do site institucional (issue #381) — segunda
-- peça do site leve embutido neste app (ver #380, páginas; #382, rotas
-- públicas). Deixa ocultar itens não usados, reordenar e criar submenu sem
-- depender de deploy de código pra cada mudança de navegação.
--
-- parent_id (self-referencing) faz o submenu — um item com parent_id
-- preenchido aparece dentro do item pai no site. tipo_destino decide como
-- `destino` é interpretado: slug de página (#380), rota fixa da agenda/
-- notícias, ou URL externa completa.
CREATE TABLE IF NOT EXISTS menu_site (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  label VARCHAR(100) NOT NULL,
  tipo_destino ENUM('pagina', 'agenda', 'noticias', 'link_externo') NOT NULL,
  destino VARCHAR(500) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  visivel BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_menu_site_loja (loja_id),
  KEY idx_menu_site_parent (parent_id),
  CONSTRAINT fk_menu_site_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_menu_site_parent FOREIGN KEY (parent_id) REFERENCES menu_site(id) ON DELETE CASCADE
) ENGINE=InnoDB;
