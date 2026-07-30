import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useCan } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { ROLE_LABEL } from "@/lib/format";

type NavItem = { to: string; label: string; icon: any; show: boolean };

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const can = useCan();
  const nav = useNavigate();
  const loc = useLocation();

  const items: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/irmaos", label: "Irmãos", icon: Users, show: true },
    { to: "/orgs", label: "Corpos Maçônicos", icon: Building2, show: true },
    { to: "/gestoes", label: "Gestões", icon: Award, show: true },
    { to: "/terceiros", label: "Fornecedores/Clientes", icon: Truck, show: can.canManageFinancas },
    { to: "/sessoes", label: "Sessões", icon: CalendarDays, show: true },
    { to: "/tesouraria", label: "Tesouraria", icon: Wallet, show: can.canManageFinancas || can.isSecretario },
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
    { to: "/tesouraria/plano-contas", label: "Plano de Contas", icon: FileBarChart, show: can.canManageFinancas },
    { to: "/contabilidade/auditoria", label: "Auditoria Contábil", icon: ShieldCheck, show: can.canManageFinancas },
    { to: "/relatorios/frequencia", label: "Frequência", icon: FileBarChart, show: true },
    { to: "/relatorios/inadimplentes", label: "Inadimplentes", icon: FileBarChart, show: can.canManageFinancas },
  ];

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  };

  const primaryRole = can.roles[0] ?? "irmao";

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-serif">⚜</div>
            <div>
              <div className="font-semibold text-sm leading-tight">Gestão da Loja</div>
              <div className="text-[11px] text-muted-foreground">Sistema Maçônico</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {items.filter((i) => i.show).map((i) => {
            const active = loc.pathname === i.to || (i.to !== "/dashboard" && loc.pathname.startsWith(i.to));
            return (
              <Link
                key={i.to}
                to={i.to}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "hover:bg-sidebar-accent/60",
                )}
              >
                <i.icon className="h-4 w-4" />
                {i.label}
              </Link>
            );
          })}
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
