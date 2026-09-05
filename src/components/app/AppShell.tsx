import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/backend/auth";
import { CabecalhoInstitucional } from "./CabecalhoInstitucional";
import { useSession, useCan, SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  FileBarChart,
  LogOut,
  Landmark,
  ShieldCheck,
  Globe,
  Building2,
  Award,
  Truck,
  Banknote,
  RefreshCw,
  FileStack,
  Receipt,
  Settings2,
  ArrowLeftRight,
  HeartHandshake,
  FileSpreadsheet,
  BookOpen,
  CalendarClock,
  TrendingUp,
  Scale,
  Calculator,
  LineChart,
  Waves,
  Archive,
  Mail,
  BookMarked,
  LifeBuoy,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  Moon,
  Sun,
  Trash2,
  ScrollText,
  Download,
  UsersRound,
  UserRound,
  CalendarCheck2,
  PartyPopper,
  GraduationCap,
  GitCompareArrows,
  CalendarPlus,
  CalendarRange,
  FileUp,
  Megaphone,
  AlertTriangle,
  Fingerprint,
  Library,
  Calendar,
  Hourglass,
  Vote,
  Lock,
  FileText,
  ListTree,
  Layers,
  Rocket,
  Newspaper,
  ClipboardCheck,
  UserCog,
  Coins,
  ListChecks,
  FileWarning,
  FileClock,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ROLE_LABEL } from "@/lib/format";
import { useIsDesktop } from "@/lib/use-media-query";
import { useTheme } from "@/lib/use-theme";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NotificationBell } from "@/components/app/NotificationBell";
import { PainelShell } from "@/components/app/PainelShell";
import { PlataformaShell } from "@/components/app/PlataformaShell";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  show: boolean;
  section?: string;
  // Ação destrutiva/irreversível: ganha tratamento visual próprio no NavTree
  // pra não ficar com o mesmo peso de um item de navegação comum (achado do
  // critique automático — ex: Resetar Financeiro ao lado de Recibos).
  destructive?: boolean;
};
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

type SectionChunk = { key: string; label: string | null; items: NavItem[] };

// Agrupa os itens de um grupo por `section` consecutiva, carregando adiante
// o rótulo do último item que declarou `section` explicitamente (mesmo
// contrato implícito que o `mostraSecao` original usava item a item — ver
// achado do critique automático sobre grupos densos como Tesouraria).
function chunkBySection(items: NavItem[]): SectionChunk[] {
  const chunks: SectionChunk[] = [];
  for (const item of items) {
    const last = chunks[chunks.length - 1];
    if (item.section && last?.label !== item.section) {
      chunks.push({ key: `${chunks.length}-${item.section}`, label: item.section, items: [item] });
    } else if (last) {
      last.items.push(item);
    } else {
      chunks.push({ key: "sem-secao", label: null, items: [item] });
    }
  }
  return chunks;
}

function Brand() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <img src="/brand/sglfm-mark.svg" alt="SGLFM" className="h-10 w-9 shrink-0 object-contain" />
      <div className="min-w-0">
        <div className="font-serif text-base font-semibold leading-tight tracking-wide">SGLFM</div>
        <div className="truncate text-[10px] text-sidebar-foreground/60">
          Gestão de Loja Filosófica
        </div>
      </div>
    </div>
  );
}

