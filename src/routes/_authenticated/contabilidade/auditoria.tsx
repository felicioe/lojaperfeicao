import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarAuditoriaDesbalanceados, listarSaldoPlanoContas } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";

export const Route = createFileRoute("/_authenticated/contabilidade/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria Contábil — Gestão Maçônica" }] }),
  component: AuditoriaContabil,
});

function AuditoriaContabil() {
  const { data: desbalanceados = [], isLoading: loadingDesbalanceados } = useQuery({
    queryKey: ["v_auditoria_contabil_desbalanceados"],
    queryFn: () => listarAuditoriaDesbalanceados(),
  });

  const { data: saldos = [] } = useQuery({
    queryKey: ["v_saldo_plano_contas"],
    queryFn: () => listarSaldoPlanoContas(),
  });

  const ordDesbalanceados = useOrdenacao(desbalanceados, {
    data: (d) => d.data,
    descricao: (d) => d.descricao,
    origem: (d) => d.origem_tipo,
    debito: (d) => Number(d.total_debito),
    credito: (d) => Number(d.total_credito),
    diferenca: (d) => Number(d.diferenca),
  });

  const ordSaldos = useOrdenacao(saldos, {
    codigo: (c) => c.codigo,
    conta: (c) => c.nome,
    tipo: (c) => c.tipo,
    debito: (c) => Number(c.total_debito),
    credito: (c) => Number(c.total_credito),
    saldo: (c) => Number(c.saldo_devedor),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ordSaldos.itensOrdenados,
  );

  const totalDebito = saldos.reduce((s, c) => s + Number(c.total_debito), 0);
  const totalCredito = saldos.reduce((s, c) => s + Number(c.total_credito), 0);
  const consistente = !loadingDesbalanceados && desbalanceados.length === 0;

  return (
    <>
      <PageHeader
        title="Auditoria Contábil"
        description="Verifica se todos os lançamentos em partida dobrada estão balanceados (débito = crédito)."
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total debitado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalDebito)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total creditado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalCredito)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Consistência</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold">
            {consistente ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> OK
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-destructive" /> {desbalanceados.length}{" "}
                lançamento(s)
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {!consistente && (
        <Card className="mb-6 border-destructive">
          <CardHeader>
            <CardTitle className="text-base">Lançamentos desbalanceados</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="data" ord={ordDesbalanceados}>
                    Data
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="descricao" ord={ordDesbalanceados}>
                    Descrição
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="origem" ord={ordDesbalanceados}>
                    Origem
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="debito" ord={ordDesbalanceados} className="text-right">
                    Débito
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="credito"
                    ord={ordDesbalanceados}
                    className="text-right"
                  >
                    Crédito
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="diferenca"
                    ord={ordDesbalanceados}
                    className="text-right"
                  >
                    Diferença
                  </TableHeadOrdenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordDesbalanceados.itensOrdenados.map((d) => (
                  <TableRow key={d.lancamento_id}>
                    <TableCell>{fmtDate(d.data)}</TableCell>
                    <TableCell>{d.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">{d.origem_tipo ?? "—"}</TableCell>
                    <TableCell className="text-right">{brl(d.total_debito)}</TableCell>
                    <TableCell className="text-right">{brl(d.total_credito)}</TableCell>
                    <TableCell className="text-right text-destructive font-medium">
                      {brl(d.diferenca)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo por conta analítica</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="codigo" ord={ordSaldos}>
                  Código
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="conta" ord={ordSaldos}>
                  Conta
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tipo" ord={ordSaldos}>
                  Tipo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="debito" ord={ordSaldos} className="text-right">
                  Débito
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="credito" ord={ordSaldos} className="text-right">
                  Crédito
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="saldo" ord={ordSaldos} className="text-right">
                  Saldo devedor
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensPagina.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.codigo}</TableCell>
                  <TableCell>{c.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {c.tipo === "receita" ? "Receita" : c.tipo === "despesa" ? "Despesa" : c.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{brl(c.total_debito)}</TableCell>
                  <TableCell className="text-right">{brl(c.total_credito)}</TableCell>
                  <TableCell className="text-right">{brl(c.saldo_devedor)}</TableCell>
                </TableRow>
              ))}
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
