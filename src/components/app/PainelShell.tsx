import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { logout } from "@/lib/backend/auth";
import { contarComunicadosNaoLidos } from "@/lib/backend/comunicacoes";
import { useSession, useCan, SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Home,
  Wallet,
  CalendarCheck2,
  CalendarDays,
  Menu,
  LogOut,
  ShieldCheck,
  Moon,
  Sun,
  PartyPopper,
  Megaphone,
  Fingerprint,
  Library,
  Calendar,
  Vote,
  Scale,
  Globe,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/lib/use-theme";

const TITULOS: Record<string, string> = {
  "/painel": "Início",
  "/painel/dados": "Meus Dados",
  "/painel/financeiro": "Financeiro",
  "/painel/frequencia": "Frequência",
  "/painel/sessoes": "Sessões",
  "/painel/eventos": "Eventos",
  "/painel/comunicacoes": "Comunicações",
  "/biblioteca": "Biblioteca de Peças",
  "/calendario": "Calendário",
  "/enquetes": "Enquetes",
  "/documentos": "Legislação",
  "/conta/seguranca": "Segurança da conta",
};

// Itens configuráveis do Meu Painel (issue #464) — "Início" fica de fora de
// propósito: é sempre a 1a aba fixa, não faz sentido o admin tirar o pouso
// da navegação. Segurança da conta / Política de Privacidade / Modo escuro
// também ficam de fora: são utilidades de conta, não conteúdo, continuam
// fixas no fim do menu-gaveta (ver JSX abaixo).
type ItemMobileIrmao = { to: string; label: string; icon: LucideIcon };
const CANDIDATOS_MOBILE_IRMAO: ItemMobileIrmao[] = [
  { to: "/painel/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/painel/frequencia", label: "Frequência", icon: CalendarCheck2 },
  { to: "/painel/sessoes", label: "Sessões", icon: CalendarDays },
  { to: "/painel/comunicacoes", label: "Comunicações", icon: Megaphone },
  { to: "/painel/eventos", label: "Eventos", icon: PartyPopper },
  { to: "/painel/dados", label: "Meus Dados", icon: ShieldCheck },
  { to: "/biblioteca", label: "Biblioteca de Peças", icon: Library },
  { to: "/calendario", label: "Calendário", icon: Calendar },
  { to: "/enquetes", label: "Enquetes", icon: Vote },
  { to: "/documentos", label: "Legislação", icon: Scale },
  { to: "/painel/chamados", label: "Chamados de Suporte", icon: LifeBuoy },
];
const MAX_ABAS_EXTRAS = 4; // + "Início" fixo = 5 abas no total.

// Resolve quais itens ficam ativos e em que ordem, camada por camada — mesma
// composição de AppShell.tsx: oculto-por-loja (#456) + oculto-pessoal (#457)
// primeiro, depois a trava por papel (#464), que também decide a ordem
// quando configurada (admin define a prioridade; sem configuração, mantém a
// ordem padrão de CANDIDATOS_MOBILE_IRMAO).
function resolverItensMobileIrmao(user: {
  menuItensOcultos: string[];
  menuItensOcultosPessoal: string[];
  menuMobilePapel: string[] | null;
}): ItemMobileIrmao[] {
  const ocultos = new Set([...user.menuItensOcultos, ...user.menuItensOcultosPessoal]);
  let itens = CANDIDATOS_MOBILE_IRMAO.filter((i) => !ocultos.has(i.to));
  if (user.menuMobilePapel !== null) {
    const permitidos = new Set(user.menuMobilePapel);
    const ordem = new Map(user.menuMobilePapel.map((to, indice) => [to, indice]));
    itens = itens
      .filter((i) => permitidos.has(i.to))
      .sort((a, b) => ordem.get(a.to)! - ordem.get(b.to)!);
  }
  return itens;
}

function iniciais(nome: string | null | undefined) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

export function PainelShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const can = useCan();
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const { dark, toggle: toggleDark } = useTheme();
  const { data: naoLidos = 0 } = useQuery({
    queryKey: ["painel", "comunicadosNaoLidos"],
    queryFn: () => contarComunicadosNaoLidos(),
  });

  const titulo =
    TITULOS[loc.pathname] ??
    (loc.pathname.startsWith("/painel/faturas/") ? "Fatura" : "Meu Painel");

  const itensResolvidos = resolverItensMobileIrmao({
    menuItensOcultos: user?.menuItensOcultos ?? [],
    menuItensOcultosPessoal: user?.menuItensOcultosPessoal ?? [],
    menuMobilePapel: user?.menuMobilePapel ?? null,
  });
  const abas = [
    { to: "/painel", label: "Início", icon: Home },
    ...itensResolvidos.slice(0, MAX_ABAS_EXTRAS),
  ];
  const itensGaveta = itensResolvidos.slice(MAX_ABAS_EXTRAS);

  const sair = async () => {
    await logout();
    queryClient.setQueryData(SESSAO_QUERY_KEY, null);
    nav({ to: "/auth" });
  };

  return (
    <div className="min-h-screen min-h-dvh bg-muted/30">
      <div className="mx-auto flex min-h-screen min-h-dvh w-full max-w-md flex-col bg-background shadow-sm">
        <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-background px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
          >
            <Menu className="h-6 w-6" />
            {naoLidos > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
          <h1 className="text-lg font-bold text-primary">{titulo}</h1>
          <Link to="/painel/dados">
            <Avatar className="h-9 w-9 border">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {iniciais(user?.nomeCompleto)}
              </AvatarFallback>
            </Avatar>
          </Link>
        </header>

        <main className="flex-1 overflow-x-hidden px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
          {children}
        </main>

        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t bg-primary pb-[env(safe-area-inset-bottom)] text-primary-foreground"
        >
          <div className="flex">
            {abas.map((aba) => {
              const ativo = loc.pathname === aba.to;
              const isComunicacoes = aba.to === "/painel/comunicacoes";
              return (
                <Link
                  key={aba.to}
                  to={aba.to}
                  className={cn(
                    "flex min-h-[4.5rem] flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-all",
                    ativo
                      ? "opacity-100 bg-white/10"
                      : "opacity-60 hover:opacity-85 hover:bg-white/5",
                  )}
                >
                  <div className="relative">
                    <aba.icon className="h-6 w-6" />
                    {isComunicacoes && naoLidos > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[10px] font-bold leading-none text-white">
                        {naoLidos > 9 ? "9+" : naoLidos}
                      </span>
                    )}
                  </div>
                  {aba.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="left"
            className="flex h-dvh w-[86vw] max-w-80 flex-col gap-0 overflow-hidden p-0"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="border-b p-4">
              <div className="truncate text-sm font-semibold">
                {user?.nomeCompleto ?? user?.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <nav aria-label="Menu do usuário" className="flex-1 space-y-1 overflow-y-auto p-3">
              <Button variant="outline" className="min-h-11 w-full justify-start" asChild>
                <Link to="/painel" onClick={() => setMenuOpen(false)}>
                  <Home className="mr-1.5 h-4 w-4" /> Início
                </Link>
              </Button>
              {can.isSuperAdmin && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/admin-saas" onClick={() => setMenuOpen(false)}>
                    <Globe className="mr-1.5 h-4 w-4" /> Plataforma
                  </Link>
                </Button>
              )}
              {itensGaveta.map((item) => (
                <Button key={item.to} variant="outline" className="w-full justify-start" asChild>
                  <Link to={item.to} onClick={() => setMenuOpen(false)}>
                    <item.icon className="mr-1.5 h-4 w-4" /> {item.label}
                  </Link>
                </Button>
              ))}
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/conta/seguranca" onClick={() => setMenuOpen(false)}>
                  <Fingerprint className="mr-1.5 h-4 w-4" /> Segurança da conta
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <a href="/privacidade" target="_blank" rel="noreferrer">
                  Política de Privacidade
                </a>
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={toggleDark}>
                {dark ? <Sun className="mr-1.5 h-4 w-4" /> : <Moon className="mr-1.5 h-4 w-4" />}
                {dark ? "Modo claro" : "Modo escuro"}
              </Button>
            </nav>
            <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" className="min-h-11 w-full" onClick={sair}>
                <LogOut className="mr-1.5 h-4 w-4" /> Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
