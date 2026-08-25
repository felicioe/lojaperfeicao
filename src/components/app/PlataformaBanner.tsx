import { useQuery } from "@tanstack/react-query";
import { obterBannerPlataforma } from "@/lib/backend/saas-configuracoes";
import { cn } from "@/lib/utils";
import { Info, AlertTriangle, Siren } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Banner de manutenção/aviso da plataforma (issue #362) — montado uma vez
// em _authenticated/route.tsx, acima do AppShell, pra aparecer não importa
// qual shell acaba renderizando (AppShell, PainelShell ou PlataformaShell
// são substituições completas umas das outras, não aninhadas).

const ESTILO: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
  aviso:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  critico:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
};

const ICONE: Record<string, LucideIcon> = { info: Info, aviso: AlertTriangle, critico: Siren };

export function PlataformaBanner() {
  const { data } = useQuery({
    queryKey: ["plataforma-banner"],
    queryFn: () => obterBannerPlataforma(),
    refetchInterval: 60_000,
  });

  if (!data?.ativo || !data.mensagem) return null;
  const Icone = ICONE[data.tipo] ?? Info;

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b px-4 py-2 text-sm print:hidden",
        ESTILO[data.tipo] ?? ESTILO.info,
      )}
      role="status"
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="whitespace-pre-wrap">{data.mensagem}</span>
    </div>
  );
}
