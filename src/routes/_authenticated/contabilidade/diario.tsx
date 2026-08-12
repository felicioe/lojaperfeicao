import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarLancamentosDiario } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { Download } from "lucide-react";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";

export const Route = createFileRoute("/_authenticated/contabilidade/diario")({
  head: () => ({ meta: [{ title: "Diário Contábil — Gestão Maçônica" }] }),
  component: Diario,
});

function primeiroDiaDoMes() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function Diario() {
  const [de, setDe] = useState(primeiroDiaDoMes());
  const [ate, setAte] = useState(toISODate(new Date()));

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["diario_lancamentos", de, ate],
    queryFn: () => listarLancamentosDiario({ data: { de, ate } }),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(lancamentos);

  const totalGeral = lancamentos.reduce(
    (s, l) =>
      s +
      (l.lancamentos_contabeis_itens ?? [])
        .filter((i: any) => i.tipo === "debito")
        .reduce((s2: number, i: any) => s2 + Number(i.valor), 0),
    0,
  );

  const exportarCSV = () => {
    const cabecalho = ["Data", "Lançamento", "Origem", "Conta", "Tipo", "Valor"];
    const linhas: string[][] = [];
    for (const l of lancamentos) {
      for (const it of l.lancamentos_contabeis_itens ?? []) {
        linhas.push([
          fmtDate(l.data),
          l.descricao,
          l.origem_tipo ?? "",
          `${it.plano_contas?.codigo} — ${it.plano_contas?.nome}`,
          it.tipo,
          String(it.valor),
        ]);
      }
    }
    const csv = [cabecalho, ...linhas]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diario_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Diário Contábil"
        description="Lançamentos pelo regime de caixa, ordenados pela data efetiva do recebimento ou pagamento."
        actions={
          <Button variant="outline" onClick={exportarCSV} disabled={lancamentos.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-3">
        <div>
          <Label>De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label>Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="flex flex-col justify-end">
          <div className="text-sm text-muted-foreground">Total de débitos no período</div>
          <div className="text-xl font-semibold">{brl(totalGeral)}</div>
        </div>
      </Card>

      <div className="space-y-3">
        {lancamentos.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            Nenhum lançamento no período.
          </Card>
        )}
        {itensPagina.map((l) => (
          <Card key={l.id}>
            <div className="flex items-center justify-between p-3 border-b">
              <div>
                <div className="font-medium">{l.descricao}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtDate(l.data)}
                  {l.origem_tipo ? ` · ${l.origem_tipo}` : ""}
                </div>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Débito</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(l.lancamentos_contabeis_itens ?? []).map((it: any) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      {it.plano_contas?.codigo} — {it.plano_contas?.nome}
                    </TableCell>
                    <TableCell className="text-right">
                      {it.tipo === "debito" ? brl(it.valor) : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {it.tipo === "credito" ? brl(it.valor) : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}
      </div>
      {totalPaginas > 1 && (
        <Card className="mt-3">
          <TabelaPaginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalItens={totalItens}
            tamanhoPagina={tamanhoPagina}
            setPagina={setPagina}
          />
        </Card>
      )}
    </>
  );
}
