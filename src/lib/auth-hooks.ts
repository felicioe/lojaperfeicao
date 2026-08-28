import { useQuery } from "@tanstack/react-query";
import { getSessao } from "@/lib/backend/auth";
import type { Papel } from "@/lib/backend/auth";

export type Role = Papel;

export const SESSAO_QUERY_KEY = ["sessao"] as const;

function useSessaoQuery() {
  return useQuery({
    queryKey: SESSAO_QUERY_KEY,
    queryFn: () => getSessao(),
    staleTime: 60_000,
  });
}

export function useSession() {
  const { data, isLoading } = useSessaoQuery();
  return { user: data ?? null, loading: isLoading };
}

export function useRoles() {
  const { data } = useSessaoQuery();
  return { data: (data?.papeis ?? []) as Role[] };
}

export function useCan() {
  const { data: roles = [] } = useRoles();
  const has = (r: Role) => roles.includes(r);
  const isAdmin = has("admin");
  const isTesoureiro = isAdmin || has("tesoureiro");
  const isSecretario = isAdmin || has("secretario");
  // Administrador da plataforma (issue #339). Fica de fora da cascata dos
  // demais de propósito: administrar o SaaS não dá acesso a dado de loja
  // nenhuma, então isSuperAdmin não implica isAdmin — nem o contrário.
  const isSuperAdmin = has("super_admin");
  // Papéis do CMS do site institucional (issue #391) — também de fora da
  // cascata dos demais, mesmo raciocínio de isSuperAdmin: mexer no site não
  // dá nem tira nenhum outro poder de Loja.
  const isEditorCms = has("editor_cms");
  const isAprovadorCms = has("aprovador_cms");
  return {
    roles,
    isAdmin,
    isTesoureiro,
    isSecretario,
    isSuperAdmin,
    isEditorCms,
    isAprovadorCms,
    canAcessarCms: isSuperAdmin || isEditorCms || isAprovadorCms,
    canManageIrmaos: isAdmin || has("secretario"),
    canManageFinancas: isAdmin || has("tesoureiro"),
    // só tem o papel "irmao", sem nenhum papel privilegiado — vai para o
    // painel reduzido (/painel) em vez do dashboard administrativo. Um
    // colunista comum não tem admin/tesoureiro/secretario, então sem excluir
    // editor_cms/aprovador_cms aqui ele cairia no painel reduzido e nunca
    // veria o grupo "Site Institucional" (groupsMemberOnly não tem esse
    // grupo — ver AppShell.tsx).
    isMemberOnly:
      has("irmao") && !isAdmin && !isTesoureiro && !isSecretario && !isEditorCms && !isAprovadorCms,
  };
}
