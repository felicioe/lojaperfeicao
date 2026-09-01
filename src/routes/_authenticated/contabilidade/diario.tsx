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
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
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
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["diario_lancamentos", de, ate],
    queryFn: () => listarLancamentosDiario({ data: { de, ate } }),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(lancamentos);

  const valorDoLancamento = (l: (typeof lancamentos)[number]) =>
    (l.lancamentos_contabeis_itens ?? [])
      .filter((i) => i.tipo === "debito")
      .reduce((s, i) => s + Number(i.valor), 0);

  const totalGeral = lancamentos.reduce((s, l) => s + valorDoLancamento(l), 0);

  const alternarExpandido = (id: string) => {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const exportarCSV = () => {
    const cabecalho = ["Data", "Histórico", "Irmão", "Conta", "Tipo", "Valor"];
    const linhas: string[][] = [];
    for (const l of lancamentos) {
      for (const it of l.lancamentos_contabeis_itens ?? []) {
        linhas.push([
          fmtDate(l.data),
          l.descricao,
          l.irmao_nome ?? "",
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
          <Label htmlFor="diario-de">De</Label>
          <Input id="diario-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="diario-ate">Até</Label>
          <Input id="diario-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="flex flex-col justify-end">
          <div className="text-sm text-muted-foreground">Total de débitos no período</div>
          <div className="text-xl font-semibold">{brl(totalGeral)}</div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Histórico</TableHead>
              <TableHead>Irmão</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lancamentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhum lançamento no período.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((l) => {
              const aberto = expandidos.has(l.id);
              return (
                <Fragment key={l.id}>
                  <TableRow className="cursor-pointer" onClick={() => alternarExpandido(l.id)}>
                    <TableCell>
                      {aberto ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>{fmtDate(l.data)}</TableCell>
                    <TableCell>{l.descricao}</TableCell>
                    <TableCell>{l.irmao_nome ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {brl(valorDoLancamento(l))}
                    </TableCell>
                  </TableRow>
                  {aberto && (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5} className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="pl-10">Conta</TableHead>
                              <TableHead className="text-right">Débito</TableHead>
                              <TableHead className="text-right">Crédito</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(l.lancamentos_contabeis_itens ?? []).map((it) => (
                              <TableRow key={it.id}>
                                <TableCell className="pl-10">
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
      </Card>
    </>
  );
}
