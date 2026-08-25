import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  obterResumoPlataforma,
  obterMetricasPlataforma,
  listarAuditoriaPlataforma,
  type LojaAtividade,
} from "@/lib/backend/saas-lojas";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Building2, Users, PowerOff, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-saas/")({
  head: () => ({ meta: [{ title: "Plataforma — Gestão Maçônica" }] }),
  component: PlataformaInicio,
});

const ACAO_LABEL: Record<string, string> = {
  criar_loja: "Loja cadastrada",
  editar_loja: "Loja editada",
  suspender_loja: "Loja suspensa",
  reativar_loja: "Loja reativada",
  convidar_admin_loja: "Convite enviado",
  reenviar_convite_loja: "Convite reenviado",
  revogar_convite_loja: "Convite cancelado",
  aceitar_convite_loja: "Convite aceito",
  promover_super_admin: "Super-admin concedido",
  revogar_super_admin: "Super-admin revogado",
  atualizar_configuracoes_plataforma: "Configurações atualizadas",
  responder_chamado: "Chamado respondido",
  atualizar_status_chamado: "Status de chamado atualizado",
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

// "2026-03" -> "mar/26"
const mesLabel = (chave: string) => {
  const [ano, mes] = chave.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  return data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
};

const desdeUltimoAcesso = (iso: string | null) => {
  if (!iso) return "nunca acessou";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
};

const configLojas = {
  total: { label: "Novas Lojas", color: "var(--chart-1)" },
} satisfies ChartConfig;
const configUsuarios = {
  total: { label: "Novos usuários", color: "var(--chart-2)" },
} satisfies ChartConfig;

function ListaAtividade({ lojas }: { lojas: LojaAtividade[] }) {
  if (lojas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma Loja ativa ainda.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {lojas.map((l) => (
        <li key={l.id} className="flex items-center justify-between gap-2">
          <span className="truncate text-foreground">{l.nome}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {desdeUltimoAcesso(l.ultimo_acesso)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlataformaInicio() {
  const { data: resumo, isLoading } = useQuery({
    queryKey: ["saas-resumo"],
    queryFn: () => obterResumoPlataforma(),
  });
  const { data: metricas } = useQuery({
    queryKey: ["saas-metricas"],
    queryFn: () => obterMetricasPlataforma(),
  });
  const { data: eventos = [] } = useQuery({
    queryKey: ["saas-auditoria"],
    queryFn: () => listarAuditoriaPlataforma(),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plataforma"
        description="Números gerais das Lojas atendidas por esta instalação."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Lojas ativas</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-8 w-12" />
              ) : (
                <p className="text-2xl font-semibold">{resumo?.lojas_ativas ?? 0}</p>
              )}
              <p className="text-xs text-muted-foreground">{resumo?.total_lojas ?? 0} no total</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Lojas suspensas</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-8 w-12" />
              ) : (
                <p className="text-2xl font-semibold">{resumo?.lojas_suspensas ?? 0}</p>
              )}
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <PowerOff className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Usuários ativos</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-8 w-12" />
              ) : (
                <p className="text-2xl font-semibold">{resumo?.usuarios_ativos ?? 0}</p>
              )}
              <p className="text-xs text-muted-foreground">em todas as Lojas</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crescimento de Lojas</CardTitle>
            <CardDescription>Novas Lojas cadastradas por mês, últimos 6 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            {!metricas ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ChartContainer config={configLojas} className="h-40 w-full">
                <BarChart data={metricas.crescimentoLojas} margin={{ left: -20 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tickFormatter={mesLabel}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={(v) => mesLabel(String(v))} />}
                  />
                  <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crescimento de Usuários</CardTitle>
            <CardDescription>Novos usuários criados por mês, últimos 6 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            {!metricas ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ChartContainer config={configUsuarios} className="h-40 w-full">
                <BarChart data={metricas.crescimentoUsuarios} margin={{ left: -20 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tickFormatter={mesLabel}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={(v) => mesLabel(String(v))} />}
                  />
                  <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lojas mais ativas</CardTitle>
            <CardDescription>Por login mais recente de algum usuário.</CardDescription>
          </CardHeader>
          <CardContent>
            {!metricas ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <ListaAtividade lojas={metricas.lojasMaisAtivas} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lojas menos ativas</CardTitle>
            <CardDescription>Sem login recente — candidatas a um contato.</CardDescription>
          </CardHeader>
          <CardContent>
            {!metricas ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <ListaAtividade lojas={metricas.lojasMenosAtivas} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Lojas</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin-saas/lojas">
                Gerenciar <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Cadastro, suspensão e convite do primeiro administrador de cada Loja atendida pela
              plataforma.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Usuários</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin-saas/usuarios">
                Ver todos <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Contas de todas as Lojas, com busca por e-mail, nome ou Loja — só metadado de conta.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Super-admins</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin-saas/super-admins">
                Gerenciar <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Quem administra a plataforma inteira. Promover ou revogar exige confirmar senha e 2FA.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Configurações</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin-saas/configuracoes">
                Gerenciar <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Parâmetros que valem para todas as Lojas — hoje, o banner de manutenção/aviso.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Chamados</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin-saas/chamados">
                Ver fila <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Suporte de todas as Lojas — thread, anexos, status e prazo por prioridade.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividade recente</CardTitle>
        </CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {eventos.slice(0, 8).map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                  <span className="tabular-nums">{dataHora(e.criado_em)}</span>
                  <span className="text-foreground">{ACAO_LABEL[e.acao] ?? e.acao}</span>
                  {e.loja_nome && <span className="text-foreground">— {e.loja_nome}</span>}
                  {e.alvo_email && <span className="text-foreground">— {e.alvo_email}</span>}
                  {e.usuario_email && <span>por {e.usuario_email}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
