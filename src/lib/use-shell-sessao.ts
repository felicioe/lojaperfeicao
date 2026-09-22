import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/backend/auth";
import { useSession, useCan, SESSAO_QUERY_KEY } from "@/lib/auth-hooks";

// Mecânica de sessão repetida nos três shells de navegação (AppShell,
// PainelShell, PlataformaShell): leitura de sessão/permissão, rota atual e o
// logout que limpa o cache de sessão (SESSAO_QUERY_KEY) antes de voltar pra
// /auth. Extraído na issue #701 — os três reimplementavam isso de forma
// idêntica, com risco de ficar inconsistente entre eles (ver incidente da
// issue #566 sobre safe-area, citado no CLAUDE.md). Cada shell continua
// responsável só pela composição/conteúdo específico do seu papel.
export function useShellSessao() {
  const { user } = useSession();
  const can = useCan();
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await logout();
    queryClient.setQueryData(SESSAO_QUERY_KEY, null);
    nav({ to: "/auth" });
  };

  return { user, can, nav, loc, queryClient, signOut };
}
