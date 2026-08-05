import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarAuditoria, type EntradaAuditoria } from "@/lib/backend/auditoria";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCan } from "@/lib/auth-hooks";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { usePaginacao } from "@/lib/use-paginacao";

export const Route = createFileRoute("/_authenticated/administracao/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Gestão Maçônica" }] }),
  component: AuditoriaPage,
});

const fmtDataHora = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(
    new Date(d.replace(" ", "T")),
  );

function AuditoriaPage() {
  const can = useCan();
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: entradas = [] } = useQuery({
    queryKey: ["auditoria"],
    queryFn: () => listarAuditoria({ data: { limite: 500 } }),
    enabled: can.isAdmin,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(entradas);

  if (!can.isAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas administradores podem acessar esta função.
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro imutável das ações mais sensíveis do sistema — últimas 500 entradas."
      />
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    Nenhuma entrada de auditoria ainda.
                  </TableCell>
                </TableRow>
              )}
              {itensPagina.map((e: EntradaAuditoria) => {
                const temDetalhe = e.dados_antes !== null || e.dados_depois !== null;
                const aberto = expandido === e.id;
                return (
                  <Fragment key={e.id}>
                    <TableRow
                      className={temDetalhe ? "cursor-pointer" : undefined}
                      onClick={() => temDetalhe && setExpandido(aberto ? null : e.id)}
                    >
                      <TableCell>
                        {temDetalhe &&
                          (aberto ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {fmtDataHora(e.criado_em)}
                      </TableCell>
                      <TableCell>{e.usuario_email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.acao}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.entidade_tipo}
                        {e.entidade_id ? ` · ${e.entidade_id.slice(0, 8)}` : ""}
                      </TableCell>
                    </TableRow>
                    {aberto && temDetalhe && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <div className="grid gap-3 py-2 md:grid-cols-2">
                            {e.dados_antes !== null && (
                              <div>
                                <div className="mb-1 text-xs font-medium text-muted-foreground">
                                  Antes
                                </div>
                                <pre className="overflow-x-auto rounded-md bg-background p-2 text-xs">
                                  {JSON.stringify(e.dados_antes, null, 2)}
                                </pre>
                              </div>
                            )}
                            {e.dados_depois !== null && (
                              <div>
                                <div className="mb-1 text-xs font-medium text-muted-foreground">
                                  Depois
                                </div>
                                <pre className="overflow-x-auto rounded-md bg-background p-2 text-xs">
                                  {JSON.stringify(e.dados_depois, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          <TabelaPaginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalItens={totalItens}
            tamanhoPagina={tamanhoPagina}
            setPagina={setPagina}
          />
        </CardContent>
      </Card>
    </>
  );
}
