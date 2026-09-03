import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarItensContabeisPeriodo } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { brl, fmtDate, toISODate } from "@/lib/format";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/contabilidade/dre")({
  head: () => ({ meta: [{ title: "DRE — Gestão Maçônica" }] }),
  component: Dre,
});

function primeiroDiaDoAno() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), 0, 1));
}

type Linha = {
  id: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
  valor: number;
};

function Dre() {
  const navigate = useNavigate();
  const [de, setDe] = useState(primeiroDiaDoAno());
  const [ate, setAte] = useState(toISODate(new Date()));

  // Clicar numa conta abre o Razão Contábil dela, já filtrado pelo mesmo
  // período do DRE (issue #405) — reaproveita a tela que já mostra saldo
  // anterior/atual e a movimentação, em vez de duplicar essa visão aqui.
  const abrirRazao = (contaId: string) => {
    navigate({ to: "/contabilidade/razao", search: { contaId, de, ate } });
  };

  const { data: linhas = [] } = useQuery({
    queryKey: ["dre", de, ate],
    queryFn: async () => {
      const itens = await listarItensContabeisPeriodo({ data: { de, ate } });
      const porConta = new Map<string, Linha>();
      for (const it of itens) {
        if (it.conta_tipo !== "receita" && it.conta_tipo !== "despesa") continue;
        const atual = porConta.get(it.conta_id) ?? {
          id: it.conta_id,
          codigo: it.codigo,
          nome: it.nome,
          tipo: it.conta_tipo,
          valor: 0,
        };
        const sinal =
          it.conta_tipo === "receita"
            ? it.tipo === "credito"
              ? 1
              : -1
            : it.tipo === "debito"
              ? 1
              : -1;
        atual.valor += sinal * Number(it.valor);
        porConta.set(it.conta_id, atual);
      }
      return Array.from(porConta.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    },
  });

  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const totalReceitas = receitas.reduce((s, l) => s + l.valor, 0);
  const totalDespesas = despesas.reduce((s, l) => s + l.valor, 0);
  const resultado = totalReceitas - totalDespesas;

  // Colunas/linhas planas — usadas pelo CSV/TXT e pelo envio por e-mail
  // (que não têm modo agrupado). O PDF/XLSX usam `grupos`/`resultado`
  // abaixo, com seções e subtotal (issue #450).
  const colunasExportacao: ColunaRelatorio[] = [
    { chave: "grupo", titulo: "Grupo" },
    { chave: "codigo", titulo: "Código" },
    { chave: "conta", titulo: "Conta" },
    { chave: "valor", titulo: "Valor", formato: "moeda" },
  ];
  const linhasExportacao = [
    ...receitas.map((l) => ({ grupo: "Receita", codigo: l.codigo, conta: l.nome, valor: l.valor })),
    { grupo: "Total Receitas", codigo: "", conta: "", valor: totalReceitas },
    ...despesas.map((l) => ({ grupo: "Despesa", codigo: l.codigo, conta: l.nome, valor: l.valor })),
    { grupo: "Total Despesas", codigo: "", conta: "", valor: totalDespesas },
    { grupo: "Resultado do período", codigo: "", conta: "", valor: resultado },
  ];
  const gruposExportacao = [
    {
      titulo: "Receitas",
      itens: receitas.map((l) => ({ codigo: l.codigo, nome: l.nome, valor: l.valor })),
      subtotal: { rotulo: "Total de Receitas", valor: totalReceitas },
    },
    {
      titulo: "Despesas",
      itens: despesas.map((l) => ({ codigo: l.codigo, nome: l.nome, valor: l.valor })),
      subtotal: { rotulo: "Total de Despesas", valor: totalDespesas },
    },
  ];
  const subtituloExportacao = `Período: ${fmtDate(de)} a ${fmtDate(ate)}`;

  return (
    <>
      <PageHeader
        title="Demonstrativo de Resultado (DRE)"
        description="Receitas e despesas reconhecidas pelo regime de caixa, na data do efetivo recebimento ou pagamento."
        actions={
          <ExportarRelatorio
            titulo="Demonstrativo de Resultado (DRE)"
            colunas={colunasExportacao}
            linhas={linhasExportacao}
            grupos={gruposExportacao}
            resultado={{ rotulo: "Resultado do período", valor: resultado }}
            subtitulo={subtituloExportacao}
          />
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="dre-de">De</Label>
          <Input id="dre-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="dre-ate">Até</Label>
          <Input id="dre-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </Card>

      <Card className="mb-4">
        <div className="p-3 border-b font-medium">Receitas</div>
        <Table>
          <TableBody>
            {receitas.length === 0 && (
              <TableRow>
                <TableCell className="text-center py-4 text-muted-foreground">
                  Nenhuma receita no período.
                </TableCell>
              </TableRow>
            )}
            {receitas.map((l) => (
              <TableRow
                key={l.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => abrirRazao(l.id)}
              >
                <TableCell className="font-mono w-24">{l.codigo}</TableCell>
                <TableCell className="underline decoration-dotted">{l.nome}</TableCell>
                <TableCell numeric>{brl(l.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total de Receitas</TableCell>
              <TableCell numeric>{brl(totalReceitas)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      <Card className="mb-4">
        <div className="p-3 border-b font-medium">Despesas</div>
        <Table>
          <TableBody>
            {despesas.length === 0 && (
              <TableRow>
                <TableCell className="text-center py-4 text-muted-foreground">
                  Nenhuma despesa no período.
                </TableCell>
              </TableRow>
            )}
            {despesas.map((l) => (
              <TableRow
                key={l.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => abrirRazao(l.id)}
              >
                <TableCell className="font-mono w-24">{l.codigo}</TableCell>
                <TableCell className="underline decoration-dotted">{l.nome}</TableCell>
                <TableCell numeric>{brl(l.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total de Despesas</TableCell>
              <TableCell numeric>{brl(totalDespesas)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      <Card>
        <Table>
          <TableFooter>
            <TableRow>
              <TableCell className="text-lg font-semibold">Resultado do período</TableCell>
              <TableCell
                numeric
                className={`text-2xl font-bold ${resultado >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {brl(resultado)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </>
  );
}
