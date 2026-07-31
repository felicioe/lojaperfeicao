import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  obterSaldoBaseContas,
  obterFluxoAnteriores,
  listarMovimentosRealizados,
  listarMovimentosPendentes,
} from "@/lib/server/fluxo-caixa";
import { listarSaldoContas } from "@/lib/server/tesouraria-contas";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { brl, fmtDate, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contabilidade/fluxo-caixa")({
  head: () => ({ meta: [{ title: "Fluxo de Caixa — Gestão Maçônica" }] }),
  component: FluxoCaixa,
});

function primeiroDiaDoAno() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), 0, 1));
}

function FluxoCaixa() {
  return (
    <>
      <PageHeader
        title="Fluxo de Caixa"
        description="Movimentação de caixa realizada por período e projeção considerando contas a pagar e faturas em aberto."
      />
      <Tabs defaultValue="realizado">
        <TabsList>
          <TabsTrigger value="realizado">Realizado</TabsTrigger>
          <TabsTrigger value="projetado">Projetado</TabsTrigger>
        </TabsList>
        <TabsContent value="realizado">
          <FluxoRealizado />
        </TabsContent>
        <TabsContent value="projetado">
          <FluxoProjetado />
        </TabsContent>
      </Tabs>
    </>
  );
}

type LinhaMensal = { mes: string; entradas: number; saidas: number };

