import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/backend/auth";
import { useSession, useCan, SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Building2,
  Award,
  Truck,
  ReceiptText,
  RefreshCw,
  FileStack,
  Receipt,
  Settings2,
  SplitSquareHorizontal,
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
  BookMarked,
  FolderKanban,
  ChevronDown,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ROLE_LABEL } from "@/lib/format";

type NavItem = { to: string; label: string; icon: any; show: boolean };
type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-serif text-sidebar-primary-foreground shadow-sm">
        ⚜
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold leading-tight">Gestão da Loja</div>
        <div className="truncate text-[11px] text-muted-foreground">Sistema Maçônico</div>
      </div>
    </div>
  );
}

function NavTree({
  dashboard,
  groups,
  isActive,
  open,
  setOpen,
  onNavigate,
  size = "desktop",
}: {
  dashboard: NavItem;
  groups: NavGroup[];
  isActive: (to: string) => boolean;
  open: string[];
  setOpen: (fn: (prev: string[]) => string[]) => void;
  onNavigate?: () => void;
  size?: "desktop" | "mobile";
}) {
  const itemPad = size === "mobile" ? "px-3 py-2.5 text-sm" : "px-2.5 py-1.5 text-[13px]";
  return (
    <>
      <Link
        to={dashboard.to}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
          size === "mobile" ? "py-2.5" : "py-2",
          isActive(dashboard.to)
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        )}
      >
        <dashboard.icon className="h-4 w-4 shrink-0" />
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
                setOpen((prev) => (v ? [...prev, g.id] : prev.filter((x) => x !== g.id)))
              }
            >
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:bg-sidebar-accent/40",
                  size === "mobile" ? "py-2.5" : "py-2",
                  hasActive ? "text-sidebar-foreground" : "text-muted-foreground hover:text-sidebar-foreground",
                )}
              >
                <g.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate text-left">{g.label}</span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pb-1 pl-3">
                  {g.items.map((i) => {
                    const active = isActive(i.to);
                    return (
                      <Link
                        key={i.to}
                        to={i.to}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md transition-colors",
                          itemPad,
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                        )}
                      >
                        <i.icon className={cn("h-3.5 w-3.5 shrink-0", active && "text-sidebar-primary")} />
                        <span className="truncate">{i.label}</span>
                      </Link>
                    );
                  })}
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
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const dashboard: NavItem = {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    show: true,
  };

  const groups: NavGroup[] = [
    {
      id: "cadastros",
      label: "Cadastros",
      icon: FolderKanban,
      items: [
        { to: "/irmaos", label: "Irmãos", icon: Users, show: true },
        { to: "/orgs", label: "Corpos Maçônicos", icon: Building2, show: true },
        { to: "/gestoes", label: "Gestões", icon: Award, show: true },
        { to: "/terceiros", label: "Fornecedores/Clientes", icon: Truck, show: can.canManageFinancas },
        { to: "/sessoes", label: "Sessões", icon: CalendarDays, show: true },
      ],
    },
    {
      id: "tesouraria",
      label: "Tesouraria",
      icon: Wallet,
      items: [
        { to: "/tesouraria", label: "Visão Geral", icon: Wallet, show: can.canManageFinancas || can.isSecretario },
        { to: "/tesouraria/contas", label: "Contas", icon: Landmark, show: can.canManageFinancas },
        { to: "/tesouraria/movimentos", label: "Movimento Financeiro", icon: ArrowLeftRight, show: can.canManageFinancas },
        { to: "/tesouraria/tronco", label: "Tronco de Beneficência", icon: HeartHandshake, show: can.canManageFinancas },
        { to: "/tesouraria/conciliacao", label: "Conciliação Bancária", icon: FileSpreadsheet, show: can.canManageFinancas },
        { to: "/tesouraria/faturas", label: "Faturas", icon: FileStack, show: can.canManageFinancas },
        { to: "/tesouraria/recibos", label: "Recibos", icon: Receipt, show: can.canManageFinancas },
        { to: "/tesouraria/parcelamentos", label: "Parcelamentos", icon: SplitSquareHorizontal, show: can.canManageFinancas },
        { to: "/tesouraria/contas-pagar", label: "Contas a Pagar", icon: ReceiptText, show: can.canManageFinancas },
        { to: "/tesouraria/recorrentes", label: "Despesas Recorrentes", icon: RefreshCw, show: can.canManageFinancas },
        { to: "/tesouraria/parametros", label: "Parâmetros Financeiros", icon: Settings2, show: can.canManageFinancas },
      ],
    },
    {
      id: "contabilidade",
      label: "Contabilidade",
      icon: BookMarked,
      items: [
        { to: "/tesouraria/plano-contas", label: "Plano de Contas", icon: FileBarChart, show: can.canManageFinancas },
        { to: "/contabilidade/razao", label: "Razão Contábil", icon: BookOpen, show: can.canManageFinancas },
        { to: "/contabilidade/diario", label: "Diário Contábil", icon: CalendarClock, show: can.canManageFinancas },
        { to: "/contabilidade/dre", label: "DRE", icon: TrendingUp, show: can.canManageFinancas },
        { to: "/contabilidade/balancete", label: "Balancete", icon: Scale, show: can.canManageFinancas },
        { to: "/contabilidade/orcamento", label: "Orçamento Anual", icon: Calculator, show: can.canManageFinancas },
        { to: "/contabilidade/dre-orcado", label: "DRE Orçado", icon: LineChart, show: can.canManageFinancas },
        { to: "/contabilidade/fluxo-caixa", label: "Fluxo de Caixa", icon: Waves, show: can.canManageFinancas },
        { to: "/contabilidade/fechamento", label: "Fechamento de Exercício", icon: Archive, show: can.canManageFinancas },
        { to: "/contabilidade/auditoria", label: "Auditoria Contábil", icon: ShieldCheck, show: can.canManageFinancas },
      ],
    },
    {
      id: "relatorios",
      label: "Relatórios",
      icon: FileBarChart,
      items: [
        { to: "/relatorios/frequencia", label: "Frequência", icon: FileBarChart, show: true },
        { to: "/relatorios/inadimplentes", label: "Inadimplentes", icon: FileBarChart, show: can.canManageFinancas },
      ],
    },
  ];

  const isActive = (to: string) =>
    loc.pathname === to || (to !== "/dashboard" && to !== "/tesouraria" && loc.pathname.startsWith(to + "/"));

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length > 0);

  const activeGroupId = visibleGroups.find((g) => g.items.some((i) => isActive(i.to)))?.id ?? null;

  const [open, setOpen] = useState<string[]>(activeGroupId ? [activeGroupId] : []);

  useEffect(() => {
    if (activeGroupId) {
      setOpen((prev) => (prev.includes(activeGroupId) ? prev : [...prev, activeGroupId]));
    }
  }, [activeGroupId]);

  // fecha o drawer sempre que a rota muda
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  const signOut = async () => {
    await logout();
    queryClient.setQueryData(SESSAO_QUERY_KEY, null);
    nav({ to: "/auth" });
  };

  const primaryRole = can.roles[0] ?? "irmao";

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* ===== Sidebar fixa — apenas desktop (lg+) ===== */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <div className="border-b border-sidebar-border p-5">
          <Brand />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavTree
            dashboard={dashboard}
            groups={visibleGroups}
            isActive={isActive}
            open={open}
            setOpen={setOpen}
          />
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 text-xs">
            <div className="truncate font-medium">{user?.email}</div>
            <div className="text-muted-foreground">{ROLE_LABEL[primaryRole]}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="mr-1 h-3 w-3" /> Sair
          </Button>
        </div>
      </aside>

      {/* ===== Layout mobile/tablet (< lg) ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-sidebar px-3 text-sidebar-foreground lg:hidden">
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
            <div className="truncate font-medium">{user?.email}</div>
            <div className="truncate text-muted-foreground">{ROLE_LABEL[primaryRole]}</div>
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
                onNavigate={() => setMobileOpen(false)}
                size="mobile"
              />
            </nav>
            <div className="border-t border-sidebar-border p-3">
              <div className="mb-2 text-xs">
                <div className="truncate font-medium">{user?.email}</div>
                <div className="text-muted-foreground">{ROLE_LABEL[primaryRole]}</div>
              </div>
              <Button variant="outline" className="h-10 w-full" onClick={signOut}>
                <LogOut className="mr-1.5 h-4 w-4" /> Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <main className="min-w-0 flex-1">
          <div className="mx-auto min-w-0 max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b pb-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:pb-5">
      <div className="min-w-0">
        <h1 className="text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
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
  icon?: any;
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
      {description && <p className="max-w-sm text-xs text-muted-foreground sm:text-sm">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

