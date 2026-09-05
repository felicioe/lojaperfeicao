// Catálogo achatado de rotas do menu lateral do painel (issue #456) — usado
// pela tela de super-admin (admin-saas/lojas.tsx) pra listar quais itens
// podem ser ocultados, por loja, para todos os usuários dela.
//
// É uma lista paralela, mantida à mão, às rotas declaradas em
// `groupsAdmin`/`groupsMemberOnly` dentro de AppShell.tsx: ao adicionar,
// remover ou renomear um item ali, replicar aqui. Não importa AppShell.tsx
// de propósito — aquele componente monta os grupos em função do papel do
// usuário logado (`useCan()`), enquanto este catálogo precisa da união de
// todos os itens que existem no sistema, independente de quem está vendo.
//
// O dashboard/Início (`/dashboard`, `/painel`) fica de fora de propósito:
// é o item de pouso do menu, ocultá-lo trancaria a navegação por completo.
export type ItemDeMenuCatalogo = { to: string; label: string; grupo: string };

export const CATALOGO_MENU: ItemDeMenuCatalogo[] = [
  // Membros
  { to: "/irmaos", label: "Irmãos", grupo: "Membros" },
  { to: "/orgs", label: "Corpos Maçônicos", grupo: "Membros" },
  { to: "/gestoes", label: "Gestões", grupo: "Membros" },
  { to: "/comissoes", label: "Comissões", grupo: "Membros" },
  { to: "/interstico", label: "Interstício", grupo: "Membros" },

  // Agenda & Ensino
  { to: "/calendario", label: "Calendário", grupo: "Agenda & Ensino" },
  { to: "/eventos", label: "Eventos", grupo: "Agenda & Ensino" },
  { to: "/ensino/planos", label: "Planos de Ensino", grupo: "Agenda & Ensino" },
  { to: "/relatorios/frequencia", label: "Frequência", grupo: "Agenda & Ensino" },
  { to: "/ensino/importar-calendario", label: "Importar Calendário", grupo: "Agenda & Ensino" },
  { to: "/ensino/importar-pdf-sessoes", label: "Cronograma (PDF)", grupo: "Agenda & Ensino" },
  {
    to: "/ensino/importar-planos-ensino",
    label: "Planos de Ensino (PDF)",
    grupo: "Agenda & Ensino",
  },

  // Comunicação & Site
  { to: "/comunicacoes", label: "Comunicações", grupo: "Comunicação & Site" },
  { to: "/biblioteca", label: "Biblioteca de Peças", grupo: "Comunicação & Site" },
  { to: "/enquetes", label: "Enquetes", grupo: "Comunicação & Site" },
  { to: "/documentos", label: "Legislação", grupo: "Comunicação & Site" },
  { to: "/noticias-site", label: "Notícias do Site", grupo: "Comunicação & Site" },
  { to: "/agenda-publica", label: "Agenda Pública", grupo: "Comunicação & Site" },
  { to: "/paginas-site", label: "Páginas do Site", grupo: "Comunicação & Site" },
  { to: "/menu-site", label: "Menu do Site", grupo: "Comunicação & Site" },
  { to: "/cms-aprovacoes", label: "Aprovações do Site", grupo: "Comunicação & Site" },
  { to: "/cms-editores", label: "Editores do Site", grupo: "Comunicação & Site" },

  // Tesouraria
  { to: "/tesouraria", label: "Visão Geral", grupo: "Tesouraria" },
  { to: "/tesouraria/contas", label: "Contas", grupo: "Tesouraria" },
  { to: "/tesouraria/parametros", label: "Parâmetros Financeiros", grupo: "Tesouraria" },
  { to: "/tesouraria/tabela-valores", label: "Tabela de Valores da Loja", grupo: "Tesouraria" },
  { to: "/terceiros", label: "Fornecedores/Clientes", grupo: "Tesouraria" },
  { to: "/tesouraria/movimentos", label: "Movimento Financeiro", grupo: "Tesouraria" },
  { to: "/tesouraria/tronco", label: "Tronco de Beneficência", grupo: "Tesouraria" },
  { to: "/tesouraria/conciliacao", label: "Conciliação Bancária", grupo: "Tesouraria" },
  { to: "/tesouraria/faturas", label: "Faturas", grupo: "Tesouraria" },
  { to: "/tesouraria/parcelamentos", label: "Parcelamentos", grupo: "Tesouraria" },
  { to: "/sgcab/cobrancas", label: "Controle SGCAB", grupo: "Tesouraria" },
  { to: "/tesouraria/recibos", label: "Recibos", grupo: "Tesouraria" },
  { to: "/tesouraria/contas-pagar", label: "Contas a Pagar", grupo: "Tesouraria" },
  { to: "/tesouraria/recorrentes", label: "Despesas Recorrentes", grupo: "Tesouraria" },
  { to: "/relatorios/recebimentos", label: "Recebimentos no Mês", grupo: "Tesouraria" },
  { to: "/relatorios/extrato-conciliacao", label: "Extrato da Conciliação", grupo: "Tesouraria" },
  { to: "/relatorios/extrato-bancario", label: "Extrato Bancário", grupo: "Tesouraria" },
  { to: "/relatorios/extrato-irmao", label: "Extrato do Irmão", grupo: "Tesouraria" },
  { to: "/relatorios/inadimplentes", label: "Inadimplentes", grupo: "Tesouraria" },
  { to: "/relatorios/inadimplencia", label: "Inadimplência Detalhada", grupo: "Tesouraria" },
  { to: "/administracao/fechamento-periodo", label: "Fechamento de Período", grupo: "Tesouraria" },
  { to: "/administracao/resetar-financeiro", label: "Resetar Financeiro", grupo: "Tesouraria" },

  // Contabilidade
  { to: "/contabilidade/razao", label: "Razão Contábil", grupo: "Contabilidade" },
  { to: "/contabilidade/diario", label: "Diário Contábil", grupo: "Contabilidade" },
  { to: "/contabilidade/dre", label: "DRE", grupo: "Contabilidade" },
  { to: "/contabilidade/dre-orcado", label: "DRE Orçado", grupo: "Contabilidade" },
  { to: "/contabilidade/balancete", label: "Balancete", grupo: "Contabilidade" },
  { to: "/contabilidade/fluxo-caixa", label: "Fluxo de Caixa", grupo: "Contabilidade" },
  { to: "/contabilidade/orcamento", label: "Orçamento Anual", grupo: "Contabilidade" },
  { to: "/contabilidade/fechamento", label: "Fechamento de Exercício", grupo: "Contabilidade" },
  { to: "/contabilidade/auditoria", label: "Auditoria Contábil", grupo: "Contabilidade" },
  {
    to: "/contabilidade/conferencia",
    label: "Conferência Contábil x Financeira",
    grupo: "Contabilidade",
  },
  { to: "/contabilidade/plano-contas", label: "Plano de Contas", grupo: "Contabilidade" },
  { to: "/contabilidade/parametros", label: "Parâmetros Contábeis", grupo: "Contabilidade" },

  // Administração
  { to: "/painel/chamados", label: "Chamados de Suporte", grupo: "Administração" },
  { to: "/usuarios", label: "Usuários", grupo: "Administração" },
  { to: "/administracao/auditoria", label: "Auditoria", grupo: "Administração" },
  { to: "/administracao/exportar-dados", label: "Exportar Dados", grupo: "Administração" },
  {
    to: "/administracao/configuracao-inicial",
    label: "Configuração Inicial",
    grupo: "Administração",
  },
  { to: "/administracao/dados-entidade", label: "Dados da Entidade", grupo: "Administração" },
  { to: "/administracao/email", label: "E-mail", grupo: "Administração" },
  { to: "/administracao/menu-mobile", label: "Menu Mobile por Papel", grupo: "Administração" },

  // Meu Painel (menu do irmão comum) — itens que não aparecem em nenhum
  // grupo administrativo acima.
  { to: "/painel/dados", label: "Meus Dados", grupo: "Meu Painel" },
  { to: "/painel/financeiro", label: "Financeiro", grupo: "Meu Painel" },
  { to: "/painel/frequencia", label: "Frequência (irmão)", grupo: "Meu Painel" },
  { to: "/painel/sessoes", label: "Sessões", grupo: "Meu Painel" },
  { to: "/painel/eventos", label: "Eventos (irmão)", grupo: "Meu Painel" },
  { to: "/painel/comunicacoes", label: "Comunicações (irmão)", grupo: "Meu Painel" },
];

