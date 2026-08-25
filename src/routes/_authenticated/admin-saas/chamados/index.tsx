import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarChamadosPlataforma } from "@/lib/backend/saas-chamados";
import type { Prioridade, StatusChamado } from "@/lib/backend/chamados";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LifeBuoy, TriangleAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-saas/chamados/")({
  head: () => ({ meta: [{ title: "Chamados — Plataforma" }] }),
  component: FilaChamados,
});

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const STATUS_LABEL: Record<StatusChamado, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function FilaChamados() {
  const [status, setStatus] = useState<StatusChamado | "todos">("todos");
  const [prioridade, setPrioridade] = useState<Prioridade | "todas">("todas");

  const {
    data: chamados = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["saas-chamados", status, prioridade],
    queryFn: () =>
      listarChamadosPlataforma({
        data: {
          status: status === "todos" ? undefined : status,
          prioridade: prioridade === "todas" ? undefined : prioridade,
        },
      }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chamados"
        description="Fila de suporte de todas as Lojas atendidas pela plataforma."
      />

      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as StatusChamado | "todos")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {(Object.keys(STATUS_LABEL) as StatusChamado[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade | "todas")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as prioridades</SelectItem>
            {(Object.keys(PRIORIDADE_LABEL) as Prioridade[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORIDADE_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <EmptyState
              icon={LifeBuoy}
              title="Não foi possível carregar os chamados"
              description="Falha ao buscar os dados. Tente novamente."
              action={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Tentar novamente
                </Button>
              }
            />
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : chamados.length === 0 ? (
            <EmptyState icon={LifeBuoy} title="Nenhum chamado" description="Fila vazia por aqui." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {chamados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.loja_nome}</TableCell>
                    <TableCell className="font-medium">{c.assunto}</TableCell>
                    <TableCell>{PRIORIDADE_LABEL[c.prioridade]}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === "aberto"
                            ? "default"
                            : c.status === "em_andamento"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className={c.vencido ? "flex items-center gap-1 text-destructive" : ""}>
                        {c.vencido && <TriangleAlert className="h-3.5 w-3.5" />}
                        {dataHora(c.prazo_sla)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/admin-saas/chamados/$id" params={{ id: c.id }}>
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
