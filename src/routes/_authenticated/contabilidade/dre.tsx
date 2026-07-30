import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { Download } from "lucide-react";
import { brl, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contabilidade/dre")({
  head: () => ({ meta: [{ title: "DRE — Gestão Maçônica" }] }),
  component: Dre,
});

function primeiroDiaDoAno() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), 0, 1));
}

type Linha = { id: string; codigo: string; nome: string; tipo: "receita" | "despesa"; valor: number };

function Dre() {
  const [de, setDe] = useState(primeiroDiaDoAno());
  const [ate, setAte] = useState(toISODate(new Date()));

  const { data: linhas = [] } = useQuery({
    queryKey: ["dre", de, ate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos_contabeis_itens")
        .select("tipo,valor,plano_contas!inner(id,codigo,nome,tipo),lancamentos_contabeis!inner(data)")
        .in("plano_contas.tipo", ["receita", "despesa"])
        .gte("lancamentos_contabeis.data", de)
        .lte("lancamentos_contabeis.data", ate);
      if (error) throw error;

      const porConta = new Map<string, Linha>();
      for (const it of data ?? []) {
        const pc = (it as any).plano_contas;
        const atual = porConta.get(pc.id) ?? { id: pc.id, codigo: pc.codigo, nome: pc.nome, tipo: pc.tipo, valor: 0 };
        const sinal = pc.tipo === "receita" ? (it.tipo === "credito" ? 1 : -1) : (it.tipo === "debito" ? 1 : -1);
        atual.valor += sinal * Number(it.valor);
        porConta.set(pc.id, atual);
      }
      return Array.from(porConta.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    },
  });

  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const totalReceitas = receitas.reduce((s, l) => s + l.valor, 0);
  const totalDespesas = despesas.reduce((s, l) => s + l.valor, 0);
  const resultado = totalReceitas - totalDespesas;

  const exportarCSV = () => {
    const linhasCsv: string[][] = [["Grupo", "Código", "Conta", "Valor"]];
    for (const l of receitas) linhasCsv.push(["Receita", l.codigo, l.nome, String(l.valor)]);
    linhasCsv.push(["Total Receitas", "", "", String(totalReceitas)]);
    for (const l of despesas) linhasCsv.push(["Despesa", l.codigo, l.nome, String(l.valor)]);
    linhasCsv.push(["Total Despesas", "", "", String(totalDespesas)]);
    linhasCsv.push(["Resultado do período", "", "", String(resultado)]);
    const csv = linhasCsv.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dre_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Demonstrativo de Resultado (DRE)"
        description="Receitas e despesas realizadas no período, apuradas a partir dos lançamentos contábeis."
        actions={
          <Button variant="outline" onClick={exportarCSV} disabled={linhas.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div><Label>De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label>Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
      </Card>

      <Card className="mb-4">
        <div className="p-3 border-b font-medium">Receitas</div>
        <Table>
          <TableBody>
            {receitas.length === 0 && <TableRow><TableCell className="text-center py-4 text-muted-foreground">Nenhuma receita no período.</TableCell></TableRow>}
            {receitas.map((l) => (
              <TableRow key={l.id}><TableCell className="font-mono w-24">{l.codigo}</TableCell><TableCell>{l.nome}</TableCell><TableCell className="text-right">{brl(l.valor)}</TableCell></TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/30"><TableCell colSpan={2}>Total de Receitas</TableCell><TableCell className="text-right">{brl(totalReceitas)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </Card>

      <Card className="mb-4">
        <div className="p-3 border-b font-medium">Despesas</div>
        <Table>
          <TableBody>
            {despesas.length === 0 && <TableRow><TableCell className="text-center py-4 text-muted-foreground">Nenhuma despesa no período.</TableCell></TableRow>}
            {despesas.map((l) => (
              <TableRow key={l.id}><TableCell className="font-mono w-24">{l.codigo}</TableCell><TableCell>{l.nome}</TableCell><TableCell className="text-right">{brl(l.valor)}</TableCell></TableRow>
            ))}
            <TableRow className="font-semibold bg-muted/30"><TableCell colSpan={2}>Total de Despesas</TableCell><TableCell className="text-right">{brl(totalDespesas)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div className="text-lg font-semibold">Resultado do período</div>
        <div className={`text-2xl font-bold ${resultado >= 0 ? "text-emerald-600" : "text-destructive"}`}>{brl(resultado)}</div>
      </Card>
    </>
  );
}
