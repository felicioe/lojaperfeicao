import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  listarContasAnaliticas,
  obterSaldoAnteriorConta,
  listarItensRazao,
} from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";

export const Route = createFileRoute("/_authenticated/contabilidade/razao")({
  head: () => ({ meta: [{ title: "Razão Contábil — Gestão Maçônica" }] }),
  component: Razao,
});

function primeiroDiaDoAno() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), 0, 1));
}

function Razao() {
  const [contaId, setContaId] = useState("");
  const [de, setDe] = useState(primeiroDiaDoAno());
  const [ate, setAte] = useState(toISODate(new Date()));

  const { data: contas = [] } = useQuery({
    queryKey: ["plano_contas_analiticas"],
    queryFn: () => listarContasAnaliticas(),
  });

  const { data: saldoAnterior = 0 } = useQuery({
    queryKey: ["razao_saldo_anterior", contaId, de],
    enabled: !!contaId,
    queryFn: () => obterSaldoAnteriorConta({ data: { contaId, antesDe: de } }),
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["razao_itens", contaId, de, ate],
    enabled: !!contaId,
    queryFn: () => listarItensRazao({ data: { contaId, de, ate } }),
  });

  const linhas = useMemo(() => {
    let saldo = saldoAnterior;
    return itens.map((i) => {
      saldo += i.tipo === "debito" ? Number(i.valor) : -Number(i.valor);
      return { ...i, saldo };
    });
  }, [itens, saldoAnterior]);

  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(linhas);

  const totalDebito = itens
    .filter((i) => i.tipo === "debito")
    .reduce((s, i) => s + Number(i.valor), 0);
  const totalCredito = itens
    .filter((i) => i.tipo === "credito")
    .reduce((s, i) => s + Number(i.valor), 0);

  const exportarCSV = () => {
    const cabecalho = ["Data", "Descrição", "Origem", "Débito", "Crédito", "Saldo"];
    const linhasCsv = linhas.map((l) => [
      fmtDate(l.lancamentos_contabeis.data),
      l.descricao ?? l.lancamentos_contabeis.descricao,
      l.lancamentos_contabeis.origem_tipo ?? "",
      l.tipo === "debito" ? l.valor : "",
      l.tipo === "credito" ? l.valor : "",
      l.saldo.toFixed(2),
    ]);
    const csv = [cabecalho, ...linhasCsv]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `razao_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Razão Contábil"
        description="Movimentação pelo regime de caixa de uma conta analítica, com saldo acumulado."
        actions={
          <Button
            variant="outline"
            onClick={exportarCSV}
            disabled={!contaId || linhas.length === 0}
          >
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label>Conta</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} — {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label>Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </Card>

      {contaId && (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Saldo anterior</div>
              <div className="text-xl font-semibold">{brl(saldoAnterior)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Débitos do período</div>
              <div className="text-xl font-semibold">{brl(totalDebito)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Créditos do período</div>
              <div className="text-xl font-semibold">{brl(totalCredito)}</div>
            </Card>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Débito</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      Nenhum lançamento no período.
                    </TableCell>
                  </TableRow>
                )}
                {itensPagina.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{fmtDate(l.lancamentos_contabeis.data)}</TableCell>
                    <TableCell>{l.descricao ?? l.lancamentos_contabeis.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.lancamentos_contabeis.origem_tipo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.tipo === "debito" ? brl(l.valor) : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.tipo === "credito" ? brl(l.valor) : ""}
                    </TableCell>
                    <TableCell className="text-right font-medium">{brl(l.saldo)}</TableCell>
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
          </Card>
        </>
      )}
    </>
  );
}
