import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarItensContabeisPeriodo } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function primeiroDiaDoAno() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), 0, 1));
}

// Dia imediatamente anterior a `iso` (YYYY-MM-DD) — usado pra buscar o saldo
// anterior ao período (tudo ATÉ a véspera do "De"). Constrói a partir dos
// componentes locais, não de `new Date(iso)` direto: esse parseia como UTC
// meia-noite, e ler de volta com getFullYear/getMonth/getDate (locais) pode
// voltar um dia a menos em fusos negativos — mesma armadilha que fmtDate já
// evita anexando "T00:00:00".
function diaAnterior(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return toISODate(new Date(ano, mes - 1, dia - 1));
}

type LinhaBalancete = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  saldoAnterior: number;
  debito: number;
  credito: number;
};

function Balancete() {
  const [de, setDe] = useState(primeiroDiaDoAno());
  const [ate, setAte] = useState(toISODate(new Date()));

  const { data: linhas = [] } = useQuery({
    queryKey: ["balancete", de, ate],
    queryFn: async () => {
      const [itensAnteriores, itensPeriodo] = await Promise.all([
        listarItensContabeisPeriodo({ data: { de: null, ate: diaAnterior(de) } }),
        listarItensContabeisPeriodo({ data: { de, ate } }),
      ]);

      const porConta = new Map<string, LinhaBalancete>();
      const obter = (it: (typeof itensPeriodo)[number]) => {
        const atual = porConta.get(it.conta_id) ?? {
          id: it.conta_id,
          codigo: it.codigo,
          nome: it.nome,
          tipo: it.conta_tipo,
          saldoAnterior: 0,
          debito: 0,
          credito: 0,
        };
        porConta.set(it.conta_id, atual);
        return atual;
      };
      for (const it of itensAnteriores) {
        const atual = obter(it);
        atual.saldoAnterior += it.tipo === "debito" ? Number(it.valor) : -Number(it.valor);
      }
      for (const it of itensPeriodo) {
        const atual = obter(it);
        if (it.tipo === "debito") atual.debito += Number(it.valor);
        else atual.credito += Number(it.valor);
      }
      return Array.from(porConta.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    },
  });

  const saldoAtual = (l: LinhaBalancete) => l.saldoAnterior + l.debito - l.credito;

  const totalDebito = linhas.reduce((s, l) => s + l.debito, 0);
  const totalCredito = linhas.reduce((s, l) => s + l.credito, 0);
  const diferenca = totalDebito - totalCredito;
  const fechado = Math.abs(diferenca) < 0.01;

  const exportarCSV = () => {
    const cabecalho = [
      "Classe",
      "Código",
      "Conta",
      "Saldo anterior",
      "Débito",
      "Crédito",
      "Saldo atual",
    ];
    const linhasCsv = linhas.map((l) => [
      CLASSE_LABEL[l.tipo] ?? l.tipo,
      l.codigo,
      l.nome,
      l.saldoAnterior.toFixed(2),
      l.debito.toFixed(2),
      l.credito.toFixed(2),
      saldoAtual(l).toFixed(2),
    ]);
    linhasCsv.push([
      "Total",
      "",
      "",
      linhas.reduce((s, l) => s + l.saldoAnterior, 0).toFixed(2),
      totalDebito.toFixed(2),
      totalCredito.toFixed(2),
      linhas.reduce((s, l) => s + saldoAtual(l), 0).toFixed(2),
    ]);
    const csv = [cabecalho, ...linhasCsv]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `balancete_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Balancete de Verificação"
        description="Saldo anterior, débitos e créditos do período e saldo atual, pelo regime de caixa, agrupados por classe."
        actions={
          <Button variant="outline" onClick={exportarCSV} disabled={linhas.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div>
          <Label htmlFor="balancete-de">De</Label>
          <Input id="balancete-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="balancete-ate">Até</Label>
          <Input
            id="balancete-ate"
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </div>
        <div className="md:col-span-2 flex items-center gap-2">
          {fechado ? (
            <Badge className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Balancete fechado — débitos = créditos
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Diferença de {brl(diferenca)} — verifique a
              Auditoria Contábil
            </Badge>
          )}
        </div>
      </Card>

      {ORDEM_CLASSE.map((classe) => {
        const doGrupo = linhas.filter((l) => l.tipo === classe);
        if (doGrupo.length === 0) return null;
        const subAnterior = doGrupo.reduce((s, l) => s + l.saldoAnterior, 0);
        const subDebito = doGrupo.reduce((s, l) => s + l.debito, 0);
        const subCredito = doGrupo.reduce((s, l) => s + l.credito, 0);
        const subAtual = doGrupo.reduce((s, l) => s + saldoAtual(l), 0);
        return (
          <Card key={classe} className="mb-4">
            <div className="p-3 border-b font-medium">{CLASSE_LABEL[classe]}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Saldo anterior</TableHead>
                  <TableHead className="text-right">Débito</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                  <TableHead className="text-right">Saldo atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doGrupo.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono">{l.codigo}</TableCell>
                    <TableCell>{l.nome}</TableCell>
                    <TableCell className="text-right">{brl(l.saldoAnterior)}</TableCell>
                    <TableCell className="text-right">{brl(l.debito)}</TableCell>
                    <TableCell className="text-right">{brl(l.credito)}</TableCell>
                    <TableCell className="text-right font-medium">{brl(saldoAtual(l))}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2}>Subtotal {CLASSE_LABEL[classe]}</TableCell>
                  <TableCell className="text-right">{brl(subAnterior)}</TableCell>
                  <TableCell className="text-right">{brl(subDebito)}</TableCell>
                  <TableCell className="text-right">{brl(subCredito)}</TableCell>
                  <TableCell className="text-right">{brl(subAtual)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        );
      })}

      <Card className="p-4 flex justify-between font-semibold text-lg">
        <span>Totais gerais</span>
        <span>
          {brl(totalDebito)} / {brl(totalCredito)}
        </span>
      </Card>
    </>
  );
}
