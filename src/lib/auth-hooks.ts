import { useQuery } from "@tanstack/react-query";
import { getSessao } from "@/lib/server/auth";
import type { Papel } from "@/lib/server/auth";

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
  return {
    roles,
    isAdmin: has("admin"),
    isTesoureiro: has("admin") || has("tesoureiro"),
    isSecretario: has("admin") || has("secretario"),
    canManageIrmaos: has("admin") || has("secretario"),
    canManageFinancas: has("admin") || has("tesoureiro"),
  };
}
