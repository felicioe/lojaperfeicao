import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { logout } from "@/lib/backend/auth";
import { contarComunicadosNaoLidos } from "@/lib/backend/comunicacoes";
import { useSession, useCan, SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import {
  resolverItensMobileIrmao,
  ITEM_SEGURANCA_IRMAO,
  MAX_ITENS_FIXOS_IRMAO,
} from "@/lib/menu-mobile-irmao";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Home, Menu, LogOut, Moon, Sun, Globe, HelpCircle } from "lucide-react";
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
  "/painel/ajuda": "Ajuda",
};

// Achado da auditoria de UX (issue #467, P0): quando a ordem configurada
// muda e um item conhecido sai da barra de abas, quem tinha o hábito motor
// de tocar naquela posição acha que o app quebrou. Aviso único (localStorage,
// não repete depois que a pessoa já viu) — não é uma solução genérica pra
// toda mudança futura de config, é o mínimo pra esta mudança específica não
// pegar ninguém de surpresa.
const CHAVE_AVISO_FREQUENCIA = "sglfm-aviso-frequencia-fora-da-aba-v1";

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
    { to: "/painel", label: "Início", icon: Home, tint: "", onPrimary: "" },
    ...itensResolvidos.slice(0, MAX_ITENS_FIXOS_IRMAO),
  ];
  const itensGaveta = itensResolvidos.slice(MAX_ITENS_FIXOS_IRMAO);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (localStorage.getItem(CHAVE_AVISO_FREQUENCIA)) return;
    localStorage.setItem(CHAVE_AVISO_FREQUENCIA, "1");
    const frequenciaNaGaveta = itensGaveta.some((i) => i.to === "/painel/frequencia");
    const frequenciaAusente = !itensResolvidos.some((i) => i.to === "/painel/frequencia");
    if (frequenciaNaGaveta) {
      toast.info(
        "Frequência não está mais entre as abas de baixo — toque no ☰ no topo pra encontrá-la.",
        { duration: 9000 },
      );
    } else if (frequenciaAusente) {
      toast.info(
        "Frequência não está mais disponível no seu perfil. Fale com a secretaria da loja se precisar dela.",
        {
          duration: 9000,
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Menu className="h-6 w-6" />
            {naoLidos > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
          <h1 className="text-lg font-bold text-primary">{titulo}</h1>
          <Link
            to="/painel/dados"
            className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Meus dados"
          >
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
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "flex min-h-[4.5rem] flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-[opacity,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-foreground",
                    ativo
                      ? "opacity-100 bg-white/10"
                      : "opacity-60 hover:opacity-85 hover:bg-white/5",
                  )}
                >
                  <div className="relative">
                    <aba.icon className={cn("h-6 w-6", aba.onPrimary)} />
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
            <nav aria-label="Menu do usuário" className="flex-1 space-y-4 overflow-y-auto p-3">
              <div className="space-y-1">
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start text-base"
                  asChild
                >
                  <Link to="/painel" onClick={() => setMenuOpen(false)}>
                    <Home className="mr-1.5 h-5 w-5" /> Início
                  </Link>
                </Button>
                {can.isSuperAdmin && (
                  <Button
                    variant="outline"
                    className="min-h-11 w-full justify-start text-base"
                    asChild
                  >
                    <Link to="/admin-saas" onClick={() => setMenuOpen(false)}>
                      <Globe className="mr-1.5 h-5 w-5" /> Plataforma
                    </Link>
                  </Button>
                )}
              </div>

              {itensGaveta.length > 0 && (
                <div className="space-y-1">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mais opções
                  </p>
                  {itensGaveta.map((item) => (
                    <Button
                      key={item.to}
                      variant="outline"
                      className="min-h-11 w-full justify-start text-base"
                      asChild
                    >
                      <Link to={item.to} onClick={() => setMenuOpen(false)}>
                        <span
                          className={cn(
                            "mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                            item.tint,
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                        </span>
                        {item.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              )}

              <div className="space-y-1">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conta
                </p>
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start text-base"
                  asChild
                >
                  <Link to="/conta/seguranca" onClick={() => setMenuOpen(false)}>
                    <span
                      className={cn(
                        "mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        ITEM_SEGURANCA_IRMAO.tint,
                      )}
                    >
                      <ITEM_SEGURANCA_IRMAO.icon className="h-4 w-4" />
                    </span>
                    Segurança da conta
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start text-base"
                  asChild
                >
                  <Link to="/painel/ajuda" onClick={() => setMenuOpen(false)}>
                    <span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      <HelpCircle className="h-4 w-4" />
                    </span>
                    Ajuda
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start text-base"
                  asChild
                >
                  <a href="/privacidade" target="_blank" rel="noreferrer">
                    Política de Privacidade
                  </a>
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start text-base"
                  onClick={toggleDark}
                >
                  {dark ? <Sun className="mr-1.5 h-5 w-5" /> : <Moon className="mr-1.5 h-5 w-5" />}
                  {dark ? "Modo claro" : "Modo escuro"}
                </Button>
              </div>
            </nav>
            <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" className="min-h-11 w-full text-base" onClick={sair}>
                <LogOut className="mr-1.5 h-5 w-5" /> Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
