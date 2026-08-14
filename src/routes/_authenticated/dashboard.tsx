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
  type ContaAPagarProxima,
} from "@/lib/backend/dashboard";
import { listarSaldoContas } from "@/lib/backend/tesouraria-contas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/AppShell";
import { brl, fmtDate } from "@/lib/format";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  FileText,
  Library,
  RefreshCw,
  Vote,
} from "lucide-react";
import { listarDocumentos } from "@/lib/backend/documentos";
import { listarEnquetes } from "@/lib/backend/enquetes";
import { listarEventos } from "@/lib/backend/eventos";
import { listarPecasArquitetura } from "@/lib/backend/pecas-arquitetura";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

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
  const proximosAniversariantes = (aniversariantes.data ?? [])
    .slice(0, 2)
    .map((aniversariante) => aniversariante.nome_civil.split(" ")[0])
    .join(", ");

  const ordenacao = useOrdenacao(contasPagar.data ?? [], {
    vencimento: (conta) => conta.data_vencimento,
    descricao: (conta) => conta.descricao,
    valor: (conta) => Number(conta.valor),
    status: (conta) => (new Date(conta.data_vencimento) < new Date(`${hoje}T00:00:00`) ? 1 : 0),
  });

  const projecaoPendente = saldos.isPending || projecao.isPending;
  const projecaoComErro = saldos.isError || projecao.isError;

  return (
    <>
      <PageHeader title="Dashboard" description="Visão geral da loja e dos próximos 30 dias." />

      <section aria-labelledby="receber-title" className="mb-6 sm:mb-8">
        <SectionHeader
          id="receber-title"
          title="Contas a receber"
          description="Recebimentos do mês e valores vencidos que precisam de acompanhamento."
        />
        <MetricGroup
          columns="sm:grid-cols-2"
          updatedAt={contasReceber.dataUpdatedAt}
          refreshing={contasReceber.isFetching}
        >
          <MetricItem
            label="Recebido neste mês"
            value={brl(contasReceber.data?.recebidoMes ?? 0)}
            hint="Ver todos os recebimentos"
            query={contasReceber}
            tone="success"
            to="/relatorios/recebimentos"
          />
          <MetricItem
            label="Inadimplência"
            value={brl(contasReceber.data?.inadimplencia ?? 0)}
            hint={pluralizar(
              contasReceber.data?.quantidadeInadimplentes ?? 0,
              "irmão com pendência",
              "irmãos com pendência",
            )}
            query={contasReceber}
            tone={(contasReceber.data?.inadimplencia ?? 0) > 0 ? "danger" : "success"}
            to="/relatorios/inadimplencia"
          />
        </MetricGroup>
      </section>

      <section aria-labelledby="atencao-title" className="mb-6 sm:mb-8">
        <Card>
          <CardHeader className="gap-4 space-y-0 border-b sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  <CalendarClock className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle id="atencao-title">Requer atenção</CardTitle>
              </div>
              {contasPagar.isPending ? (
                <div className="mt-4 space-y-2" aria-label="Carregando resumo de pendências">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-4 w-52" />
                </div>
              ) : contasPagar.isError ? (
                <div className="mt-4" role="alert">
                  <p className="text-sm font-medium text-destructive">Resumo indisponível</p>
                  <Button
                    variant="link"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={() => void contasPagar.refetch()}
                  >
                    <RefreshCw aria-hidden="true" /> Tentar novamente
                  </Button>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-xl font-semibold tabular-nums sm:text-2xl">
                    {brl(totalPagar)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pluralizar(contasPagar.data.length, "lançamento vence", "lançamentos vencem")}{" "}
                    nos próximos 30 dias
                  </p>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-muted-foreground">
                    {contasPagar.isFetching
                      ? "Atualizando…"
                      : `Atualizado às ${horaAtualizacao(contasPagar.dataUpdatedAt)}`}
                  </p>
                </div>
              )}
            </div>
            <Button variant="outline" asChild className="min-h-11 w-full sm:min-h-9 sm:w-auto">
              <Link to="/tesouraria/contas-pagar">Gerenciar contas a pagar</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4 sm:pt-6">
            <ContasPagarTable contasPagar={contasPagar} ordenacao={ordenacao} hoje={hoje} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="financeiro-title" className="mb-6 sm:mb-8">
        <SectionHeader
          id="financeiro-title"
          title="Posição financeira"
          description="Disponibilidade atual e impacto previsto para os próximos 30 dias."
        />
        <MetricGroup
          columns="sm:grid-cols-2"
          updatedAt={atualizacaoMaisAntiga(saldos.dataUpdatedAt, projecao.dataUpdatedAt)}
          refreshing={saldos.isFetching || projecao.isFetching}
        >
          <MetricItem
            label="Saldo de caixa (hoje)"
            value={brl(saldoAtual)}
            hint={pluralizar(saldos.data?.length ?? 0, "conta", "contas")}
            query={saldos}
          />
          <MetricItem
            label="Saldo projetado (30 dias)"
            value={brl(saldoProjetado)}
            hint={`${(projecao.data?.delta ?? 0) >= 0 ? "+" : ""}${brl(projecao.data?.delta ?? 0)} previstos`}
            tone={saldoProjetado >= 0 ? "success" : "danger"}
            pending={projecaoPendente}
            error={projecaoComErro}
            onRetry={() => {
              void saldos.refetch();
              void projecao.refetch();
            }}
          />
        </MetricGroup>
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

      <section aria-labelledby="novidades-title" className="mt-6 sm:mt-8">
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
          />
          <Novidade
            icon={FileText}
            label="Legislação"
            titulo={documentos.data?.[0]?.titulo}
            to="/documentos"
            pending={documentos.isPending}
          />
          <Novidade
            icon={CalendarDays}
            label="Evento"
            titulo={eventos.data?.[0]?.titulo}
            to="/eventos"
            pending={eventos.isPending}
          />
          <Novidade
            icon={Library}
            label="Biblioteca"
            titulo={pecas.data?.[0]?.titulo}
            to="/biblioteca"
            pending={pecas.isPending}
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
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3 sm:mb-4">
      <h2 id={id} className="text-lg font-semibold leading-snug tracking-[-0.01em]">
        {title}
      </h2>
      <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function ContasPagarTable({
  contasPagar,
  ordenacao,
  hoje,
}: {
  contasPagar: ReturnType<typeof useQuery<ContaAPagarProxima[]>>;
  ordenacao: ReturnType<typeof useOrdenacao<ContaAPagarProxima>>;
  hoje: string;
}) {
  return (
    <>
      <div className="sr-only" aria-live="polite">
        {contasPagar.isPending
          ? "Carregando contas a pagar."
          : contasPagar.isError
            ? "Não foi possível carregar as contas a pagar."
            : `${contasPagar.data.length} contas a pagar carregadas.`}
      </div>
      <div className="sm:hidden">
        <ContasPagarMobile contasPagar={contasPagar} hoje={hoje} />
      </div>
      <div className="hidden max-w-full overflow-x-auto overscroll-x-contain sm:block">
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="vencimento" ord={ordenacao}>
                Vencimento
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="descricao" ord={ordenacao}>
                Descrição
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="valor" ord={ordenacao} className="text-right">
                Valor
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="status" ord={ordenacao}>
                Status
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contasPagar.isPending && <TableLoadingRows />}
            {contasPagar.isError && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Não foi possível carregar as contas</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Verifique sua conexão e tente novamente. Os demais dados continuam
                        disponíveis.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void contasPagar.refetch()}>
                      <RefreshCw aria-hidden="true" /> Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {contasPagar.isSuccess && contasPagar.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  Nenhuma conta a pagar nos próximos 30 dias.
                </TableCell>
              </TableRow>
            )}
            {contasPagar.isSuccess &&
              ordenacao.itensOrdenados.map((conta: ContaAPagarProxima) => {
                const vencida =
                  new Date(`${conta.data_vencimento}T00:00:00`) < new Date(`${hoje}T00:00:00`);
                return (
                  <TableRow key={conta.id}>
                    <TableCell>{fmtDate(conta.data_vencimento)}</TableCell>
                    <TableCell className="max-w-md break-words">
                      {conta.descricao}
                      {conta.recorrente_id && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Origem: despesa recorrente
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {brl(conta.valor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={vencida ? "destructive" : "secondary"}>
                        {vencida ? "Vencida" : "A vencer"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function ContasPagarMobile({
  contasPagar,
  hoje,
}: {
  contasPagar: ReturnType<typeof useQuery<ContaAPagarProxima[]>>;
  hoje: string;
}) {
  if (contasPagar.isPending) {
    return (
      <div className="space-y-4" aria-label="Carregando contas a pagar">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    );
  }

  if (contasPagar.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="alert">
        <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Não foi possível carregar as contas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifique sua conexão e tente novamente.
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={() => void contasPagar.refetch()}>
          <RefreshCw aria-hidden="true" /> Tentar novamente
        </Button>
      </div>
    );
  }

  if (contasPagar.data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhuma conta a pagar nos próximos 30 dias.
      </p>
    );
  }

  return (
    <ul className="divide-y" aria-label="Contas a pagar nos próximos 30 dias">
      {contasPagar.data.map((conta) => {
        const vencida =
          new Date(`${conta.data_vencimento}T00:00:00`) < new Date(`${hoje}T00:00:00`);
        return (
          <li key={conta.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-medium leading-snug">{conta.descricao}</p>
                {conta.recorrente_id && (
                  <p className="mt-1 text-sm text-muted-foreground">Origem: despesa recorrente</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  Vence em {fmtDate(conta.data_vencimento)}
                </p>
              </div>
              <Badge variant={vencida ? "destructive" : "secondary"} className="shrink-0">
                {vencida ? "Vencida" : "A vencer"}
              </Badge>
            </div>
            <p className="mt-3 text-lg font-semibold tabular-nums">{brl(conta.valor)}</p>
          </li>
        );
      })}
    </ul>
  );
}

function TableLoadingRows() {
  return Array.from({ length: 3 }, (_, index) => (
    <TableRow key={index} aria-hidden="true">
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-full max-w-xs" />
      </TableCell>
      <TableCell>
        <Skeleton className="ml-auto h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
    </TableRow>
  ));
}

type EstadoConsulta = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => Promise<unknown>;
};

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
          className="border-t px-4 py-2.5 text-xs font-medium leading-relaxed text-muted-foreground sm:px-6"
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
    success: "text-emerald-700 dark:text-emerald-300",
    danger: "text-destructive",
  }[tone];

  const conteudo = (
    <div className={`min-w-0 p-4 sm:p-6 ${to ? "transition-colors hover:bg-muted/50" : ""}`}>
      <p className="text-sm font-medium leading-normal text-muted-foreground">{label}</p>
      {pending ? (
        <div className="mt-2 space-y-2" aria-label={`Carregando ${label}`}>
          <Skeleton className="h-7 w-28" />
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
            className={`mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl ${valueClass}`}
          >
            {value}
          </p>
          {hint && (
            <p className="mt-1 break-words text-xs font-medium leading-relaxed text-muted-foreground">
              {hint}
            </p>
          )}
          {to && <ArrowRight className="mt-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
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

function Novidade({
  icon: Icon,
  label,
  titulo,
  to,
  pending,
}: {
  icon: typeof Vote;
  label: string;
  titulo?: string;
  to: string;
  pending: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-20 items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {pending ? (
          <Skeleton className="mt-2 h-4 w-2/3" />
        ) : (
          <p className="mt-1 truncate font-medium">{titulo ?? "Nenhuma novidade cadastrada"}</p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
