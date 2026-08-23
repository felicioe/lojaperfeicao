import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterResumoPlataforma, listarAuditoriaPlataforma } from "@/lib/backend/saas-lojas";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function PlataformaInicio() {
  const { data: resumo, isLoading } = useQuery({
    queryKey: ["saas-resumo"],
    queryFn: () => obterResumoPlataforma(),
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
