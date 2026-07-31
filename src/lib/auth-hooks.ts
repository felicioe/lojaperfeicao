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
  return {
    roles,
    isAdmin,
    isTesoureiro,
    isSecretario,
    canManageIrmaos: isAdmin || has("secretario"),
    canManageFinancas: isAdmin || has("tesoureiro"),
    // só tem o papel "irmao", sem nenhum papel privilegiado — vai para o
    // painel reduzido (/painel) em vez do dashboard administrativo.
    isMemberOnly: has("irmao") && !isAdmin && !isTesoureiro && !isSecretario,
  };
}