function SidebarIcon({
  icon: Icon,
  label,
  active,
  onClick,
  to,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick?: () => void;
  to?: string;
}) {
  const className = cn(
    "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {to ? (
          <Link to={to} className={className} aria-label={label}>
            <Icon className="h-4 w-4" />
          </Link>
        ) : (
          <button type="button" onClick={onClick} className={className} aria-label={label}>
            <Icon className="h-4 w-4" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavTree({
  dashboard,
  groups,
  isActive,
  open,
  setOpen,
  openSections,
  setOpenSections,
  onNavigate,
  size = "desktop",
  collapsed = false,
  onExpandGroup,
  asButtons = false,
}: {
  dashboard: NavItem;
  groups: NavGroup[];
  isActive: (to: string) => boolean;
  open: string[];
  setOpen: (fn: (prev: string[]) => string[]) => void;
  // Segundo nível de disclosure dentro de um grupo denso (ex.: Tesouraria,
  // 22 itens): cada `section` vira um sub-accordion independente, recolhido
  // por padrão exceto a seção da rota ativa (achado do critique automático
  // sobre chunking ≤4/carga cognitiva em grupos grandes).
  openSections: string[];
  setOpenSections: (fn: (prev: string[]) => string[]) => void;
  onNavigate?: () => void;
  size?: "desktop" | "mobile";
  collapsed?: boolean;
  onExpandGroup?: (groupId: string) => void;
  // Menu "Meu Painel" (usuário comum, papel único "irmao") pediu pra cada
  // item aparecer com cara de botão — o menu admin (Cadastros/Atividades/
  // Tesouraria/...), que reusa este mesmo NavTree, ficou de fora do pedido
  // e continua só com hover.
  asButtons?: boolean;
}) {
  const itemPad = size === "mobile" ? "px-3 py-2.5 text-sm" : "px-2.5 py-1.5 text-[13px]";

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <SidebarIcon
          to={dashboard.to}
          icon={dashboard.icon}
          label={dashboard.label}
          active={isActive(dashboard.to)}
        />
        <div className="my-1 h-px w-8 bg-sidebar-border" />
        {groups.map((g) => (
          <SidebarIcon
            key={g.id}
            icon={g.icon}
            label={g.label}
            active={g.items.some((i) => isActive(i.to))}
            onClick={() => onExpandGroup?.(g.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <Link
        to={dashboard.to}
        onClick={onNavigate}
        className={cn(
          asButtons
            ? buttonVariants({ variant: "outline", size: "sm" })
            : "rounded-md transition-colors",
          "flex w-full items-center justify-start gap-2.5 px-3 text-sm",
          asButtons && "h-auto",
          size === "mobile" ? "py-2.5" : "py-2",
          isActive(dashboard.to)
            ? cn(
                "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                asButtons ? "border-sidebar-accent hover:bg-sidebar-accent" : "shadow-sm",
              )
            : cn(
                "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                asButtons && "border-sidebar-border",
              ),
        )}
      >
        <dashboard.icon
          className={cn("h-4 w-4 shrink-0", isActive(dashboard.to) && "text-sidebar-primary")}
        />
        {dashboard.label}
      </Link>

      <div className="space-y-1 pt-2">
        {groups.map((g) => {
          const isOpen = open.includes(g.id);
          const hasActive = g.items.some((i) => isActive(i.to));
          return (
            <Collapsible
              key={g.id}
              open={isOpen}
              onOpenChange={(v) =>
                setOpen((prev) => {
                  if (!v) return prev.filter((x) => x !== g.id);
                  // Accordion exclusivo no menu admin (achado do critique: sem
                  // isso dava pra abrir Tesouraria+Contabilidade+Comunicação &
                  // Site ao mesmo tempo, ~50 links visíveis de uma vez). O
                  // menu "Meu Painel" (asButtons) só tem 1 grupo, então manter
                  // o comportamento aditivo ali é inofensivo.
                  return asButtons ? [...prev, g.id] : [g.id];
                })
              }
            >
              <CollapsibleTrigger
                className={cn(
                  asButtons
                    ? buttonVariants({ variant: "outline", size: "sm" })
                    : "rounded-md transition-colors",
                  "flex w-full items-center gap-2 border border-transparent px-3 text-[11px] font-semibold uppercase tracking-wider hover:border-sidebar-border hover:bg-sidebar-accent/40",
                  asButtons && "h-auto border-sidebar-border",
                  size === "mobile" ? "py-2.5" : "py-2",
                  hasActive
                    ? "text-sidebar-foreground"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground",
                )}
              >
                <g.icon
                  className={cn("h-3.5 w-3.5 shrink-0", hasActive && "text-sidebar-primary")}
                />
                <span className="flex-1 truncate text-left">{g.label}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                    isOpen && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div
                  className={cn(
                    "ml-4 mt-0.5 space-y-0.5 pb-1 pl-3",
                    asButtons ? "mt-1 space-y-1" : "border-l border-sidebar-border",
                  )}
                >
                  {(() => {
                    const renderItem = (i: NavItem) => {
                      const active = isActive(i.to);
                      return (
                        <Link
                          key={i.to}
                          to={i.to}
                          onClick={onNavigate}
                          className={cn(
                            asButtons
                              ? buttonVariants({ variant: "outline", size: "sm" })
                              : "rounded-md transition-colors",
                            "flex w-full items-center justify-start gap-2.5 border border-transparent",
                            asButtons && "h-auto",
                            itemPad,
                            i.destructive
                              ? cn(
                                  "text-sidebar-destructive hover:border-sidebar-destructive/40 hover:bg-sidebar-destructive/10 hover:text-sidebar-destructive",
                                  active &&
                                    "border-sidebar-destructive/40 bg-sidebar-destructive/10 font-medium",
                                  asButtons && "hover:border-sidebar-destructive/60",
                                )
                              : active
                                ? cn(
                                    "border-sidebar-accent bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                                    asButtons && "hover:bg-sidebar-accent",
                                  )
                                : cn(
                                    "text-sidebar-foreground/75 hover:border-sidebar-border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                                    asButtons && "border-sidebar-border",
                                  ),
                          )}
                        >
                          <i.icon
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              i.destructive
                                ? "text-sidebar-destructive"
                                : active && "text-sidebar-primary",
                            )}
                          />
                          <span className="truncate">{i.label}</span>
                        </Link>
                      );
                    };

                    return chunkBySection(g.items).map((chunk) => {
                      if (!chunk.label) {
                        return <Fragment key={chunk.key}>{chunk.items.map(renderItem)}</Fragment>;
                      }
                      // Sub-accordion por seção: recolhido por padrão, exceto a
                      // seção que contém a rota ativa (evita despejar os ~22
                      // itens de um grupo denso como Tesouraria de uma vez).
                      const sectionKey = `${g.id}::${chunk.label}`;
                      const sectionOpen = openSections.includes(sectionKey);
                      const sectionActive = chunk.items.some((i) => isActive(i.to));
                      return (
                        <Collapsible
                          key={chunk.key}
                          open={sectionOpen}
                          onOpenChange={(v) =>
                            setOpenSections((prev) =>
                              v ? [...prev, sectionKey] : prev.filter((x) => x !== sectionKey),
                            )
                          }
                        >
                          <CollapsibleTrigger
                            className={cn(
                              "flex w-full items-center gap-1.5 px-2.5 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wider first:pt-0 hover:text-sidebar-foreground",
                              sectionActive
                                ? "text-sidebar-foreground"
                                : "text-sidebar-foreground/65",
                            )}
                          >
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 shrink-0 transition-transform duration-200",
                                sectionOpen && "rotate-180",
                              )}
                            />
                            <span className="flex-1 truncate text-left">{chunk.label}</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                            <div className="space-y-0.5">{chunk.items.map(renderItem)}</div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    });
                  })()}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const can = useCan();
  const nav = useNavigate();
  const loc = useLocation();
  const rotasRelatorioContabil = [
    "/contabilidade/razao",
    "/contabilidade/diario",
    "/contabilidade/dre",
    "/contabilidade/dre-orcado",
    "/contabilidade/balancete",
    "/contabilidade/fluxo-caixa",
    "/contabilidade/conferencia",
  ];
  const exibirCabecalhoRelatorio =
    loc.pathname.startsWith("/relatorios/") ||
    rotasRelatorioContabil.some((rota) => loc.pathname.startsWith(rota));
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("sidebarCollapsed") === "1",
  );
  const { dark, toggle: toggleDark } = useTheme();

  // Quem só tem o papel "irmao": no desktop usa esta mesma barra lateral
  // (reduzida a "Meu Painel"), no celular/tablet usa o shell de app
  // (PainelShell) — ver o passthrough mais abaixo e _authenticated/painel/route.tsx.
  const dashboard: NavItem = can.isMemberOnly
    ? { to: "/painel", label: "Início", icon: UserRound, show: true }
    : { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true };

  const groupsMemberOnly: NavGroup[] = [
    {
      id: "meu-painel",
      label: "Meu Painel",
      icon: UserRound,
      items: [
        { to: "/painel/dados", label: "Meus Dados", icon: UserRound, show: true },
        { to: "/painel/financeiro", label: "Financeiro", icon: Wallet, show: true },
        { to: "/painel/frequencia", label: "Frequência", icon: CalendarCheck2, show: true },
        { to: "/painel/sessoes", label: "Sessões", icon: CalendarDays, show: true },
        { to: "/painel/eventos", label: "Eventos", icon: PartyPopper, show: true },
        { to: "/painel/comunicacoes", label: "Comunicações", icon: Megaphone, show: true },
        { to: "/biblioteca", label: "Biblioteca de Peças", icon: Library, show: true },
        { to: "/calendario", label: "Calendário", icon: Calendar, show: true },
        { to: "/enquetes", label: "Enquetes", icon: Vote, show: true },
        { to: "/documentos", label: "Legislação", icon: Scale, show: true },
        { to: "/painel/chamados", label: "Chamados de Suporte", icon: LifeBuoy, show: true },
      ],
    },
  ];

  const groupsAdmin: NavGroup[] = [
    {
      id: "membros",
      label: "Membros",
      icon: Users,
      items: [
        { to: "/irmaos", label: "Irmãos", icon: Users, show: true },
        { to: "/orgs", label: "Corpos Maçônicos", icon: Building2, show: true },
        { to: "/gestoes", label: "Gestões", icon: Award, show: true },
        { to: "/comissoes", label: "Comissões", icon: UsersRound, show: true },
        {
          to: "/interstico",
          label: "Interstício",
          icon: Hourglass,
          show: can.canManageIrmaos,
        },
      ],
    },
    {
      id: "agenda-ensino",
      label: "Agenda & Ensino",
      icon: CalendarRange,
      items: [
        { to: "/calendario", label: "Calendário", icon: Calendar, show: true },
        { to: "/eventos", label: "Eventos", icon: PartyPopper, show: true },
        { to: "/ensino/planos", label: "Planos de Ensino", icon: GraduationCap, show: true },
        { to: "/relatorios/frequencia", label: "Frequência", icon: FileBarChart, show: true },
        {
          to: "/ensino/importar-calendario",
          label: "Importar Calendário",
          icon: CalendarPlus,
          show: can.canManageIrmaos,
          section: "Importadores",
        },
        {
          to: "/ensino/importar-pdf-sessoes",
          label: "Cronograma (PDF)",
          icon: FileUp,
          show: can.canManageIrmaos,
        },
        {
          to: "/ensino/importar-planos-ensino",
          label: "Planos de Ensino (PDF)",
          icon: FileUp,
          show: can.canManageIrmaos,
        },
      ],
    },
    // Comunicação interna (comunicados, biblioteca de peças, enquetes,
    // legislação) e o site institucional público (issues #366/#367/#380,
    // ampliado pela #391 com Editor CMS/Aprovador CMS) viraram um grupo só:
    // as duas coisas são "o que a Loja publica e pra quem" — só muda a
    // audiência (irmãos vs. público). Agenda Pública e Menu do Site
    // continuam exclusivos de super_admin — comPapelPortalPublico, sem
    // mudança — por não terem um "grão" que faça sentido pra um colunista
    // (decisão registrada na #391). Notícias e Páginas agora também abrem
    // pra editor_cms/aprovador_cms, com o que cada um pode fazer decidido
    // dentro da própria tela (comPapelEditorialCms).
    {
      id: "comunicacao-site",
      label: "Comunicação & Site",
      icon: Megaphone,
      items: [
        {
          to: "/comunicacoes",
          label: "Comunicações",
          icon: Megaphone,
          show: true,
          section: "Comunicação Interna",
        },
        { to: "/biblioteca", label: "Biblioteca de Peças", icon: Library, show: true },
        { to: "/enquetes", label: "Enquetes", icon: Vote, show: true },
        { to: "/documentos", label: "Legislação", icon: Scale, show: true },
        {
          to: "/noticias-site",
          label: "Notícias do Site",
          icon: Newspaper,
          show: can.canAcessarCms,
          section: "Site Público",
        },
        {
          to: "/agenda-publica",
          label: "Agenda Pública",
          icon: CalendarPlus,
          show: can.isSuperAdmin,
        },
        {
          to: "/paginas-site",
          label: "Páginas do Site",
          icon: FileText,
          show: can.canAcessarCms,
        },
        {
          to: "/menu-site",
          label: "Menu do Site",
          icon: ListTree,
          show: can.isSuperAdmin,
        },
        {
          to: "/cms-aprovacoes",
          label: "Aprovações do Site",
          icon: ClipboardCheck,
          show: can.isSuperAdmin || can.isAprovadorCms,
        },
        {
          to: "/cms-editores",
          label: "Editores do Site",
          icon: UserCog,
          show: can.isSuperAdmin,
        },
      ],
    },
    {
      id: "tesouraria",
      label: "Tesouraria",
      icon: Wallet,
      items: [
        {
          to: "/tesouraria",
          label: "Visão Geral",
          icon: Wallet,
          show: can.canManageFinancas || can.isSecretario,
        },
        {
          to: "/tesouraria/contas",
          label: "Contas",
          icon: Landmark,
          show: can.canManageFinancas,
          section: "Cadastro",
        },
        {
          to: "/tesouraria/parametros",
          label: "Parâmetros Financeiros",
          icon: Settings2,
          show: can.canManageFinancas,
        },
        {
          to: "/tesouraria/tabela-valores",
          label: "Tabela de Valores da Loja",
          icon: TrendingUp,
          show: can.canManageFinancas,
        },
        {
          to: "/terceiros",
          label: "Fornecedores/Clientes",
          icon: Truck,
          show: can.canManageFinancas,
        },
        {
          to: "/tesouraria/movimentos",
          label: "Movimento Financeiro",
          icon: ArrowLeftRight,
          show: can.canManageFinancas,
          section: "Operações",
        },
        {
          to: "/tesouraria/tronco",
          label: "Tronco de Beneficência",
          icon: HeartHandshake,
          show: can.canManageFinancas,
        },
        {
          to: "/tesouraria/conciliacao",
          label: "Conciliação Bancária",
          icon: FileSpreadsheet,
          show: can.canManageFinancas,
        },
        {
          to: "/tesouraria/faturas",
          label: "Faturas",
          icon: FileStack,
          show: can.canManageFinancas,
        },
        {
          to: "/tesouraria/parcelamentos",
          label: "Parcelamentos",
          icon: Layers,
          show: can.canManageFinancas,
        },
        {
          to: "/sgcab/cobrancas",
          label: "Controle SGCAB",
          icon: ScrollText,
          show: can.isTesoureiro || can.isSecretario,
        },
        { to: "/tesouraria/recibos", label: "Recibos", icon: Receipt, show: can.canManageFinancas },
        {
          to: "/tesouraria/contas-pagar",
          label: "Contas a Pagar",
          icon: Banknote,
          show: can.canManageFinancas,
        },
        {
          to: "/tesouraria/recorrentes",
          label: "Despesas Recorrentes",
          icon: RefreshCw,
          show: can.canManageFinancas,
        },
        {
          to: "/relatorios/recebimentos",
          label: "Recebimentos no Mês",
          icon: Coins,
          show: can.canManageFinancas,
          section: "Relatórios",
        },
        {
          to: "/relatorios/extrato-conciliacao",
          label: "Extrato da Conciliação",
          icon: ListChecks,
          show: can.canManageFinancas,
        },
        {
          to: "/relatorios/extrato-bancario",
          label: "Extrato Bancário",
          icon: FileClock,
          show: can.canManageFinancas,
        },
        {
          to: "/relatorios/extrato-irmao",
          label: "Extrato do Irmão",
          icon: UserRound,
          show: can.canManageFinancas,
        },
        {
          to: "/relatorios/inadimplentes",
          label: "Inadimplentes",
          icon: AlertTriangle,
          show: can.canManageFinancas,
        },
        {
          to: "/relatorios/inadimplencia",
          label: "Inadimplência Detalhada",
          icon: FileWarning,
          show: can.canManageFinancas,
        },
        {
          to: "/administracao/fechamento-periodo",
          label: "Fechamento de Período",
          icon: Lock,
          show: can.isAdmin,
          section: "Encerramento",
        },
        {
          to: "/administracao/resetar-financeiro",
          label: "Resetar Financeiro",
          icon: Trash2,
          show: can.isAdmin,
          destructive: true,
        },
      ],
    },
    {
      id: "contabilidade",
      label: "Contabilidade",
      icon: BookMarked,
      items: [
        {
          to: "/contabilidade/razao",
          label: "Razão Contábil",
          icon: BookOpen,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/diario",
          label: "Diário Contábil",
          icon: CalendarClock,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/dre",
          label: "DRE",
          icon: TrendingUp,
          show: can.canManageFinancas,
          section: "Relatórios",
        },
        {
          to: "/contabilidade/dre-orcado",
          label: "DRE Orçado",
          icon: LineChart,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/balancete",
          label: "Balancete",
          icon: Scale,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/fluxo-caixa",
          label: "Fluxo de Caixa",
          icon: Waves,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/orcamento",
          label: "Orçamento Anual",
          icon: Calculator,
          show: can.canManageFinancas,
          section: "Fechamento",
        },
        {
          to: "/contabilidade/fechamento",
          label: "Fechamento de Exercício",
          icon: Archive,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/auditoria",
          label: "Auditoria Contábil",
          icon: ShieldCheck,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/conferencia",
          label: "Conferência Contábil x Financeira",
          icon: GitCompareArrows,
          show: can.canManageFinancas,
        },
        {
          to: "/contabilidade/plano-contas",
          label: "Plano de Contas",
          icon: FileBarChart,
          show: can.canManageFinancas,
          section: "Cadastro",
        },
        {
          to: "/contabilidade/parametros",
          label: "Parâmetros Contábeis",
          icon: Settings2,
          show: can.canManageFinancas,
        },
      ],
    },
    {
      id: "administracao",
      label: "Administração",
      icon: ShieldCheck,
      items: [
        { to: "/painel/chamados", label: "Chamados de Suporte", icon: LifeBuoy, show: true },
        { to: "/usuarios", label: "Usuários", icon: UsersRound, show: can.isAdmin },
        {
          to: "/administracao/auditoria",
          label: "Auditoria",
          icon: ScrollText,
          show: can.isAdmin,
        },
        {
          to: "/administracao/exportar-dados",
          label: "Exportar Dados",
          icon: Download,
          show: can.isAdmin,
        },
        {
          to: "/administracao/backups",
          label: "Backups",
          icon: Archive,
          show: can.isAdmin,
        },
        {
          to: "/administracao/configuracao-inicial",
          label: "Configuração Inicial",
          icon: Rocket,
          show: can.isAdmin,
        },
        {
          to: "/administracao/dados-entidade",
          label: "Dados da Entidade",
          icon: FileText,
          show: can.isAdmin,
        },
        {
          to: "/administracao/email",
          label: "E-mail",
          icon: Mail,
          show: can.isAdmin,
        },
      ],
    },
  ];

  const groups = can.isMemberOnly ? groupsMemberOnly : groupsAdmin;

  const isActive = (to: string) =>
    loc.pathname === to ||
    (to !== "/dashboard" &&
      to !== "/tesouraria" &&
      to !== "/painel" &&
      loc.pathname.startsWith(to + "/"));

  // Itens ocultados pelo super-admin da plataforma pra todos os usuários
  // desta loja (issue #456) — filtro aplicado antes do filtro por papel,
  // então nenhuma permissão consegue "desocultar" o que a plataforma tirou.
  const menuOcultos = new Set(user?.menuItensOcultos ?? []);

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show && !menuOcultos.has(i.to)) }))
    .filter((g) => g.items.length > 0);

  const activeGroupId = visibleGroups.find((g) => g.items.some((i) => isActive(i.to)))?.id ?? null;

  // Menu "Meu Painel" (papel único "irmao") tem um grupo só — não faz sentido
  // ele nascer fechado esperando uma rota ativa dentro dele pra se abrir
  // (achado do critique automático: irmão pousa em /painel, activeGroupId
  // fica null, e a única seção do menu aparece fechada no primeiro acesso).
  const [open, setOpen] = useState<string[]>(() =>
    can.isMemberOnly ? visibleGroups.map((g) => g.id) : activeGroupId ? [activeGroupId] : [],
  );

  useEffect(() => {
    // Exclusivo: navegar pra dentro de um grupo fecha os demais (menu
    // "Meu Painel" só tem 1 grupo, então isto não muda nada pra ele).
    if (activeGroupId) setOpen([activeGroupId]);
  }, [activeGroupId]);

  // Segundo nível de disclosure (achado do critique automático: grupos como
  // Tesouraria/22 itens violam chunking ≤4 mesmo com sub-rótulos de seção).
  // Cada `section` dentro de um grupo vira um sub-accordion independente,
  // recolhido por padrão exceto o que contém a rota ativa.
  const activeSectionKey = (() => {
    for (const g of visibleGroups) {
      for (const chunk of chunkBySection(g.items)) {
        if (chunk.label && chunk.items.some((i) => isActive(i.to)))
          return `${g.id}::${chunk.label}`;
      }
    }
    return null;
  })();

  const [openSections, setOpenSections] = useState<string[]>(() =>
    activeSectionKey ? [activeSectionKey] : [],
  );

  useEffect(() => {
    if (activeSectionKey) {
      setOpenSections((prev) =>
        prev.includes(activeSectionKey) ? prev : [...prev, activeSectionKey],
      );
    }
  }, [activeSectionKey]);

  // Paleta de comando (Cmd/Ctrl+K): busca sobre todos os itens visíveis do
  // menu, sem precisar navegar accordion por accordion (achado do critique
  // automático: sem busca/atalho, o usuário avançado reabre e rola grupos
  // densos como Tesouraria toda vez que muda de tela).
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const goTo = (to: string) => {
    setPaletteOpen(false);
    nav({ to });
  };

  // fecha o drawer sempre que a rota muda
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  // Clicar num grupo com a barra recolhida expande a barra e já abre o grupo,
  // em vez de tentar mostrar um flyout.
  const expandGroup = (groupId: string) => {
    setCollapsed(false);
    setOpen((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
  };

  const signOut = async () => {
    await logout();
    queryClient.setQueryData(SESSAO_QUERY_KEY, null);
    nav({ to: "/auth" });
  };

  const primaryRole = can.roles[0] ?? "irmao";

  // Área de Plataforma (issue #358): shell próprio, não o menu da Loja com
  // um item a mais — troca completa de chrome, em qualquer largura de tela.
  // A guarda de acesso em si já está em admin-saas/route.tsx (beforeLoad);
  // aqui é só escolha de layout.
  if (loc.pathname.startsWith("/admin-saas")) {
    return <PlataformaShell>{children}</PlataformaShell>;
  }

  // No celular/tablet, o perfil "irmao" precisa manter o mesmo shell em
  // todas as rotas autenticadas. Antes ele era aplicado apenas em /painel;
  // Biblioteca, Calendário, Enquetes, Legislação e Segurança ficavam sem
  // qualquer caminho visível de volta.
  if (can.isMemberOnly && !isDesktop) {
    return <PainelShell>{children}</PainelShell>;
  }

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* ===== Sidebar fixa — apenas desktop (lg+) ===== */}
      <TooltipProvider delayDuration={200}>
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 self-start flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 print:hidden lg:flex",
            collapsed ? "w-[68px]" : "w-64",
          )}
        >
          <div
            className={cn(
              "border-b border-sidebar-border",
              collapsed
                ? "flex flex-col items-center gap-2 p-3"
                : "flex items-center justify-between gap-2 p-4",
            )}
          >
            {collapsed ? (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-serif text-sidebar-primary-foreground shadow-sm">
                ⚜
              </div>
            ) : (
              <Brand />
            )}
            <div className="flex shrink-0 items-center gap-1">
              {!can.isMemberOnly && <NotificationBell collapsed={collapsed} />}
              {!collapsed && (
                <button
                  type="button"
                  aria-label="Buscar no menu (Ctrl+K)"
                  onClick={() => setPaletteOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                >
                  <Search className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                onClick={() => setCollapsed((v) => !v)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                {collapsed ? (
                  <ChevronsRight className="h-4 w-4" />
                ) : (
                  <ChevronsLeft className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-3" : "space-y-1 p-3")}>
            <NavTree
              dashboard={dashboard}
              groups={visibleGroups}
              isActive={isActive}
              open={open}
              setOpen={setOpen}
              openSections={openSections}
              setOpenSections={setOpenSections}
              collapsed={collapsed}
              onExpandGroup={expandGroup}
              asButtons={can.isMemberOnly}
            />
          </nav>

          <div
            className={cn(
              "border-t border-sidebar-border",
              collapsed ? "flex flex-col items-center gap-2 p-2" : "p-3",
            )}
          >
            {!collapsed && (
              <div className="mb-2 text-xs">
                <div className="truncate font-medium">{user?.nomeCompleto ?? user?.email}</div>
                {user?.nomeCompleto && (
                  <div className="truncate text-sidebar-foreground/60">{user?.email}</div>
                )}
              </div>
            )}
            {collapsed ? (
              <>
                {can.isSuperAdmin && (
                  <SidebarIcon icon={Globe} label="Plataforma" active={false} to="/admin-saas" />
                )}
                <SidebarIcon
                  icon={Fingerprint}
                  label="Segurança"
                  active={false}
                  to="/conta/seguranca"
                />
                <SidebarIcon
                  icon={dark ? Sun : Moon}
                  label={dark ? "Modo claro" : "Modo escuro"}
                  active={false}
                  onClick={toggleDark}
                />
                <SidebarIcon icon={LogOut} label="Sair" active={false} onClick={signOut} />
              </>
            ) : (
              <>
                {can.isSuperAdmin && (
                  <Button variant="outline" size="sm" className="w-full text-foreground" asChild>
                    <Link to="/admin-saas">
                      <Globe className="mr-1 h-3 w-3" /> Plataforma
                    </Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("w-full text-foreground", can.isSuperAdmin && "mt-2")}
                  asChild
                >
                  <Link to="/conta/seguranca">
                    <Fingerprint className="mr-1 h-3 w-3" /> Segurança
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full text-foreground"
                  onClick={toggleDark}
                >
                  {dark ? <Sun className="mr-1 h-3 w-3" /> : <Moon className="mr-1 h-3 w-3" />}
                  {dark ? "Modo claro" : "Modo escuro"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full text-foreground"
                  onClick={signOut}
                >
                  <LogOut className="mr-1 h-3 w-3" /> Sair
                </Button>
                <Link
                  to="/privacidade"
                  target="_blank"
                  className="mt-2 block text-center text-[11px] text-sidebar-foreground/55 underline"
                >
                  Política de Privacidade
                </Link>
              </>
            )}
          </div>
        </aside>
      </TooltipProvider>

      {/* ===== Layout mobile/tablet (< lg) ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-sidebar px-3 text-sidebar-foreground print:hidden lg:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent/60"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <Brand />
          </div>
          <div className="hidden min-w-0 max-w-[40%] text-right text-[11px] sm:block">
            <div className="truncate font-medium">{user?.nomeCompleto ?? user?.email}</div>
            {user?.nomeCompleto && (
              <div className="truncate text-sidebar-foreground/60">{user?.email}</div>
            )}
          </div>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="flex w-[86vw] max-w-[320px] flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground lg:hidden"
          >
            <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
            <div className="border-b border-sidebar-border p-4 pr-12">
              <Brand />
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              <NavTree
                dashboard={dashboard}
                groups={visibleGroups}
                isActive={isActive}
                open={open}
                setOpen={setOpen}
                openSections={openSections}
                setOpenSections={setOpenSections}
                onNavigate={() => setMobileOpen(false)}
                size="mobile"
                asButtons={can.isMemberOnly}
              />
            </nav>
            <div className="border-t border-sidebar-border p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium">{user?.nomeCompleto ?? user?.email}</div>
                  {user?.nomeCompleto && (
                    <div className="truncate text-sidebar-foreground/60">{user?.email}</div>
                  )}
                </div>
                <Link
                  to="/privacidade"
                  target="_blank"
                  className="shrink-0 text-sidebar-foreground/55 underline"
                >
                  Privacidade
                </Link>
              </div>
              {can.isSuperAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2 h-11 w-full text-foreground sm:h-11"
                  asChild
                >
                  <Link to="/admin-saas">
                    <Globe className="mr-1.5 h-3.5 w-3.5" /> Plataforma
                  </Link>
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 text-foreground sm:h-11"
                  onClick={toggleDark}
                >
                  {dark ? (
                    <Sun className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Moon className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {dark ? "Claro" : "Escuro"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 text-foreground sm:h-11"
                  onClick={signOut}
                >
                  <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sair
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
          <CommandInput placeholder="Buscar no menu..." />
          <CommandList>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            <CommandGroup heading={dashboard.label}>
              <CommandItem value={dashboard.label} onSelect={() => goTo(dashboard.to)}>
                <dashboard.icon className="h-4 w-4" />
                {dashboard.label}
              </CommandItem>
            </CommandGroup>
            {visibleGroups.map((g) => (
              <CommandGroup key={g.id} heading={g.label}>
                {g.items.map((i) => (
                  <CommandItem
                    key={i.to}
                    value={`${g.label} ${i.label}`}
                    onSelect={() => goTo(i.to)}
                  >
                    <i.icon className={cn("h-4 w-4", i.destructive && "text-destructive")} />
                    <span className={cn(i.destructive && "text-destructive")}>{i.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </CommandDialog>

        <main className="min-w-0 flex-1">
          <div className="mx-auto min-w-0 max-w-7xl p-4 sm:p-6 lg:p-8">
            {exibirCabecalhoRelatorio && <CabecalhoInstitucional />}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b pb-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:pb-5">
      <div className="min-w-0">
        <h1 className="font-display text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 [&>*]:min-w-0 [&_button]:max-w-full">
          {actions}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      {Icon && (
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <p className="max-w-sm text-xs text-muted-foreground sm:text-sm">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
