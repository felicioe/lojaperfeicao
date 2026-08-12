import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { logout } from "@/lib/backend/auth";
import { contarComunicadosNaoLidos } from "@/lib/backend/comunicacoes";
import { useSession, SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
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
  FileSignature,
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
};

const ABAS = [
  { to: "/painel", label: "Início", icon: Home },
  { to: "/painel/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/painel/frequencia", label: "Frequência", icon: CalendarCheck2 },
  { to: "/painel/sessoes", label: "Sessões", icon: CalendarDays },
  { to: "/painel/comunicacoes", label: "Comunicações", icon: Megaphone },
] as const;

function iniciais(nome: string | null | undefined) {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

export function PainelShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
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

  const sair = async () => {
    await logout();
    queryClient.setQueryData(SESSAO_QUERY_KEY, null);
    nav({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background shadow-sm">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background px-4">
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

        <main className="flex-1 overflow-x-hidden px-4 pb-24 pt-4">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t bg-primary text-primary-foreground">
          <div className="flex">
            {ABAS.map((aba) => {
              const ativo = loc.pathname === aba.to;
              const isComunicacoes = aba.to === "/painel/comunicacoes";
              return (
                <Link
                  key={aba.to}
                  to={aba.to}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition-all",
                    ativo
                      ? "opacity-100 bg-white/10"
                      : "opacity-60 hover:opacity-85 hover:bg-white/5",
                  )}
                >
                  <div className="relative">
                    <aba.icon className="h-5 w-5" />
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
          <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="border-b p-4">
              <div className="truncate text-sm font-semibold">
                {user?.nomeCompleto ?? user?.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <div className="flex-1 space-y-1 p-3">
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/painel/eventos" onClick={() => setMenuOpen(false)}>
                  <PartyPopper className="mr-1.5 h-4 w-4" /> Eventos
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/painel/dados" onClick={() => setMenuOpen(false)}>
                  <ShieldCheck className="mr-1.5 h-4 w-4" /> Meus dados e privacidade
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/biblioteca" onClick={() => setMenuOpen(false)}>
                  <Library className="mr-1.5 h-4 w-4" /> Biblioteca de Peças
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/calendario" onClick={() => setMenuOpen(false)}>
                  <Calendar className="mr-1.5 h-4 w-4" /> Calendário
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/enquetes" onClick={() => setMenuOpen(false)}>
                  <Vote className="mr-1.5 h-4 w-4" /> Enquetes
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/documentos" onClick={() => setMenuOpen(false)}>
                  <FileSignature className="mr-1.5 h-4 w-4" /> Documentos
                </Link>
              </Button>
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
            </div>
            <div className="border-t p-3">
              <Button variant="outline" className="w-full" onClick={sair}>
                <LogOut className="mr-1.5 h-4 w-4" /> Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
