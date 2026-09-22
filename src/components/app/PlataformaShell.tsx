import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useShellSessao } from "@/lib/use-shell-sessao";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/use-theme";
import {
  Globe,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  ArrowLeftRight,
  UsersRound,
  ShieldCheck,
  Settings,
  LifeBuoy,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MenuSearch, type MenuSearchGroup } from "@/components/app/MenuSearch";

// Shell próprio da área de Plataforma (issue #358) — deliberadamente com
// paleta diferente do shell de Loja (AppShell: navy + dourado). Quem
// administra o SaaS precisa reconhecer de cara, sem ler texto nenhum, que
// não está mais dentro de uma Loja específica.
const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/admin-saas", label: "Início", icon: LayoutDashboard },
  { to: "/admin-saas/lojas", label: "Lojas", icon: Building2 },
  { to: "/admin-saas/usuarios", label: "Usuários", icon: UsersRound },
  { to: "/admin-saas/super-admins", label: "Super-admins", icon: ShieldCheck },
  { to: "/admin-saas/configuracoes", label: "Configurações", icon: Settings },
  { to: "/admin-saas/chamados", label: "Chamados", icon: LifeBuoy },
];

function PlataformaBrand() {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
        <Globe className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-semibold leading-tight tracking-wide">Plataforma</div>
        <div className="truncate text-[10px] text-slate-400">Administração SaaS</div>
      </div>
    </div>
  );
}

export function PlataformaShell({ children }: { children: ReactNode }) {
  const { user, can, loc, signOut } = useShellSessao();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { dark, toggle: toggleDark } = useTheme();

  // Base pesquisável da busca de menu (issue #697) — mesmos NAV_ITEMS que já
  // aparecem na sidebar/gaveta deste shell (a guarda de acesso à área de
  // Plataforma já acontece em admin-saas/route.tsx; aqui não há filtro extra
  // por item, então a lista pesquisável é a lista completa mostrada).
  const menuSearchGroups: MenuSearchGroup[] = [
    { id: "plataforma", label: "Plataforma", items: NAV_ITEMS },
  ];

  // Mesmo atalho de teclado do AppShell (Ctrl/Cmd+K) — o gatilho por toque
  // (ícone de lupa acima) é o que a issue #697 exige de verdade em mobile,
  // este atalho é só paridade pra quem usa teclado físico nesta área.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const isActive = (to: string) =>
    loc.pathname === to || (to !== "/admin-saas" && loc.pathname.startsWith(to + "/"));

  // Quem administra a plataforma pode também ter papel na própria Loja —
  // este link volta pra lá, na tela certa conforme o papel (dashboard
  // administrativo ou painel de irmão comum).
  const minhaLojaTo =
    can.isAdmin || can.isTesoureiro || can.isSecretario ? "/dashboard" : "/painel";

  const navList = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-indigo-500/15 font-medium text-indigo-200"
                : "text-slate-300 hover:bg-white/5 hover:text-slate-100",
            )}
          >
            <item.icon className={cn("h-4 w-4 shrink-0", active && "text-indigo-300")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (onNavigate?: () => void) => (
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 text-xs">
        <div className="truncate font-medium text-slate-100">
          {user?.nomeCompleto ?? user?.email}
        </div>
        {user?.nomeCompleto && <div className="truncate text-slate-400">{user?.email}</div>}
      </div>
      <Button variant="outline" size="sm" className="w-full bg-transparent text-slate-100" asChild>
        <Link to={minhaLojaTo} onClick={onNavigate}>
          <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" /> Minha Loja
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-full bg-transparent text-slate-100"
        onClick={toggleDark}
      >
        {dark ? <Sun className="mr-1.5 h-3.5 w-3.5" /> : <Moon className="mr-1.5 h-3.5 w-3.5" />}
        {dark ? "Modo claro" : "Modo escuro"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-full bg-transparent text-slate-100"
        onClick={signOut}
      >
        <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sair
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-muted/30">
      {/* ===== Sidebar fixa — apenas desktop (lg+) ===== */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col self-start overflow-hidden border-r border-white/10 bg-slate-950 text-slate-100 print:hidden lg:flex">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 p-4">
          <PlataformaBrand />
          <button
            type="button"
            aria-label="Buscar no menu (Ctrl+K)"
            onClick={() => setSearchOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        {navList()}
        {footer()}
      </aside>

      {/* ===== Layout mobile/tablet (< lg) ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-slate-950 px-3 text-slate-100 print:hidden lg:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <PlataformaBrand />
          </div>
          <button
            type="button"
            aria-label="Buscar no menu"
            onClick={() => setSearchOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10"
          >
            <Search className="h-5 w-5" />
          </button>
        </header>

        <MenuSearch open={searchOpen} onOpenChange={setSearchOpen} groups={menuSearchGroups} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="flex w-[86vw] max-w-[320px] flex-col gap-0 border-white/10 bg-slate-950 p-0 text-slate-100 lg:hidden"
          >
            <SheetTitle className="sr-only">Menu de navegação da Plataforma</SheetTitle>
            <div className="border-b border-white/10 p-4 pr-12">
              <PlataformaBrand />
            </div>
            {navList(() => setMobileOpen(false))}
            {footer(() => setMobileOpen(false))}
          </SheetContent>
        </Sheet>

        <main className="min-w-0 flex-1">
          <div className="mx-auto min-w-0 max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
