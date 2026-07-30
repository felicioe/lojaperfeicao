import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useCan } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ROLE_LABEL } from "@/lib/format";

type NavItem = { to: string; label: string; icon: any; show: boolean };
type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const can = useCan();
  const nav = useNavigate();
  const loc = useLocation();

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

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  };

  const primaryRole = can.roles[0] ?? "irmao";

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-serif shadow-sm">
              ⚜
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">Gestão da Loja</div>
              <div className="text-[11px] text-muted-foreground">Sistema Maçônico</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <Link
            to={dashboard.to}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
              isActive(dashboard.to)
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <dashboard.icon className="h-4 w-4" />
            {dashboard.label}
          </Link>

          <div className="pt-2 space-y-1">
            {visibleGroups.map((g) => {
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
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors",
                      hasActive
                        ? "text-sidebar-foreground"
                        : "text-muted-foreground hover:text-sidebar-foreground",
                      "hover:bg-sidebar-accent/40",
                    )}
                  >
                    <g.icon className="h-3.5 w-3.5" />
                    <span className="flex-1 text-left">{g.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        isOpen && "rotate-180",
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                    <div className="mt-0.5 ml-4 pl-3 border-l border-sidebar-border space-y-0.5 pb-1">
                      {g.items.map((i) => {
                        const active = isActive(i.to);
                        return (
                          <Link
                            key={i.to}
                            to={i.to}
                            className={cn(
                              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                              active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
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
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="text-xs mb-2">
            <div className="font-medium truncate">{user?.email}</div>
            <div className="text-muted-foreground">{ROLE_LABEL[primaryRole]}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="h-3 w-3 mr-1" /> Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-6">{children}</div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
