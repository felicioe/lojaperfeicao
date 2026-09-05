-- issue #453: usuário fixa itens do menu como favoritos, exibidos em
-- destaque num grupo "Favoritos" no topo da sidebar — resolve a fadiga de
-- reabrir grupos densos (Tesouraria etc.) toda vez pra achar os mesmos
-- itens do dia a dia.
--
-- A tabela criada na 0124 (issue #457, só "ocultar") passa a guardar as
-- duas preferências pessoais de menu — renomeada, com a coluna original
-- também renomeada, pra deixar claro que não é mais só sobre ocultar.
RENAME TABLE usuario_menu_ocultos TO preferencias_menu_usuario;
ALTER TABLE preferencias_menu_usuario
  CHANGE COLUMN itens_json ocultos_json JSON NOT NULL DEFAULT '[]',
  ADD COLUMN favoritos_json JSON NOT NULL DEFAULT '[]' AFTER ocultos_json;
