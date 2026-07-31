import { createFileRoute, Link } from "@tanstack/react-router";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { brl } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { listarLancamentosIrmao } from "@/lib/backend/irmaos";
import { UserRound, Wallet, CalendarCheck2, CalendarDays, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/")({
  component: PainelInicio,
});

const TILES = [
  { to: "/painel/dados", label: "Meus Dados", icon: UserRound, cor: "from-blue-400 to-indigo-600" },
  { to: "/painel/financeiro", label: "Financeiro", icon: Wallet, cor: "from-emerald-400 to-teal-600" },
  { to: "/painel/frequencia", label: "Frequência", icon: CalendarCheck2, cor: "from-amber-400 to-orange-600" },
  { to: "/painel/sessoes", label: "Sessões", icon: CalendarDays, cor: "from-violet-400 to-purple-600" },
] as const;

function PainelInicio() {
  const meuIrmao = useMeuIrmao();
  const irmaoId = meuIrmao.data?.id ?? null;

  const lancamentos = useQuery({
    queryKey: ["painel", "lancamentos", irmaoId],
    queryFn: () => listarLancamentosIrmao({ data: { irmaoId: irmaoId! } }),
    enabled: !!irmaoId,
  });

  if (meuIrmao.isLoading) return null;

  if (!meuIrmao.data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={UserRound}
            title="Cadastro ainda não vinculado"
            description="Seu login ainda não está associado a um cadastro de irmão. Fale com a secretaria da loja para vincular seu usuário."
          />
        </CardContent>
      </Card>
    );
  }

  const irmao = meuIrmao.data;
  const emAberto = (lancamentos.data ?? []).filter((l) => !l.pago);
  const totalEmAberto = emAberto.reduce((a, l) => a + Number(l.valor), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-muted/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Bem-vindo(a)</p>
            <p className="truncate font-semibold">{irmao.nome_civil}</p>
          </div>
          <Link
            to="/painel/dados"
            className="flex shrink-0 items-center gap-2 rounded-full bg-background px-3 py-2 text-xs font-medium shadow-sm"
          >
            <UserRound className="h-4 w-4" />
            Meus Dados
          </Link>
        </div>
      </div>

      {emAberto.length > 0 && (
        <Link
          to="/painel/financeiro"
          className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>
            Você tem {emAberto.length} mensalidade(s) em aberto — <strong>{brl(totalEmAberto)}</strong>
          </span>
        </Link>
      )}

      <div className="grid grid-cols-4 gap-3">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="flex flex-col items-center gap-1.5 text-center">
            <div
              className={`flex aspect-square w-full items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ${t.cor}`}
            >
              <t.icon className="h-7 w-7 text-white" />
            </div>
            <span className="text-[11px] leading-tight text-foreground">{t.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
