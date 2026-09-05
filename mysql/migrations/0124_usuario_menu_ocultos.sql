-- issue #457: cada usuário pode ocultar, só pra si, itens do menu que não
-- usa ou não quer ver — preferência pessoal, sem afetar os demais usuários
-- da mesma loja. Fica de fora da lista de tabelas multi-tenant verificada
-- por scripts/checar-escopo-loja.mjs de propósito: o isolamento aqui é por
-- usuario_id (único no sistema inteiro), mesmo padrão já usado por
-- usuario_totp/usuario_passkeys — não por loja_id.
--
-- Filtro aplicado por cima do que sobrou depois do que o super-admin já
-- ocultou pra loja inteira (issue #456, lojas.menu_itens_ocultos_json):
-- ver AppShell.tsx.
CREATE TABLE IF NOT EXISTS usuario_menu_ocultos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  itens_json JSON NOT NULL DEFAULT '[]',
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY usuario_menu_ocultos_usuario_uniq (usuario_id),
  CONSTRAINT fk_usuario_menu_ocultos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;
