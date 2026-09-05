-- issue #456: super-admin da plataforma pode ocultar, por loja, itens do
-- menu lateral do painel para todos os usuários dela (ex.: uma loja que não
-- usa a estrutura de Comissões ou não quer expor Tronco de Beneficência do
-- jeito modelado pelo sistema). Guarda um array de rotas (NavItem.to, ver
-- AppShell.tsx / src/lib/menu-catalogo.ts) — filtrado na sessão do usuário
-- (usuario-sessao.ts), antes de qualquer filtro por papel.
ALTER TABLE lojas
  ADD COLUMN menu_itens_ocultos_json JSON NOT NULL DEFAULT '[]'
  COMMENT 'Array de rotas (NavItem.to) ocultadas pelo super-admin para todos os usuários desta loja';
