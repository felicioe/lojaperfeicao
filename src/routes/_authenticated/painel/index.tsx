import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { useIsDesktop } from "@/lib/use-media-query";
import { listarLancamentosIrmao, listarFrequenciaIrmao } from "@/lib/backend/irmaos";
import { contarComunicadosNaoLidos } from "@/lib/backend/comunicacoes";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, SITUACAO_LABEL, GRAU_LABEL } from "@/lib/format";
import {
  UserRound,
  Wallet,
  CalendarCheck2,
  CalendarDays,
  AlertCircle,
  Megaphone,
  PartyPopper,
  Library,
  Calendar,
  Vote,
  Scale,
  Fingerprint,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/")({
  component: PainelInicio,
});

const TILES = [
  { to: "/painel/dados", label: "Meus Dados", icon: UserRound },
  { to: "/painel/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/painel/frequencia", label: "Frequência", icon: CalendarCheck2 },
  { to: "/painel/sessoes", label: "Sessões", icon: CalendarDays },
  { to: "/painel/comunicacoes", label: "Comunicações", icon: Megaphone },
  { to: "/painel/eventos", label: "Eventos", icon: PartyPopper },
  { to: "/biblioteca", label: "Biblioteca de Peças", icon: Library },
  { to: "/calendario", label: "Calendário", icon: Calendar },
  { to: "/enquetes", label: "Enquetes", icon: Vote },
  { to: "/documentos", label: "Legislação", icon: Scale },
  { to: "/conta/seguranca", label: "Segurança", icon: Fingerprint },
] as const;

function PainelInicio() {
  const isDesktop = useIsDesktop();
  const meuIrmao = useMeuIrmao();
  const irmaoId = meuIrmao.data?.id ?? null;

  const lancamentos = useQuery({
    queryKey: ["painel", "lancamentos", irmaoId],
    queryFn: () => listarLancamentosIrmao({ data: { irmaoId: irmaoId! } }),
    enabled: !!irmaoId,
  });

  const frequencia = useQuery({
    queryKey: ["painel", "frequencia", irmaoId],
    queryFn: () => listarFrequenciaIrmao({ data: { irmaoId: irmaoId! } }),
    enabled: !!irmaoId && isDesktop,
  });

  const naoLidos = useQuery({
    queryKey: ["painel", "comunicadosNaoLidos"],
    queryFn: () => contarComunicadosNaoLidos(),
    enabled: !!irmaoId,
  });

  if (meuIrmao.isLoading) {
    if (isDesktop) {
      return (
        <>
          <PageHeader title="Meu Painel" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-9 w-9 rounded-md" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      );
    }
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid grid-cols-5 gap-3">
          {TILES.map((t) => (
            <div key={t.to} className="flex flex-col items-center gap-1.5">
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!meuIrmao.data) {
    const vazio = (
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
    return isDesktop ? (
      <>
        <PageHeader title="Meu Painel" />
        {vazio}
      </>
    ) : (
      vazio
    );
  }

  const irmao = meuIrmao.data;
  const emAberto = (lancamentos.data ?? []).filter((l) => !l.pago);
  const totalEmAberto = emAberto.reduce((a, l) => a + Number(l.valor), 0);

  if (isDesktop) {
    const presencas = (frequencia.data ?? []).filter((f) => f.presente).length;
    const totalSessoesFreq = frequencia.data?.length ?? 0;
    const percentualFrequencia =
      totalSessoesFreq > 0 ? Math.round((presencas / totalSessoesFreq) * 100) : 0;

    return (
      <>
        <PageHeader title="Meu Painel" description={`Bem-vindo(a), ${irmao.nome_civil}.`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon={UserRound}
            label="Situação"
            value={SITUACAO_LABEL[irmao.situacao] ?? irmao.situacao}
            hint={GRAU_LABEL[irmao.grau] ?? irmao.grau}
            tone={irmao.situacao === "ativo" || irmao.situacao === "quite" ? "success" : "danger"}
            to="/painel/dados"
          />
          <MetricCard
            icon={Wallet}
            label="Mensalidades em aberto"
            value={brl(totalEmAberto)}
            hint={`${emAberto.length} lançamento(s)`}
            tone={emAberto.length > 0 ? "warning" : "success"}
            to="/painel/financeiro"
          />
          <MetricCard
            icon={CalendarCheck2}
            label="Minha frequência"
            value={`${percentualFrequencia}%`}
            hint={`${presencas} de ${totalSessoesFreq} sessão(ões)`}
            tone={percentualFrequencia >= 75 ? "success" : "warning"}
            to="/painel/frequencia"
          />
          {(naoLidos.data ?? 0) > 0 && (
            <MetricCard
              icon={Megaphone}
              label="Comunicações"
              value={`${naoLidos.data} não lido(s)`}
              tone="warning"
              to="/painel/comunicacoes"
            />
          )}
        </div>
      </>
    );
  }

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
            Você tem {emAberto.length} mensalidade(s) em aberto —{" "}
            <strong>{brl(totalEmAberto)}</strong>
          </span>
        </Link>
      )}

      {(naoLidos.data ?? 0) > 0 && (
        <Link
          to="/painel/comunicacoes"
          className="flex items-center gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <Megaphone className="h-5 w-5 shrink-0" />
          <span>
            Você tem <strong>{naoLidos.data}</strong> comunicado(s) novo(s)
          </span>
        </Link>
      )}

      <div className="grid grid-cols-5 gap-3">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex aspect-square w-full items-center justify-center rounded-2xl border bg-muted/60">
              <t.icon className="h-6 w-6 text-foreground" />
            </div>
            <span className="text-[11px] leading-tight text-foreground">{t.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  to,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "success" | "warning" | "danger";
  to?: string;
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30",
    warning: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30",
    danger: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30",
  }[tone];
  const card = (
    <Card className={to ? "transition-colors hover:bg-muted/50" : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
            {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={`shrink-0 rounded-md p-2 ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? (
    <Link
      to={to}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {card}
    </Link>
  ) : (
    card
  );
}
