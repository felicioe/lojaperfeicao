import {
  Wallet,
  CalendarCheck2,
  CalendarDays,
  Megaphone,
  PartyPopper,
  ShieldCheck,
  Library,
  Calendar,
  Vote,
  Scale,
  LifeBuoy,
  Fingerprint,
  type LucideIcon,
} from "lucide-react";

// Fonte única dos itens configuráveis do Meu Painel mobile (issue #464) —
// antes desta issue #467 (auditoria de UX), PainelShell.tsx e a tela
// /painel/index.tsx mantinham duas listas manuais com ordem e conjunto
// ligeiramente diferentes (achado da auditoria: risco de desincronia, cor
// só existia numa das duas). Agora as abas, o menu-gaveta E a grade de
// ícones da home resolvem a partir exatamente desta lista + desta função,
// então mostram sempre os mesmos itens, na mesma ordem e com a mesma cor.
//
// "Início" fica de fora de propósito: é sempre a 1a aba fixa/atalho, não
// faz sentido o admin tirar o pouso da navegação. Política de Privacidade e
// Modo escuro também ficam de fora: são utilidades de conta, não conteúdo,
// continuam fixas no fim do menu-gaveta (ver PainelShell.tsx).
export type ItemMobileIrmao = {
  to: string;
  label: string;
  icon: LucideIcon;
  // Fundo+ícone em superfície clara (menu-gaveta, grade da home).
  tint: string;
  // Só a cor do ícone, pensada pra contrastar no fundo escuro da barra de
  // abas (bg-primary) — mesma matiz da coluna acima, tom mais claro.
  onPrimary: string;
};

export const ITENS_MOBILE_IRMAO: ItemMobileIrmao[] = [
  {
    to: "/painel/financeiro",
    label: "Financeiro",
    icon: Wallet,
    tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    onPrimary: "text-emerald-300 dark:text-emerald-700",
  },
  {
    to: "/painel/sessoes",
    label: "Sessões",
    icon: CalendarDays,
    tint: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300",
    onPrimary: "text-indigo-300 dark:text-indigo-700",
  },
  {
    to: "/painel/comunicacoes",
    label: "Comunicações",
    icon: Megaphone,
    tint: "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
    onPrimary: "text-rose-300 dark:text-rose-700",
  },
  {
    to: "/painel/eventos",
    label: "Eventos",
    icon: PartyPopper,
    tint: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
    onPrimary: "text-fuchsia-300 dark:text-fuchsia-700",
  },
  {
    to: "/painel/frequencia",
    label: "Frequência",
    icon: CalendarCheck2,
    tint: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300",
    onPrimary: "text-blue-300 dark:text-blue-700",
  },
  {
    to: "/painel/dados",
    label: "Meus Dados",
    icon: ShieldCheck,
    tint: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
    onPrimary: "text-slate-300 dark:text-slate-700",
  },
  {
    to: "/biblioteca",
    label: "Biblioteca de Peças",
    icon: Library,
    tint: "bg-teal-100 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300",
    onPrimary: "text-teal-300 dark:text-teal-700",
  },
  {
    to: "/calendario",
    label: "Calendário",
    icon: Calendar,
    tint: "bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
    onPrimary: "text-sky-300 dark:text-sky-700",
  },
  {
    to: "/enquetes",
    label: "Enquetes",
    icon: Vote,
    tint: "bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    onPrimary: "text-violet-300 dark:text-violet-700",
  },
  {
    to: "/documentos",
    label: "Legislação",
    icon: Scale,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    onPrimary: "text-amber-300 dark:text-amber-800",
  },
  {
    to: "/painel/chamados",
    label: "Chamados de Suporte",
    icon: LifeBuoy,
    tint: "bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300",
    onPrimary: "text-orange-300 dark:text-orange-700",
  },
];

// "Segurança da conta" é utilidade de conta, não item de conteúdo — fica de
// fora de ITENS_MOBILE_IRMAO (não é reordenável nem ocultável pelo admin),
// mas ainda ganha a mesma cor na home/gaveta pra consistência visual.
export const ITEM_SEGURANCA_IRMAO: ItemMobileIrmao = {
  to: "/conta/seguranca",
  label: "Segurança",
  icon: Fingerprint,
  tint: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300",
  onPrimary: "text-red-300 dark:text-red-700",
};

export type PreferenciasMenuIrmao = {
  menuItensOcultos: string[];
  menuItensOcultosPessoal: string[];
  menuMobilePapel: string[] | null;
};

// Resolve quais itens ficam ativos e em que ordem, camada por camada — mesma
// composição de AppShell.tsx: oculto-por-loja (#456) + oculto-pessoal (#457)
// primeiro, depois a trava por papel (#464), que também decide a ordem
// quando configurada (admin define a prioridade; sem configuração, mantém a
// ordem padrão de ITENS_MOBILE_IRMAO).
export function resolverItensMobileIrmao(user: PreferenciasMenuIrmao): ItemMobileIrmao[] {
  const ocultos = new Set([...user.menuItensOcultos, ...user.menuItensOcultosPessoal]);
  let itens = ITENS_MOBILE_IRMAO.filter((i) => !ocultos.has(i.to));
  if (user.menuMobilePapel !== null) {
    const permitidos = new Set(user.menuMobilePapel);
    const ordem = new Map(user.menuMobilePapel.map((to, indice) => [to, indice]));
    itens = itens
      .filter((i) => permitidos.has(i.to))
      .sort((a, b) => ordem.get(a.to)! - ordem.get(b.to)!);
  }
  return itens;
}
