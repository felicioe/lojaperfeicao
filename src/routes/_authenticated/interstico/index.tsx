import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarElegibilidadeInterstico } from "@/lib/backend/interstico";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/interstico/")({
  head: () => ({
    meta: [
      { title: "Interstício — Gestão Maçônica" },
      { name: "description", content: "Irmãos elegíveis ou próximos de completar o interstício." },
    ],
  }),
  component: IntersticioPage,
});

function IntersticioPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["elegibilidade_interstico"],
    queryFn: () => listarElegibilidadeInterstico(),
  });

  return (
    <>
      <PageHeader
        title="Interstício"
        description="Irmãos elegíveis (ou próximos) para elevação, conforme o interstício mínimo configurado por grau em Corpos Maçônicos."
      />
      <Card>
        {!isLoading && data.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Ninguém elegível ou próximo no momento"
            description="Configure o interstício mínimo por grau na tela de Corpos Maçônicos para este painel funcionar."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Irmão</TableHead>
                <TableHead>Corpo</TableHead>
                <TableHead>Grau atual</TableHead>
                <TableHead>Elevado em</TableHead>
                <TableHead>Elegível a partir de</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {data.map((e) => (
                <TableRow key={`${e.irmao_id}-${e.grau_atual}`}>
                  <TableCell className="font-medium">{e.nome_civil}</TableCell>
                  <TableCell>{e.org_nome}</TableCell>
                  <TableCell>
                    {e.grau_atual} — {e.nome_grau}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(e.data_elevacao)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(e.data_elegivel)}
                  </TableCell>
                  <TableCell>
                    {e.dias_restantes <= 0 ? (
                      <Badge>Já elegível</Badge>
                    ) : (
                      <Badge variant="secondary">Em {e.dias_restantes} dia(s)</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to="/irmaos/$id" params={{ id: e.irmao_id }}>
                      <Button variant="ghost" size="sm">
                        Abrir
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
