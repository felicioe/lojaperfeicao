-- issue #464: admin da Loja define, por papel (admin/tesoureiro/secretario/
-- irmao), uma lista ordenada dos itens de menu ativos na navegação mobile —
-- PainelShell do irmão (abas fixas de baixo + menu-gaveta) e a gaveta mobile
-- de admin/tesoureiro/secretario no AppShell (ver Sheet em AppShell.tsx).
--
-- Trava: item fora da lista do papel não aparece pra ninguém daquele papel,
-- nem pela preferência pessoal (#459/#460) — a preferência pessoal só filtra
-- em cima do que sobrou depois deste filtro, mesma relação que já existe
-- entre #456 (oculto por loja) e #459 (oculto pelo próprio usuário).
--
-- itens_json vazio (papel nunca configurado) = sem restrição nenhuma, mesmo
-- padrão gracioso de "ausência de linha = tudo liberado" já usado em #456.
CREATE TABLE IF NOT EXISTS menu_mobile_papel (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  papel VARCHAR(20) NOT NULL,
  itens_json JSON NOT NULL DEFAULT '[]',
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY menu_mobile_papel_loja_papel_uniq (loja_id, papel),
  CONSTRAINT fk_menu_mobile_papel_loja FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
) ENGINE = InnoDB;
