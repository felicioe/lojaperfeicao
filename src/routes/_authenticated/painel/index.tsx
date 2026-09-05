import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-hooks";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { useIsDesktop } from "@/lib/use-media-query";
import {
  resolverItensMobileIrmao,
  ITEM_SEGURANCA_IRMAO,
  type ItemMobileIrmao,
} from "@/lib/menu-mobile-irmao";
import { listarLancamentosIrmao, listarFrequenciaIrmao } from "@/lib/backend/irmaos";
import { contarComunicadosNaoLidos } from "@/lib/backend/comunicacoes";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, SITUACAO_LABEL, GRAU_LABEL } from "@/lib/format";
import { UserRound, Wallet, CalendarCheck2, AlertCircle, Megaphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/")({
  component: PainelInicio,
});

// Grade da home (issue #467, auditoria de UX): reaproveita a MESMA lista,
// ordem e cor por categoria da barra de abas/menu-gaveta (menu-mobile-irmao.ts)
// em vez de uma lista própria — antes desta issue a home ignorava totalmente
// a configuração do admin (#464) e as preferências pessoais/da loja, então um
// item que o admin travava pra um papel continuava aparecendo aqui do mesmo
// jeito. "Frequentes" é a mesma fatia que vira aba fixa; "Mais" é o resto do
// conteúdo configurável; "Conta" é só a utilidade de segurança (sempre 1
// item, igual à gaveta) — 3 grupos rotulados, não uma grade só de 11-12
// tiles soltos, mantendo o mesmo chunking que motivou a divisão original.
const MAX_TILES_FREQUENTES = 4;

function PainelInicio() {
  const isDesktop = useIsDesktop();
  const { user } = useSession();
  const meuIrmao = useMeuIrmao();
  const irmaoId = meuIrmao.data?.id ?? null;

  const itensResolvidos = resolverItensMobileIrmao({
    menuItensOcultos: user?.menuItensOcultos ?? [],
    menuItensOcultosPessoal: user?.menuItensOcultosPessoal ?? [],
    menuMobilePapel: user?.menuMobilePapel ?? null,
  });
  const tilesFrequentes = itensResolvidos.slice(0, MAX_TILES_FREQUENTES);
  const tilesMais = itensResolvidos.slice(MAX_TILES_FREQUENTES);

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
        <div className="grid grid-cols-4 gap-3">
          {itensResolvidos.map((t) => (
            <div key={t.to} className="flex flex-col items-center gap-1.5">
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (meuIrmao.isError) {
    const erro = (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={AlertCircle}
            title="Erro ao carregar seus dados"
            description="Não foi possível carregar as informações do seu cadastro. Verifique sua conexão e tente novamente."
            action={
              <button
                onClick={() => meuIrmao.refetch()}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Tentar novamente
              </button>
            }
          />
        </CardContent>
      </Card>
    );
    return isDesktop ? (
      <>
        <PageHeader title="Meu Painel" />
        {erro}
      </>
    ) : (
      erro
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
          className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning-muted p-3 text-sm text-warning-foreground"
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

      {tilesFrequentes.length > 0 && <GradeTiles titulo="Frequentes" itens={tilesFrequentes} />}
      {tilesMais.length > 0 && <GradeTiles titulo="Mais" itens={tilesMais} />}
      <GradeTiles titulo="Conta" itens={[ITEM_SEGURANCA_IRMAO]} />
    </div>
  );
}

// Dois grupos rotulados ("Frequentes" / "Mais") em vez de uma grade única
// de 11-12 itens (achado da auditoria de UX #467: viola o próprio princípio
// de produto de simplicidade > densidade, e o mesmo chunking já existe em
// AppShell.tsx pra grupos densos do menu desktop — replicado aqui).
function GradeTiles({ titulo, itens }: { titulo: string; itens: ItemMobileIrmao[] }) {
  // Achado da 3ª rodada da auditoria de UX (issue #467): grid-cols-4 fixo com
  // menos de 4 itens (ex.: "Conta", sempre 1 item) deixava colunas vazias sob
  // o rótulo do grupo — parecia carregamento quebrado, não espaço proposital.
  // Com poucos itens, usa flex (largura de tile igual à de uma coluna do
  // grid, sem reservar as colunas que não têm conteúdo).
  const emGrade = itens.length > 3;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className={emGrade ? "grid grid-cols-4 gap-3" : "flex gap-3"}>
        {itens.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={`flex flex-col items-center gap-1.5 text-center ${emGrade ? "" : "w-1/4"}`}
          >
            <div
              className={`flex aspect-square w-full items-center justify-center rounded-2xl ${t.tint}`}
            >
              <t.icon className="h-8 w-8" />
            </div>
            <span className="text-xs leading-tight text-foreground">{t.label}</span>
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
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "success" | "warning" | "danger";
  to?: string;
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-success-foreground bg-success-muted",
    warning: "text-warning-foreground bg-warning-muted",
    danger: "text-destructive bg-destructive-muted",
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
