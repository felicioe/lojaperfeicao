import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarLancamentosDiario, listarContasAnaliticas } from "@/lib/backend/contabilidade";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Fragment, useState } from "react";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/contabilidade/diario")({
  head: () => ({ meta: [{ title: "Diário Contábil — Gestão Maçônica" }] }),
  component: Diario,
});

function primeiroDiaDoMes() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

const COLUNAS: ColunaRelatorio[] = [
  { chave: "data", titulo: "Data" },
  { chave: "historico", titulo: "Histórico" },
  { chave: "tipo", titulo: "D/C" },
  { chave: "conta", titulo: "Conta" },
  { chave: "irmao", titulo: "Irmão" },
  { chave: "debito", titulo: "Débito", formato: "moeda" },
  { chave: "credito", titulo: "Crédito", formato: "moeda" },
];

function Diario() {
  const [de, setDe] = useState(primeiroDiaDoMes());
  const [ate, setAte] = useState(toISODate(new Date()));
  const [irmaoId, setIrmaoId] = useState("todos");
  const [contaId, setContaId] = useState("todas");

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });
  const { data: contas = [] } = useQuery({
    queryKey: ["plano_contas_analiticas"],
    queryFn: () => listarContasAnaliticas(),
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["diario_lancamentos", de, ate, irmaoId, contaId],
    queryFn: () =>
      listarLancamentosDiario({
        data: {
          de,
          ate,
          irmaoId: irmaoId !== "todos" ? irmaoId : null,
          contaId: contaId !== "todas" ? contaId : null,
        },
      }),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(lancamentos);

  const valorDoLancamento = (l: (typeof lancamentos)[number]) =>
    (l.lancamentos_contabeis_itens ?? [])
      .filter((i) => i.tipo === "debito")
      .reduce((s, i) => s + Number(i.valor), 0);

  const totalGeral = lancamentos.reduce((s, l) => s + valorDoLancamento(l), 0);

  const linhasExportacao = lancamentos.flatMap((l) =>
    (l.lancamentos_contabeis_itens ?? []).map((it) => ({
      data: fmtDate(l.data),
      historico: l.descricao,
      tipo: it.tipo === "debito" ? "D" : "C",
      conta: it.plano_contas ? `${it.plano_contas.codigo} — ${it.plano_contas.nome}` : "—",
      irmao: l.irmao_nome ?? "",
      debito: it.tipo === "debito" ? Number(it.valor) : "",
      credito: it.tipo === "credito" ? Number(it.valor) : "",
    })),
  );

  return (
    <>
      <PageHeader
        title="Diário Contábil"
        description="Lançamentos em partida dobrada pelo regime de caixa, ordenados pela data efetiva do recebimento ou pagamento."
        actions={
          <ExportarRelatorio
            titulo="Diário Contábil"
            colunas={COLUNAS}
            linhas={linhasExportacao}
            totais={[{ rotulo: "Total de débitos", valor: totalGeral }]}
          />
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="diario-de">De</Label>
          <Input id="diario-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="diario-ate">Até</Label>
          <Input id="diario-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="diario-irmao">Irmão</Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger id="diario-irmao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {irmaos.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome_civil}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="diario-conta">Conta contábil</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger id="diario-conta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} — {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="mb-4 p-4 flex flex-col justify-end">
        <div className="text-sm text-muted-foreground">Total de débitos no período</div>
        <div className="text-xl font-semibold">{brl(totalGeral)}</div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Histórico</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Irmão</TableHead>
              <TableHead className="text-right">Débito</TableHead>
              <TableHead className="text-right">Crédito</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lancamentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhum lançamento no período.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((l) => {
              const itens = l.lancamentos_contabeis_itens ?? [];
              return (
                <Fragment key={l.id}>
                  {itens.map((it, indice) => (
                    <TableRow key={it.id}>
                      {indice === 0 && (
                        <>
                          <TableCell rowSpan={itens.length}>{fmtDate(l.data)}</TableCell>
                          <TableCell rowSpan={itens.length}>{l.descricao}</TableCell>
                        </>
                      )}
                      <TableCell>
                        <span
                          className={
                            it.tipo === "debito"
                              ? "mr-1.5 rounded bg-blue-100 px-1 text-[10px] font-bold text-blue-900 dark:bg-blue-900/40 dark:text-blue-300"
                              : "mr-1.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-300"
                          }
                        >
                          {it.tipo === "debito" ? "D" : "C"}
                        </span>
                        {it.plano_contas
                          ? `${it.plano_contas.codigo} — ${it.plano_contas.nome}`
                          : "—"}
                      </TableCell>
                      {indice === 0 && (
                        <TableCell rowSpan={itens.length}>{l.irmao_nome ?? "—"}</TableCell>
                      )}
                      <TableCell className="text-right">
                        {it.tipo === "debito" ? brl(it.valor) : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        {it.tipo === "credito" ? brl(it.valor) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
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
