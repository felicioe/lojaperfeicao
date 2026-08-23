import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  listarContasAPagarProximas,
  obterProjecaoFluxo,
  contarMembrosAtivos,
  contarSessoesMes,
  listarAniversariantesMes,
  obterResumoContasReceber,
  obterMediaDespesasMensais,
  listarPendenciasPrioritarias,
  type ContaAPagarProxima,
  type PendenciaPrioritaria,
  type ResumoContasReceber,
} from "@/lib/backend/dashboard";
import { listarSaldoContas } from "@/lib/backend/tesouraria-contas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/AppShell";
import { brl, fmtDate } from "@/lib/format";
import { ArrowRight, CalendarDays, FileText, Library, RefreshCw, Vote } from "lucide-react";
import { listarDocumentos } from "@/lib/backend/documentos";
import { listarEnquetes } from "@/lib/backend/enquetes";
import { listarEventos } from "@/lib/backend/eventos";
import { listarPecasArquitetura } from "@/lib/backend/pecas-arquitetura";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: ({ context }) => {
    const papeis = context.usuario?.papeis ?? [];
    const privilegiado = papeis.some(
      (papel) => papel === "admin" || papel === "tesoureiro" || papel === "secretario",
    );
    if (papeis.includes("irmao") && !privilegiado) throw redirect({ to: "/painel" });
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Gestão Maçônica" },
      { name: "description", content: "Visão geral: contas a pagar, saldo de caixa e projeção." },
    ],
  }),
  component: Dashboard,
});