function FluxoRealizado() {
  const [de, setDe] = useState(primeiroDiaDoAno());
  const [ate, setAte] = useState(toISODate(new Date()));

  const { data: saldoBaseContas = 0 } = useQuery({
    queryKey: ["fluxo_saldo_base_contas"],
    queryFn: () => obterSaldoBaseContas(),
  });

  const { data: anteriores = 0 } = useQuery({
    queryKey: ["fluxo_anteriores", de],
    queryFn: () => obterFluxoAnteriores({ data: { de } }),
  });

  const { data: movimentos = [] } = useQuery({
    queryKey: ["fluxo_movimentos", de, ate],
    queryFn: () => listarMovimentosRealizados({ data: { de, ate } }),
  });

  const saldoAnterior = saldoBaseContas + anteriores;

  const linhas = useMemo(() => {
    const porMes = new Map<string, LinhaMensal>();
    for (const m of movimentos) {
      const chave = m.data_pagamento.slice(0, 7);
      const atual = porMes.get(chave) ?? { mes: chave, entradas: 0, saidas: 0 };
      if (m.tipo === "entrada") atual.entradas += Number(m.valor);
      else atual.saidas += Number(m.valor);
      porMes.set(chave, atual);
    }
    return Array.from(porMes.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [movimentos]);

  const totalEntradas = linhas.reduce((s, l) => s + l.entradas, 0);
  const totalSaidas = linhas.reduce((s, l) => s + l.saidas, 0);
  const saldoFinal = saldoAnterior + totalEntradas - totalSaidas;

  const exportarCSV = () => {
    const cabecalho = ["Mês", "Entradas", "Saídas", "Saldo do mês", "Saldo acumulado"];
    let acumulado = saldoAnterior;
    const linhasCsv = linhas.map((l) => {
      acumulado += l.entradas - l.saidas;
      return [l.mes, l.entradas.toFixed(2), l.saidas.toFixed(2), (l.entradas - l.saidas).toFixed(2), acumulado.toFixed(2)];
    });
    const csv = [cabecalho, ...linhasCsv].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluxo_caixa_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let acumulado = saldoAnterior;

  return (
    <>
      <Card className="my-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div>
          <Label>De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label>Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button variant="outline" onClick={exportarCSV} disabled={linhas.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Saldo anterior ao período</div>
          <div className="text-xl font-semibold">{brl(saldoAnterior)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Entradas no período</div>
          <div className="text-xl font-semibold text-emerald-600">{brl(totalEntradas)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Saídas no período</div>
          <div className="text-xl font-semibold text-destructive">{brl(totalSaidas)}</div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Entradas</TableHead>
              <TableHead className="text-right">Saídas</TableHead>
              <TableHead className="text-right">Saldo do mês</TableHead>
              <TableHead className="text-right">Saldo acumulado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma movimentação de caixa no período.
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => {
              acumulado += l.entradas - l.saidas;
              return (
                <TableRow key={l.mes}>
                  <TableCell>{l.mes}</TableCell>
                  <TableCell className="text-right">{brl(l.entradas)}</TableCell>
                  <TableCell className="text-right">{brl(l.saidas)}</TableCell>
                  <TableCell className="text-right font-medium">{brl(l.entradas - l.saidas)}</TableCell>
                  <TableCell className="text-right font-medium">{brl(acumulado)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-semibold bg-muted/30">
              <TableCell>Total do período</TableCell>
              <TableCell className="text-right">{brl(totalEntradas)}</TableCell>
              <TableCell className="text-right">{brl(totalSaidas)}</TableCell>
              <TableCell className="text-right">{brl(totalEntradas - totalSaidas)}</TableCell>
              <TableCell className="text-right">{brl(saldoFinal)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function FluxoProjetado() {
  const [horizonte, setHorizonte] = useState("30");

  const hoje = toISODate(new Date());
  const dataLimite = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + Number(horizonte));
    return toISODate(d);
  }, [horizonte]);

  const { data: saldos = [] } = useQuery({
    queryKey: ["fluxo_saldo_atual"],
    queryFn: () => listarSaldoContas(),
  });
  const saldoAtual = saldos.reduce((s, c) => s + Number(c.saldo_atual ?? 0), 0);

  const { data: pendentes = [] } = useQuery({
    queryKey: ["fluxo_pendentes", dataLimite],
    queryFn: () => listarMovimentosPendentes({ data: { hoje, dataLimite } }),
  });

  const porDia = useMemo(() => {
    const m = new Map<string, { entradas: number; saidas: number }>();
    for (const p of pendentes) {
      const atual = m.get(p.data_vencimento) ?? { entradas: 0, saidas: 0 };
      if (p.tipo === "entrada") atual.entradas += Number(p.valor);
      else atual.saidas += Number(p.valor);
      m.set(p.data_vencimento, atual);
    }
    return Array.from(m.entries())
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [pendentes]);

  const totalEntradas = pendentes.filter((p) => p.tipo === "entrada").reduce((s, p) => s + Number(p.valor), 0);
  const totalSaidas = pendentes.filter((p) => p.tipo === "saida").reduce((s, p) => s + Number(p.valor), 0);
  const saldoProjetado = saldoAtual + totalEntradas - totalSaidas;

  let acumulado = saldoAtual;

  return (
    <>
      <Card className="my-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div>
          <Label>Horizonte</Label>
          <Select value={horizonte} onValueChange={setHorizonte}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
              <SelectItem value="60">Próximos 60 dias</SelectItem>
              <SelectItem value="90">Próximos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Saldo atual</div>
          <div className="text-xl font-semibold">{brl(saldoAtual)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Entradas previstas</div>
          <div className="text-xl font-semibold text-emerald-600">{brl(totalEntradas)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Saídas previstas</div>
          <div className="text-xl font-semibold text-destructive">{brl(totalSaidas)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Saldo projetado</div>
          <div className={`text-xl font-semibold ${saldoProjetado >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {brl(saldoProjetado)}
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Entradas</TableHead>
              <TableHead className="text-right">Saídas</TableHead>
              <TableHead className="text-right">Saldo do dia</TableHead>
              <TableHead className="text-right">Saldo acumulado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {porDia.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma conta a pagar ou fatura em aberto no horizonte selecionado.
                </TableCell>
              </TableRow>
            )}
            {porDia.map((d) => {
              acumulado += d.entradas - d.saidas;
              return (
                <TableRow key={d.data}>
                  <TableCell>{fmtDate(d.data)}</TableCell>
                  <TableCell className="text-right">{brl(d.entradas)}</TableCell>
                  <TableCell className="text-right">{brl(d.saidas)}</TableCell>
                  <TableCell className="text-right font-medium">{brl(d.entradas - d.saidas)}</TableCell>
                  <TableCell className="text-right font-medium">{brl(acumulado)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {pendentes.length > 0 && (
        <Card className="mt-4">
          <div className="p-3 border-b font-medium">Detalhamento</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendentes.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{fmtDate(p.data_vencimento)}</TableCell>
                  <TableCell>{p.descricao}</TableCell>
                  <TableCell>
                    <Badge variant={p.tipo === "entrada" ? "default" : "destructive"}>
                      {p.tipo === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{brl(p.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
