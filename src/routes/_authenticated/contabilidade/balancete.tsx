import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarItensContabeisPeriodo } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { brl, toISODate } from "@/lib/format";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

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

const COLUNAS: ColunaRelatorio[] = [
  { chave: "classe", titulo: "Classe" },
  { chave: "codigo", titulo: "Código" },
  { chave: "conta", titulo: "Conta" },
  { chave: "saldoAnterior", titulo: "Saldo anterior", formato: "moeda" },
  { chave: "debito", titulo: "Débito", formato: "moeda" },
  { chave: "credito", titulo: "Crédito", formato: "moeda" },
  { chave: "saldoAtual", titulo: "Saldo atual", formato: "moeda" },
];

function Balancete() {
  const [de, setDe] = useState(primeiroDiaDoAno());
  const [ate, setAte] = useState(toISODate(new Date()));
  const [classesSelecionadas, setClassesSelecionadas] = useState<Set<string>>(
    () => new Set(ORDEM_CLASSE),
  );
  const [buscaConta, setBuscaConta] = useState("");

  const { data: todasLinhas = [] } = useQuery({
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

  const toggleClasse = (classe: string) => {
    setClassesSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(classe)) novo.delete(classe);
      else novo.add(classe);
      return novo;
    });
  };

  const buscaNormalizada = buscaConta.trim().toLowerCase();
  const linhas = useMemo(
    () =>
      todasLinhas.filter((l) => {
        if (!classesSelecionadas.has(l.tipo)) return false;
        if (!buscaNormalizada) return true;
        return (
          l.codigo.toLowerCase().includes(buscaNormalizada) ||
          l.nome.toLowerCase().includes(buscaNormalizada)
        );
      }),
    [todasLinhas, classesSelecionadas, buscaNormalizada],
  );

  const saldoAtual = (l: LinhaBalancete) => l.saldoAnterior + l.debito - l.credito;

  const totalDebito = linhas.reduce((s, l) => s + l.debito, 0);
  const totalCredito = linhas.reduce((s, l) => s + l.credito, 0);
  const diferenca = totalDebito - totalCredito;
  const fechado = Math.abs(diferenca) < 0.01;

  const linhasExportacao = linhas.map((l) => ({
    classe: CLASSE_LABEL[l.tipo] ?? l.tipo,
    codigo: l.codigo,
    conta: l.nome,
    saldoAnterior: l.saldoAnterior,
    debito: l.debito,
    credito: l.credito,
    saldoAtual: saldoAtual(l),
  }));

  return (
    <>
      <PageHeader
        title="Balancete de Verificação"
        description="Saldo anterior, débitos e créditos do período e saldo atual, pelo regime de caixa, agrupados por classe."
        actions={
          <ExportarRelatorio
            titulo="Balancete de Verificação"
            colunas={COLUNAS}
            linhas={linhasExportacao}
            totais={[
              { rotulo: "Débito", valor: totalDebito },
              { rotulo: "Crédito", valor: totalCredito },
            ]}
          />
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
        <div className="md:col-span-2">
          <Label htmlFor="balancete-busca">Buscar conta</Label>
          <Input
            id="balancete-busca"
            placeholder="Código ou nome…"
            value={buscaConta}
            onChange={(e) => setBuscaConta(e.target.value)}
          />
        </div>
      </Card>

      <Card className="mb-4 p-4 flex flex-wrap items-center gap-2">
        {ORDEM_CLASSE.map((classe) => (
          <Button
            key={classe}
            type="button"
            size="sm"
            variant={classesSelecionadas.has(classe) ? "default" : "outline"}
            onClick={() => toggleClasse(classe)}
          >
            {CLASSE_LABEL[classe]}
          </Button>
        ))}
        <span className="ml-auto">
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
        </span>
      </Card>

      {ORDEM_CLASSE.filter((classe) => classesSelecionadas.has(classe)).map((classe) => {
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
