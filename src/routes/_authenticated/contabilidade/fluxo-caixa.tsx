import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  obterSaldoBaseContas,
  obterFluxoAnteriores,
  listarMovimentosRealizados,
  listarMovimentosPendentes,
} from "@/lib/backend/fluxo-caixa";
import { obterOrcamentoCaixaMensal } from "@/lib/backend/contabilidade-orcamento";
import { listarSaldoContas } from "@/lib/backend/tesouraria-contas";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";

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

  // Orçamento em base de caixa (achado #581 da auditoria de orçamento/fluxo
  // de caixa) — o orçamento existente só comparava com o regime de
  // competência (DRE Orçado); aqui é a mesma dimensão só que em caixa,
  // buscada por ano (o orçamento é anual) pros anos que aparecem no período
  // selecionado, e casada por mês (chave "AAAA-MM", igual a `linhas`).
  const anosDoPeriodo = useMemo(
    () => Array.from(new Set(linhas.map((l) => Number(l.mes.slice(0, 4))))).sort(),
    [linhas],
  );
  const { data: orcadoCaixaPorAno = [] } = useQuery({
    queryKey: ["orcamento_caixa_mensal", anosDoPeriodo],
    enabled: anosDoPeriodo.length > 0,
    queryFn: () =>
      Promise.all(anosDoPeriodo.map((ano) => obterOrcamentoCaixaMensal({ data: { ano } }))),
  });
  const orcadoPorChaveMes = useMemo(() => {
    const m = new Map<string, { entradaOrcada: number; saidaOrcada: number }>();
    anosDoPeriodo.forEach((ano, idx) => {
      for (const r of orcadoCaixaPorAno[idx] ?? []) {
        m.set(`${ano}-${String(r.mes).padStart(2, "0")}`, {
          entradaOrcada: r.entradaOrcada,
          saidaOrcada: r.saidaOrcada,
        });
      }
    });
    return m;
  }, [anosDoPeriodo, orcadoCaixaPorAno]);
  const totalOrcadoMes = linhas.reduce((s, l) => {
    const o = orcadoPorChaveMes.get(l.mes);
    return s + (o ? o.entradaOrcada - o.saidaOrcada : 0);
  }, 0);

  const exportarCSV = () => {
    const cabecalho = [
      "Mês",
      "Entradas",
      "Saídas",
      "Saldo do mês",
      "Saldo acumulado",
      "Orçado do mês",
      "Variação",
    ];
    let acumulado = saldoAnterior;
    const linhasCsv = linhas.map((l) => {
      acumulado += l.entradas - l.saidas;
      const orcado = orcadoPorChaveMes.get(l.mes);
      const orcadoMes = orcado ? orcado.entradaOrcada - orcado.saidaOrcada : null;
      return [
        l.mes,
        l.entradas.toFixed(2),
        l.saidas.toFixed(2),
        (l.entradas - l.saidas).toFixed(2),
        acumulado.toFixed(2),
        orcadoMes === null ? "" : orcadoMes.toFixed(2),
        orcadoMes === null ? "" : (l.entradas - l.saidas - orcadoMes).toFixed(2),
      ];
    });
    const csv = [cabecalho, ...linhasCsv]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
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
          <Label htmlFor="fluxo-de">De</Label>
          <Input id="fluxo-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="fluxo-ate">Até</Label>
          <Input id="fluxo-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button variant="outline" onClick={exportarCSV} disabled={linhas.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead numeric>Entradas</TableHead>
              <TableHead numeric>Saídas</TableHead>
              <TableHead numeric>Saldo do mês</TableHead>
              <TableHead numeric>Saldo acumulado</TableHead>
              <TableHead numeric>Orçado do mês</TableHead>
              <TableHead numeric>Variação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/20 italic text-muted-foreground">
              <TableCell colSpan={4}>Saldo anterior ao período</TableCell>
              <TableCell numeric>{brl(saldoAnterior)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  Nenhuma movimentação de caixa no período.
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => {
              acumulado += l.entradas - l.saidas;
              const orcado = orcadoPorChaveMes.get(l.mes);
              const orcadoMes = orcado ? orcado.entradaOrcada - orcado.saidaOrcada : null;
              const saldoMes = l.entradas - l.saidas;
              return (
                <TableRow key={l.mes}>
                  <TableCell>{l.mes}</TableCell>
                  <TableCell numeric>{brl(l.entradas)}</TableCell>
                  <TableCell numeric>{brl(l.saidas)}</TableCell>
                  <TableCell numeric className="font-medium">
                    {brl(saldoMes)}
                  </TableCell>
                  <TableCell numeric className="font-medium">
                    {brl(acumulado)}
                  </TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    {orcadoMes === null ? "—" : brl(orcadoMes)}
                  </TableCell>
                  <TableCell
                    numeric
                    className={
                      orcadoMes === null
                        ? "text-muted-foreground"
                        : saldoMes - orcadoMes < 0
                          ? "text-destructive"
                          : "text-emerald-600"
                    }
                  >
                    {orcadoMes === null ? "—" : brl(saldoMes - orcadoMes)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total do período / Saldo final</TableCell>
              <TableCell numeric>{brl(totalEntradas)}</TableCell>
              <TableCell numeric>{brl(totalSaidas)}</TableCell>
              <TableCell numeric>{brl(totalEntradas - totalSaidas)}</TableCell>
              <TableCell numeric className="font-semibold">
                {brl(saldoFinal)}
              </TableCell>
              <TableCell numeric>{brl(totalOrcadoMes)}</TableCell>
              <TableCell numeric className="font-semibold">
                {brl(totalEntradas - totalSaidas - totalOrcadoMes)}
              </TableCell>
            </TableRow>
          </TableFooter>
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

  // queryKey e staleTime iguais aos das demais telas que buscam o mesmo
  // dado (Dashboard, Tesouraria, Conciliação — achado #550 da auditoria de
  // performance), pra compartilhar cache em vez de refazer a consulta ao
  // navegar entre elas.
  const { data: saldos = [] } = useQuery({
    queryKey: ["saldo_contas"],
    queryFn: () => listarSaldoContas(),
    staleTime: 60_000,
  });
  const saldoAtual = saldos.reduce((s, c) => s + Number(c.saldo_atual ?? 0), 0);

  const { data: pendentes = [] } = useQuery({
    queryKey: ["fluxo_pendentes", dataLimite],
    queryFn: () => listarMovimentosPendentes({ data: { hoje, dataLimite } }),
  });
  const ordPendentes = useOrdenacao(pendentes, {
    vencimento: (p) => p.data_vencimento,
    descricao: (p) => p.descricao,
    tipo: (p) => (p.tipo === "entrada" ? 1 : 0),
    valor: (p) => Number(p.valor),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ordPendentes.itensOrdenados,
  );

  const porDia = useMemo(() => {
    const m = new Map<string, { entradas: number; saidas: number }>();
    for (const p of pendentes) {
      // Título vencido (data_vencimento no passado) entra na curva diária
      // agrupado em "hoje" — a projeção começa no saldo atual, então uma
      // linha datada antes de hoje apareceria fora de ordem, antes do saldo
      // do qual ela deveria estar partindo (achado #1 da auditoria de
      // orçamento/fluxo de caixa: antes esses títulos eram só excluídos).
      const chave = p.data_vencimento < hoje ? hoje : p.data_vencimento;
      const atual = m.get(chave) ?? { entradas: 0, saidas: 0 };
      if (p.tipo === "entrada") atual.entradas += Number(p.valor);
      else atual.saidas += Number(p.valor);
      m.set(chave, atual);
    }
    return Array.from(m.entries())
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [pendentes, hoje]);

  const totalEntradas = pendentes
    .filter((p) => p.tipo === "entrada")
    .reduce((s, p) => s + Number(p.valor), 0);
  const totalSaidas = pendentes
    .filter((p) => p.tipo === "saida")
    .reduce((s, p) => s + Number(p.valor), 0);
  const saldoProjetado = saldoAtual + totalEntradas - totalSaidas;

  let acumulado = saldoAtual;

  return (
    <>
      <Card className="my-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div>
          <Label htmlFor="fluxo-horizonte">Horizonte</Label>
          <Select value={horizonte} onValueChange={setHorizonte}>
            <SelectTrigger id="fluxo-horizonte">
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

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead numeric>Entradas</TableHead>
              <TableHead numeric>Saídas</TableHead>
              <TableHead numeric>Saldo do dia</TableHead>
              <TableHead numeric>Saldo acumulado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/20 italic text-muted-foreground">
              <TableCell colSpan={4}>Saldo atual</TableCell>
              <TableCell numeric>{brl(saldoAtual)}</TableCell>
            </TableRow>
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
                  <TableCell numeric>{brl(d.entradas)}</TableCell>
                  <TableCell numeric>{brl(d.saidas)}</TableCell>
                  <TableCell numeric className="font-medium">
                    {brl(d.entradas - d.saidas)}
                  </TableCell>
                  <TableCell numeric className="font-medium">
                    {brl(acumulado)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total previsto / Saldo projetado</TableCell>
              <TableCell numeric>{brl(totalEntradas)}</TableCell>
              <TableCell numeric>{brl(totalSaidas)}</TableCell>
              <TableCell numeric>{brl(totalEntradas - totalSaidas)}</TableCell>
              <TableCell
                numeric
                className={`font-semibold ${saldoProjetado >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {brl(saldoProjetado)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {pendentes.length > 0 && (
        <Card className="mt-4">
          <div className="p-3 border-b font-medium">Detalhamento</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="vencimento" ord={ordPendentes}>
                  Vencimento
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="descricao" ord={ordPendentes}>
                  Descrição
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tipo" ord={ordPendentes}>
                  Tipo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor" ord={ordPendentes} className="text-right">
                  Valor
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensPagina.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {fmtDate(p.data_vencimento)}
                    {p.data_vencimento < hoje && (
                      <Badge variant="destructive" className="ml-2">
                        Vencido
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.descricao}
                    {p.recorrente_id && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Origem: despesa recorrente
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.tipo === "entrada" ? "default" : "destructive"}>
                      {p.tipo === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell numeric>{brl(p.valor)}</TableCell>
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
      )}
    </>
  );
}