// CATALOGO_MENU agrupado por `grupo`, preservando a ordem de primeira
// aparição (Membros, Agenda & Ensino, ...) — usado tanto pela tela de
// super-admin (admin-saas/lojas.tsx, issue #456) quanto pela preferência
// pessoal do usuário (conta/menu.tsx, issue #457).
function agruparPorGrupo(): [string, ItemDeMenuCatalogo[]][] {
  const grupos = new Map<string, ItemDeMenuCatalogo[]>();
  for (const item of CATALOGO_MENU) {
    if (!grupos.has(item.grupo)) grupos.set(item.grupo, []);
    grupos.get(item.grupo)!.push(item);
  }
  return [...grupos.entries()];
}
export const CATALOGO_MENU_AGRUPADO = agruparPorGrupo();

const ROTAS_CATALOGADAS = new Set(CATALOGO_MENU.map((i) => i.to));

/** Filtra uma lista de rotas ocultas mantendo só as que existem no catálogo
 * — trava contra salvar lixo (rota digitada errado, item removido do
 * catálogo desde então) vindo do cliente. */
export function filtrarRotasValidas(rotas: string[]): string[] {
  return [...new Set(rotas)].filter((r) => ROTAS_CATALOGADAS.has(r));
}

// Ordenado do `to` mais longo pro mais curto, pra achar o prefixo mais
// específico primeiro (issue #452: breadcrumb de contexto no PageHeader).
// Sem isso, "/tesouraria" casaria antes de "/tesouraria/recibos" numa rota
// tipo "/tesouraria/recibos/imprimir".
const CATALOGO_POR_PREFIXO = [...CATALOGO_MENU].sort((a, b) => b.to.length - a.to.length);

/** Acha o item do catálogo que melhor corresponde a uma rota atual — exato
 * primeiro, depois o prefixo mais específico (`pathname` começa com
 * `to + "/"`). Devolve null pra rotas que não são item de menu (ex.: uma
 * tela de edição tipo `/irmaos/$id`). */
export function encontrarItemDoCatalogo(pathname: string): ItemDeMenuCatalogo | null {
  const exato = CATALOGO_MENU.find((i) => i.to === pathname);
  if (exato) return exato;
  return CATALOGO_POR_PREFIXO.find((i) => pathname.startsWith(i.to + "/")) ?? null;
}
