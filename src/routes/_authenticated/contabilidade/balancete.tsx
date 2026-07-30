import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { brl, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contabilidade/balancete")({
  head: () => ({ meta: [{ title: "Balancete — Gestão Maçônica" }] }),
  component: Balancete,
});

const CLASSE_LABEL: Record<string, string> = {
  ativo: "Ativo",
  passivo: "Passivo",
  patrimonio_liquido: "Patrimônio Líquido",
  receita: "Receita",
  despesa: "Despesa",
};

const ORDEM_CLASSE = ["ativo", "passivo", "patrimonio_liquido", "receita", "despesa"];

function Balancete() {
  const [dataCorte, setDataCorte] = useState(toISODate(new Date()));

  const { data: linhas = [] } = useQuery({
    queryKey: ["balancete", dataCorte],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos_contabeis_itens")
        .select("tipo,valor,plano_contas!inner(id,codigo,nome,tipo),lancamentos_contabeis!inner(data)")
        .lte("lancamentos_contabeis.data", dataCorte);
      if (error) throw error;

      const porConta = new Map<string, { id: string; codigo: string; nome: string; tipo: string; debito: number; credito: number }>();
      for (const it of data ?? []) {
        const pc = (it as any).plano_contas;
        const atual = porConta.get(pc.id) ?? { id: pc.id, codigo: pc.codigo, nome: pc.nome, tipo: pc.tipo, debito: 0, credito: 0 };
        if (it.tipo === "debito") atual.debito += Number(it.valor); else atual.credito += Number(it.valor);
        porConta.set(pc.id, atual);
      }
      return Array.from(porConta.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    },
  });

  const totalDebito = linhas.reduce((s, l) => s + l.debito, 0);
  const totalCredito = linhas.reduce((s, l) => s + l.credito, 0);
  const diferenca = totalDebito - totalCredito;
  const fechado = Math.abs(diferenca) < 0.01;

  const exportarCSV = () => {
    const cabecalho = ["Classe", "Código", "Conta", "Débito", "Crédito", "Saldo"];
    const linhasCsv = linhas.map((l) => [CLASSE_LABEL[l.tipo] ?? l.tipo, l.codigo, l.nome, l.debito.toFixed(2), l.credito.toFixed(2), (l.debito - l.credito).toFixed(2)]);
    linhasCsv.push(["Total", "", "", totalDebito.toFixed(2), totalCredito.toFixed(2), diferenca.toFixed(2)]);
    const csv = [cabecalho, ...linhasCsv].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `balancete_${dataCorte}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Balancete de Verificação"
        description="Débito e crédito acumulados por conta até a data de corte, agrupados por classe."
        actions={
          <Button variant="outline" onClick={exportarCSV} disabled={linhas.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div><Label>Data de corte</Label><Input type="date" value={dataCorte} onChange={(e) => setDataCorte(e.target.value)} /></div>
        <div className="md:col-span-3 flex items-center gap-2">
          {fechado ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Balancete fechado — débitos = créditos</Badge>
          ) : (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Diferença de {brl(diferenca)} — verifique a Auditoria Contábil</Badge>
          )}
        </div>
      </Card>

      {ORDEM_CLASSE.map((classe) => {
        const doGrupo = linhas.filter((l) => l.tipo === classe);
        if (doGrupo.length === 0) return null;
        const subDebito = doGrupo.reduce((s, l) => s + l.debito, 0);
        const subCredito = doGrupo.reduce((s, l) => s + l.credito, 0);
        return (
          <Card key={classe} className="mb-4">
            <div className="p-3 border-b font-medium">{CLASSE_LABEL[classe]}</div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Código</TableHead><TableHead>Conta</TableHead><TableHead className="text-right">Débito</TableHead><TableHead className="text-right">Crédito</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {doGrupo.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono">{l.codigo}</TableCell>
                    <TableCell>{l.nome}</TableCell>
                    <TableCell className="text-right">{brl(l.debito)}</TableCell>
                    <TableCell className="text-right">{brl(l.credito)}</TableCell>
                    <TableCell className="text-right font-medium">{brl(l.debito - l.credito)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2}>Subtotal {CLASSE_LABEL[classe]}</TableCell>
                  <TableCell className="text-right">{brl(subDebito)}</TableCell>
                  <TableCell className="text-right">{brl(subCredito)}</TableCell>
                  <TableCell className="text-right">{brl(subDebito - subCredito)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        );
      })}

      <Card className="p-4 flex justify-between font-semibold text-lg">
        <span>Totais gerais</span>
        <span>{brl(totalDebito)} / {brl(totalCredito)}</span>
      </Card>
    </>
  );
}