function dataIsoLocal(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function pluralizar(quantidade: number, singular: string, plural: string) {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function horaAtualizacao(timestamp: number) {
  if (!timestamp) return "agora";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(timestamp),
  );
}

function atualizacaoMaisAntiga(...timestamps: number[]) {
  const validos = timestamps.filter(Boolean);
  return validos.length ? Math.min(...validos) : 0;
}

function Dashboard() {
  const em30Dias = new Date();
  em30Dias.setDate(em30Dias.getDate() + 30);
  const hoje = dataIsoLocal(new Date());
  const em30DiasIso = dataIsoLocal(em30Dias);

  const contasPagar = useQuery({
    queryKey: ["dash", "contasPagar", hoje, em30DiasIso],
    queryFn: () => listarContasAPagarProximas({ data: { de: hoje, ate: em30DiasIso } }),
  });
  const saldos = useQuery({ queryKey: ["dash", "saldos"], queryFn: () => listarSaldoContas() });
  const projecao = useQuery({
    queryKey: ["dash", "projecao", hoje, em30DiasIso],
    queryFn: () => obterProjecaoFluxo({ data: { de: hoje, ate: em30DiasIso } }),
  });
  const membrosAtivos = useQuery({
    queryKey: ["dash", "membrosAtivos"],
    queryFn: () => contarMembrosAtivos(),
  });
  const sessoesMes = useQuery({
    queryKey: ["dash", "sessoesMes"],
    queryFn: () => contarSessoesMes(),
  });
  const aniversariantes = useQuery({
    queryKey: ["dash", "aniversariantes"],
    queryFn: () => listarAniversariantesMes(),
  });
  const contasReceber = useQuery({
    queryKey: ["dash", "contasReceber"],
    queryFn: () => obterResumoContasReceber(),
  });
  const mediaDespesas = useQuery({
    queryKey: ["dash", "mediaDespesasMensais"],
    queryFn: () => obterMediaDespesasMensais(),
  });
  const pendenciasPrioritarias = useQuery({
    queryKey: ["dash", "pendenciasPrioritarias"],
    queryFn: () => listarPendenciasPrioritarias(),
  });
  const documentos = useQuery({ queryKey: ["dash", "documentos"], queryFn: listarDocumentos });
  const enquetes = useQuery({ queryKey: ["dash", "enquetes"], queryFn: listarEnquetes });
  const eventos = useQuery({ queryKey: ["dash", "eventos"], queryFn: listarEventos });
  const pecas = useQuery({ queryKey: ["dash", "pecas"], queryFn: listarPecasArquitetura });

  const totalPagar = (contasPagar.data ?? []).reduce(
    (soma, conta) => soma + Number(conta.valor),
    0,
  );
  const saldoAtual = (saldos.data ?? []).reduce(
    (soma, conta) => soma + Number(conta.saldo_atual ?? 0),
    0,
  );
  const saldoProjetado = saldoAtual + (projecao.data?.delta ?? 0);
  const coberturaCaixa =
    (mediaDespesas.data ?? 0) > 0 ? saldoAtual / Number(mediaDespesas.data) : null;
  const em7Dias = new Date();
  em7Dias.setDate(em7Dias.getDate() + 7);
  const em7DiasIso = dataIsoLocal(em7Dias);
  const contasPagarHoje = (contasPagar.data ?? [])
    .filter((conta) => conta.data_vencimento === hoje)
    .reduce((soma, conta) => soma + Number(conta.valor), 0);
  const contasPagar7Dias = (contasPagar.data ?? [])
    .filter((conta) => conta.data_vencimento > hoje && conta.data_vencimento <= em7DiasIso)
    .reduce((soma, conta) => soma + Number(conta.valor), 0);
  const contasPagarRestante = Math.max(0, totalPagar - contasPagarHoje - contasPagar7Dias);
  const proximosAniversariantes = (aniversariantes.data ?? [])
    .slice(0, 2)
    .map((aniversariante) => aniversariante.nome_civil.split(" ")[0])
    .join(", ");

  const projecaoPendente = saldos.isPending || projecao.isPending;
  const projecaoComErro = saldos.isError || projecao.isError;

  return (
    <>
      <PageHeader
        title="Visão financeira"
        description="Posição consolidada e compromissos dos próximos 30 dias."
      />

      <section aria-labelledby="financeiro-title" className="mb-5 sm:mb-6">
        <SectionHeader
          id="financeiro-title"
          title="Disponibilidade"
          description="Saldo atual, projeção financeira e cobertura das despesas habituais."
        />
        <MetricGroup
          columns="md:grid-cols-3"
          updatedAt={atualizacaoMaisAntiga(
            saldos.dataUpdatedAt,
            projecao.dataUpdatedAt,
            mediaDespesas.dataUpdatedAt,
          )}
          refreshing={saldos.isFetching || projecao.isFetching || mediaDespesas.isFetching}
        >
          <MetricItem
            label="Saldo de caixa hoje"
            value={brl(saldoAtual)}
            hint={pluralizar(saldos.data?.length ?? 0, "conta financeira", "contas financeiras")}
            query={saldos}
            to="/relatorios/extrato-bancario"
          />
          <MetricItem
            label="Saldo projetado em 30 dias"
            value={brl(saldoProjetado)}
            hint={`${brl(projecao.data?.somaE ?? 0)} a receber · ${brl(projecao.data?.somaS ?? 0)} a pagar`}
            tone={saldoProjetado >= 0 ? "success" : "danger"}
            pending={projecaoPendente}
            error={projecaoComErro}
            onRetry={() => {
              void saldos.refetch();
              void projecao.refetch();
            }}
          />
          <MetricItem
            label="Cobertura de caixa"
            value={coberturaCaixa === null ? "Sem histórico" : `${coberturaCaixa.toFixed(1)} meses`}
            hint={
              coberturaCaixa === null
                ? "Ainda não há despesas pagas suficientes"
                : `Despesa média mensal: ${brl(mediaDespesas.data ?? 0)}`
            }
            pending={mediaDespesas.isPending || saldos.isPending}
            error={mediaDespesas.isError || saldos.isError}
            onRetry={() => {
              void mediaDespesas.refetch();
              void saldos.refetch();
            }}
            tone={coberturaCaixa !== null && coberturaCaixa < 1 ? "danger" : "neutral"}
          />
        </MetricGroup>
      </section>

      <section aria-labelledby="agenda-title" className="mb-5 sm:mb-6">
        <SectionHeader
          id="agenda-title"
          title="Agenda financeira"
          description="Compromissos de curto prazo e envelhecimento dos valores vencidos."
        />
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <AgendaFinanceiraCard
              query={contasPagar}
              total={totalPagar}
              hoje={contasPagarHoje}
              seteDias={contasPagar7Dias}
              restante={contasPagarRestante}
            />
          </div>
          <div className="lg:col-span-5">
            <AgingCard query={contasReceber} />
          </div>
        </div>
      </section>

      <section aria-labelledby="prioridades-title" className="mb-5 sm:mb-6">
        <SectionHeader
          id="prioridades-title"
          title="Pendências prioritárias"
          description="Cobranças mais antigas que exigem acompanhamento."
          action={{ label: "Ver relatório completo", to: "/relatorios/inadimplencia" }}
        />
        <PendenciasPrioritarias query={pendenciasPrioritarias} />
      </section>

      <section aria-labelledby="loja-title">
        <SectionHeader
          id="loja-title"
          title="Vida da loja"
          description="Indicadores institucionais deste mês."
        />
        <MetricGroup
          columns="sm:grid-cols-3"
          updatedAt={atualizacaoMaisAntiga(
            membrosAtivos.dataUpdatedAt,
            sessoesMes.dataUpdatedAt,
            aniversariantes.dataUpdatedAt,
          )}
          refreshing={
            membrosAtivos.isFetching || sessoesMes.isFetching || aniversariantes.isFetching
          }
        >
          <MetricItem
            label="Membros ativos"
            value={String(membrosAtivos.data ?? 0)}
            query={membrosAtivos}
            to="/irmaos"
          />
          <MetricItem
            label="Sessões do mês"
            value={String(sessoesMes.data ?? 0)}
            query={sessoesMes}
            to="/sessoes"
          />
          <MetricItem
            label="Aniversariantes do mês"
            value={String(aniversariantes.data?.length ?? 0)}
            hint={proximosAniversariantes || undefined}
            query={aniversariantes}
            to="/irmaos"
          />
        </MetricGroup>
      </section>

      <section aria-labelledby="novidades-title" className="mt-5 sm:mt-6">
        <SectionHeader
          id="novidades-title"
          title="Novidades do site"
          description="Conteúdos e atividades adicionados recentemente."
        />
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          <Novidade
            icon={Vote}
            label="Enquete"
            titulo={enquetes.data?.[0]?.titulo}
            to="/enquetes"
            pending={enquetes.isPending}
            erro={enquetes.isError}
          />
          <Novidade
            icon={FileText}
            label="Legislação"
            titulo={documentos.data?.[0]?.titulo}
            to="/documentos"
            pending={documentos.isPending}
            erro={documentos.isError}
          />
          <Novidade
            icon={CalendarDays}
            label="Evento"
            titulo={eventos.data?.[0]?.titulo}
            to="/eventos"
            pending={eventos.isPending}
            erro={eventos.isError}
          />
          <Novidade
            icon={Library}
            label="Biblioteca"
            titulo={pecas.data?.[0]?.titulo}
            to="/biblioteca"
            pending={pecas.isPending}
            erro={pecas.isError}
          />
        </div>
      </section>
    </>
  );
}

function SectionHeader({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description: string;
  action?: { label: string; to: string };
}) {
  return (
    <div className="mb-2.5 gap-3 sm:mb-3 sm:flex sm:items-end sm:justify-between">
      <div>
        <h2 id={id} className="text-base font-semibold leading-snug tracking-[-0.01em] sm:text-lg">
          {title}
        </h2>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action && (
        <Link
          to={action.to}
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline sm:mt-0 sm:min-h-9"
        >
          {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

type EstadoConsulta = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => Promise<unknown>;
};

type ConsultaContasPagar = EstadoConsulta & { data?: ContaAPagarProxima[] };
type ConsultaPendencias = EstadoConsulta & { data?: PendenciaPrioritaria[] };

function AgendaFinanceiraCard({
  query,
  total,
  hoje,
  seteDias,
  restante,
}: {
  query: ConsultaContasPagar;
  total: number;
  hoje: number;
  seteDias: number;
  restante: number;
}) {
  const periodos = [
    { label: "Hoje", value: hoje },
    { label: "Próximos 7 dias", value: seteDias },
    { label: "8 a 30 dias", value: restante },
  ];

  return (
    <Card className="h-full">
      <CardContent className="p-0">
        {query.isPending ? (
          <div className="space-y-4 p-4" aria-label="Carregando agenda financeira">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : query.isError ? (
          <div className="p-4" role="alert">
            <p className="text-sm font-medium text-destructive">Agenda indisponível</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Não foi possível carregar os compromissos financeiros.
            </p>
            <Button
              variant="link"
              className="mt-2 h-auto p-0 text-xs"
              onClick={() => void query.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-end sm:justify-between sm:p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                  Compromissos em 30 dias
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{brl(total)}</p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {pluralizar(query.data?.length ?? 0, "lançamento", "lançamentos")}
              </p>
            </div>
            <div className="grid divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {periodos.map((periodo) => (
                <div
                  key={periodo.label}
                  className="flex items-center justify-between p-3.5 sm:block sm:p-4"
                >
                  <p className="text-xs font-medium text-muted-foreground">{periodo.label}</p>
                  <p className="mt-0 font-semibold tabular-nums sm:mt-1">{brl(periodo.value)}</p>
                </div>
              ))}
            </div>
            <div className="border-t px-3.5 py-2 sm:px-4">
              <Link
                to="/tesouraria/contas-pagar"
                className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline sm:min-h-9"
              >
                Gerenciar contas a pagar <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PendenciasPrioritarias({ query }: { query: ConsultaPendencias }) {
  if (query.isPending) {
    return (
      <Card className="p-4" aria-label="Carregando pendências prioritárias">
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card className="p-4" role="alert">
        <p className="text-sm font-medium text-destructive">Pendências indisponíveis</p>
        <Button
          variant="link"
          className="mt-2 h-auto p-0 text-xs"
          onClick={() => void query.refetch()}
        >
          <RefreshCw aria-hidden="true" /> Tentar novamente
        </Button>
      </Card>
    );
  }

  if (!query.data?.length) {
    return (
      <Card className="p-5 text-center text-sm text-muted-foreground">
        Nenhuma cobrança vencida. A posição está regular.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="sm:hidden">
        <ul className="divide-y" aria-label="Pendências prioritárias">
          {query.data.map((pendencia) => (
            <li key={pendencia.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{pendencia.responsavel}</p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {pendencia.descricao}
                  </p>
                </div>
                <Badge variant="destructive" className="shrink-0">
                  {pendencia.dias_atraso} dias
                </Badge>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Venceu em {fmtDate(pendencia.data_vencimento)}
                </p>
                <p className="font-semibold tabular-nums">{brl(pendencia.valor)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Responsável</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Atraso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.map((pendencia) => (
              <TableRow key={pendencia.id}>
                <TableCell className="font-medium">{pendencia.responsavel}</TableCell>
                <TableCell className="max-w-xs break-words text-muted-foreground">
                  {pendencia.descricao}
                </TableCell>
                <TableCell>{fmtDate(pendencia.data_vencimento)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {brl(pendencia.valor)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="destructive">{pendencia.dias_atraso} dias</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function MetricGroup({
  children,
  columns,
  updatedAt,
  refreshing,
}: {
  children: ReactNode;
  columns: string;
  updatedAt: number;
  refreshing: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className={`grid divide-y sm:divide-x sm:divide-y-0 ${columns}`}>{children}</div>
        <p
          className="border-t px-3.5 py-2 text-xs font-medium leading-relaxed text-muted-foreground sm:px-4"
          aria-live="polite"
        >
          {refreshing ? "Atualizando…" : `Atualizado às ${horaAtualizacao(updatedAt)}`}
        </p>
      </CardContent>
    </Card>
  );
}

function MetricItem({
  label,
  value,
  hint,
  tone = "neutral",
  query,
  pending = query?.isPending ?? false,
  error = query?.isError ?? false,
  onRetry = () => void query?.refetch(),
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "danger";
  query?: EstadoConsulta;
  pending?: boolean;
  error?: boolean;
  onRetry?: () => void;
  to?: string;
}) {
  const valueClass = {
    neutral: "text-foreground",
    success: "text-success-foreground",
    danger: "text-destructive",
  }[tone];

  const conteudo = (
    <div className={`min-w-0 p-3.5 sm:p-4 ${to ? "transition-colors hover:bg-muted/50" : ""}`}>
      <p className="text-xs font-medium leading-normal text-muted-foreground sm:text-sm">{label}</p>
      {pending ? (
        <div className="mt-2 space-y-2" aria-label={`Carregando ${label}`}>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      ) : error ? (
        <div className="mt-2" role="alert">
          <p className="text-sm font-medium text-destructive">Dados indisponíveis</p>
          <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={onRetry}>
            <RefreshCw aria-hidden="true" /> Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <p
            className={`mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl ${valueClass}`}
          >
            {value}
          </p>
          {hint && (
            <p className="mt-1 break-words text-xs font-medium leading-relaxed text-muted-foreground">
              {hint}
            </p>
          )}
          {to && <ArrowRight className="mt-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        </>
      )}
    </div>
  );
  return to && !error ? (
    <Link
      to={to}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

type ConsultaFaixas = EstadoConsulta & { data?: ResumoContasReceber };

function AgingCard({ query }: { query: ConsultaFaixas }) {
  const faixas = [
    { label: "Até 30 dias", value: query.data?.vencidoAte30 ?? 0 },
    { label: "31 a 60 dias", value: query.data?.vencido31a60 ?? 0 },
    { label: "Acima de 60 dias", value: query.data?.vencidoAcima60 ?? 0 },
  ];

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col p-0">
        {query.isPending ? (
          <div className="grid gap-4 p-4" aria-label="Carregando faixas de vencimento">
            {faixas.map((faixa) => (
              <Skeleton key={faixa.label} className="h-9 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4" role="alert">
            <p className="text-sm font-medium text-destructive">Faixas indisponíveis</p>
            <Button
              variant="link"
              className="mt-1 h-auto p-0 text-xs"
              onClick={() => void query.refetch()}
            >
              <RefreshCw aria-hidden="true" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3 p-3.5 sm:p-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                  Total vencido
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-destructive sm:text-2xl">
                  {brl(query.data?.inadimplencia ?? 0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Recebido no mês</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-success-foreground">
                  {brl(query.data?.recebidoMes ?? 0)}
                </p>
              </div>
            </div>
            <div className="flex-1 border-t px-3.5 py-1 sm:px-4">
              {faixas.map((faixa) => (
                <div
                  key={faixa.label}
                  className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0"
                >
                  <p className="text-sm text-muted-foreground">{faixa.label}</p>
                  <p className="font-semibold tabular-nums">{brl(faixa.value)}</p>
                </div>
              ))}
            </div>
            <div className="border-t px-3.5 py-2 sm:px-4">
              <Link
                to="/relatorios/inadimplencia"
                className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline sm:min-h-9"
              >
                Ver valores vencidos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Novidade({
  icon: Icon,
  label,
  titulo,
  to,
  pending,
  erro,
}: {
  icon: typeof Vote;
  label: string;
  titulo?: string;
  to: string;
  pending: boolean;
  erro?: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-16 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {pending ? (
          <Skeleton className="mt-2 h-4 w-2/3" />
        ) : erro ? (
          <p className="mt-1 truncate font-medium text-destructive">Dados indisponíveis</p>
        ) : (
          <p className="mt-1 truncate font-medium">{titulo ?? "Nenhuma novidade cadastrada"}</p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
