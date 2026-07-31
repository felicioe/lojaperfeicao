import { useQuery } from "@tanstack/react-query";
import { obterMeuIrmao } from "@/lib/backend/irmaos";

export function useMeuIrmao() {
  return useQuery({ queryKey: ["painel", "meuIrmao"], queryFn: () => obterMeuIrmao() });
}
