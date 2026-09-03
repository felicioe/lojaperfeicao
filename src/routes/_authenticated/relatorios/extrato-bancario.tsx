import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { relatorioExtratoBancario } from "@/lib/backend/relatorios";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { CATEGORIA_LABEL } from "@/components/app/movimentos-filtros";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/relatorios/extrato-bancario")({
  head: () => ({ meta: [{ title: "Extrato Bancário — Gestão Maçônica" }] }),
  component: ExtratoBancario,
});

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia: "Transferência",
};

const COLUNAS: ColunaRelatorio[] = [
  { chave: "data", titulo: "Data" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "irmao", titulo: "Irmão" },
  { chave: "conta_contabil", titulo: "Conta contábil" },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "valor", titulo: "Valor", formato: "moeda" },
  { chave: "saldo", titulo: "Saldo corrente", formato: "moeda" },
];

function ExtratoBancario() {
  const [contaId, setContaId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [irmaoId, setIrmaoId] = useState("todos");
  const [modo, setModo] = useState<"compensado" | "creditado">("creditado");

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["relatorio_extrato_bancario", contaId, de, ate, tipo, categoria, irmaoId, modo],
    enabled: !!contaId,
    queryFn: () =>
      relatorioExtratoBancario({
        data: {
          contaId,
          de: de || null,
          ate: ate || null,
          tipo: tipo !== "todos" ? (tipo as "entrada" | "saida" | "transferencia") : null,
          categoria: categoria !== "todas" ? categoria : null,
          irmaoId: irmaoId !== "todos" ? irmaoId : null,
          modo,
        },
      }),
  });

  const saldoFinal = itens.length > 0 ? itens[itens.length - 1].saldo_corrente : null;
  // Saldo inicial do recorte exibido: o saldo corrente já reflete o
  // histórico completo até "ate" (ver comentário no backend), então o
  // saldo logo antes da primeira linha filtrada é o saldo dela menos o
  // próprio valor que ela aplicou — dá pra derivar tudo sem nova consulta.
  const saldoInicial = itens.length > 0 ? itens[0].saldo_corrente - itens[0].valor_sinal : null;
  const totalEntradas = itens
    .filter((i) => i.valor_sinal > 0)
    .reduce((soma, i) => soma + i.valor_sinal, 0);
  const totalSaidas = itens
    .filter((i) => i.valor_sinal < 0)
    .reduce((soma, i) => soma - i.valor_sinal, 0);

  const linhasExportacao = itens.map((i) => ({
    data: fmtDate(i.data),
    descricao:
      i.faturas && i.faturas.length > 1
        ? `${i.descricao} (${i.faturas.map((f) => f.descricao).join("; ")})`
        : i.descricao,
    irmao: i.irmao_nome ?? "",
    conta_contabil: i.plano_conta_nome ?? "",
    tipo: TIPO_LABEL[i.tipo],
    valor: i.valor_sinal,
    saldo: i.saldo_corrente,
  }));

  const ord = useOrdenacao([...itens].reverse(), {
    data: (i) => i.data,
    descricao: (i) => i.descricao,
    irmao: (i) => i.irmao_nome,
    conta_contabil: (i) => i.plano_conta_nome,
    tipo: (i) => i.tipo,
    valor: (i) => i.valor_sinal,
    saldo: (i) => i.saldo_corrente,
  });
  const pag = usePaginacao(ord.itensOrdenados);

  return (
    <>
      <PageHeader
        title="Extrato Bancário"
        description="Extrato cronológico de uma conta financeira, com saldo corrente."
        actions={
          contaId && (
            <ExportarRelatorio
              titulo="Extrato Bancário"
              colunas={COLUNAS}
              linhas={linhasExportacao}
              totais={
                saldoFinal !== null && saldoInicial !== null
                  ? [
                      { rotulo: "Saldo inicial", valor: saldoInicial },
                      { rotulo: "Entradas", valor: totalEntradas },
                      { rotulo: "Saídas", valor: totalSaidas },
                      { rotulo: "Saldo final", valor: saldoFinal },
                    ]
                  : undefined
              }
            />
          )
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs" htmlFor="extrato-bancario-conta-bancaria">
            Conta bancária
          </Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger id="extrato-bancario-conta-bancaria">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs" htmlFor="extrato-bancario-de">
            De
          </Label>
          <Input
            id="extrato-bancario-de"
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="extrato-bancario-ate">
            Até
          </Label>
          <Input
            id="extrato-bancario-ate"
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="extrato-bancario-tipo">
            Tipo
          </Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger id="extrato-bancario-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
              <SelectItem value="transferencia">Transferência</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs" htmlFor="extrato-bancario-categoria">
            Categoria
          </Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger id="extrato-bancario-categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs" htmlFor="extrato-bancario-irmao">
            Irmão
          </Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger id="extrato-bancario-irmao">
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
          <Label className="text-xs" htmlFor="extrato-bancario-valores-exibidos">
            Valores exibidos
          </Label>
          <Select value={modo} onValueChange={(v) => setModo(v as "compensado" | "creditado")}>
            <SelectTrigger id="extrato-bancario-valores-exibidos">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="creditado">Creditado em conta (extrato real)</SelectItem>
              <SelectItem value="compensado">Compensado (com as faturas)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {!contaId && (
        <Card className="p-6 text-center text-muted-foreground">
          Selecione uma conta bancária para ver o extrato.
        </Card>
      )}

      {contaId && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeadOrdenavel campo="data" ord={ord}>
                      Data
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="descricao" ord={ord}>
                      Descrição
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="irmao" ord={ord}>
                      Irmão
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="conta_contabil" ord={ord}>
                      Conta contábil
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="tipo" ord={ord}>
                      Tipo
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                      Valor
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="saldo" ord={ord} className="text-right">
                      Saldo corrente
                    </TableHeadOrdenavel>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        Nenhum lançamento encontrado nesse período.
                      </TableCell>
                    </TableRow>
                  )}
                  {pag.itensPagina.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{fmtDate(i.data)}</TableCell>
                      <TableCell>
                        {i.descricao}
                        {i.faturas && i.faturas.length > 1 && (
                          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {i.faturas.map((f) => (
                              <div key={f.id} className="flex justify-between gap-2">
                                <span>{f.descricao}</span>
                                <span>{brl(f.valor)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{i.irmao_nome ?? "—"}</TableCell>
                      <TableCell>{i.plano_conta_nome ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{TIPO_LABEL[i.tipo]}</Badge>
                      </TableCell>
                      <TableCell
                        numeric
                        className={`font-medium ${i.valor_sinal < 0 ? "text-destructive" : ""}`}
                      >
                        {brl(i.valor_sinal)}
                      </TableCell>
                      <TableCell numeric>{brl(i.saldo_corrente)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {saldoFinal !== null && saldoInicial !== null && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5}>Saldo inicial do recorte</TableCell>
                      <TableCell colSpan={2} numeric>
                        {brl(saldoInicial)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5}>Entradas / Saídas</TableCell>
                      <TableCell numeric className="text-emerald-600">
                        {brl(totalEntradas)}
                      </TableCell>
                      <TableCell numeric className="text-destructive">
                        {brl(totalSaidas)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5}>Saldo final</TableCell>
                      <TableCell colSpan={2} numeric className="font-semibold">
                        {brl(saldoFinal)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
            <TabelaPaginacao
              pagina={pag.pagina}
              totalPaginas={pag.totalPaginas}
              totalItens={pag.totalItens}
              tamanhoPagina={pag.tamanhoPagina}
              setPagina={pag.setPagina}
            />
          </Card>
        </>
      )}
    </>
  );
}
