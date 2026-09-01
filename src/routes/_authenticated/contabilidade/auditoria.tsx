import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarAuditoriaDesbalanceados, listarSaldoPlanoContas } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/contabilidade/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria Contábil — Gestão Maçônica" }] }),
  component: AuditoriaContabil,
});

const COLUNAS_DESBALANCEADOS: ColunaRelatorio[] = [
  { chave: "data", titulo: "Data" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "origem", titulo: "Origem" },
  { chave: "debito", titulo: "Débito" },
  { chave: "credito", titulo: "Crédito" },
  { chave: "diferenca", titulo: "Diferença" },
];

const COLUNAS_SALDOS: ColunaRelatorio[] = [
  { chave: "codigo", titulo: "Código" },
  { chave: "conta", titulo: "Conta" },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "debito", titulo: "Débito" },
  { chave: "credito", titulo: "Crédito" },
  { chave: "saldo", titulo: "Saldo devedor" },
];

const TIPO_LABEL: Record<string, string> = {
  ativo: "Ativo",
  passivo: "Passivo",
  patrimonio_liquido: "Patrimônio Líquido",
  receita: "Receita",
  despesa: "Despesa",
};

function AuditoriaContabil() {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [buscaConta, setBuscaConta] = useState("");
  const [tipoConta, setTipoConta] = useState("todos");

  const { data: desbalanceados = [], isLoading: loadingDesbalanceados } = useQuery({
    queryKey: ["v_auditoria_contabil_desbalanceados", de, ate],
    queryFn: () => listarAuditoriaDesbalanceados({ data: { de: de || null, ate: ate || null } }),
  });

  const { data: saldos = [] } = useQuery({
    queryKey: ["v_saldo_plano_contas", de, ate],
    queryFn: () => listarSaldoPlanoContas({ data: { de: de || null, ate: ate || null } }),
  });

  const ordDesbalanceados = useOrdenacao(desbalanceados, {
    data: (d) => d.data,
    descricao: (d) => d.descricao,
    origem: (d) => d.origem_tipo,
    debito: (d) => Number(d.total_debito),
    credito: (d) => Number(d.total_credito),
    diferenca: (d) => Number(d.diferenca),
  });

  const buscaNormalizada = buscaConta.trim().toLowerCase();
  const saldosFiltrados = saldos.filter((c) => {
    if (tipoConta !== "todos" && c.tipo !== tipoConta) return false;
    if (!buscaNormalizada) return true;
    return (
      c.codigo.toLowerCase().includes(buscaNormalizada) ||
      c.nome.toLowerCase().includes(buscaNormalizada)
    );
  });

  const ordSaldos = useOrdenacao(saldosFiltrados, {
    codigo: (c) => c.codigo,
    conta: (c) => c.nome,
    tipo: (c) => c.tipo,
    debito: (c) => Number(c.total_debito),
    credito: (c) => Number(c.total_credito),
    saldo: (c) => Number(c.saldo_devedor),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ordSaldos.itensOrdenados,
  );

  const totalDebito = saldosFiltrados.reduce((s, c) => s + Number(c.total_debito), 0);
  const totalCredito = saldosFiltrados.reduce((s, c) => s + Number(c.total_credito), 0);
  const consistente = !loadingDesbalanceados && desbalanceados.length === 0;

  const linhasDesbalanceadosExportacao = desbalanceados.map((d) => ({
    data: fmtDate(d.data),
    descricao: d.descricao,
    origem: d.origem_tipo ?? "",
    debito: Number(d.total_debito),
    credito: Number(d.total_credito),
    diferenca: Number(d.diferenca),
  }));

  const linhasSaldosExportacao = saldosFiltrados.map((c) => ({
    codigo: c.codigo,
    conta: c.nome,
    tipo: TIPO_LABEL[c.tipo] ?? c.tipo,
    debito: Number(c.total_debito),
    credito: Number(c.total_credito),
    saldo: Number(c.saldo_devedor),
  }));

  return (
    <>
      <PageHeader
        title="Auditoria Contábil"
        description="Verifica se todos os lançamentos em partida dobrada estão balanceados (débito = crédito)."
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="auditoria-de">De</Label>
          <Input id="auditoria-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="auditoria-ate">Até</Label>
          <Input
            id="auditoria-ate"
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="auditoria-busca">Buscar conta</Label>
          <Input
            id="auditoria-busca"
            placeholder="Código ou nome…"
            value={buscaConta}
            onChange={(e) => setBuscaConta(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="auditoria-tipo">Tipo</Label>
          <Select value={tipoConta} onValueChange={setTipoConta}>
            <SelectTrigger id="auditoria-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.entries(TIPO_LABEL).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground mb-4 -mt-2">
        Sem período selecionado, considera todo o histórico — como sempre foi.
      </p>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total debitado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalDebito)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total creditado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalCredito)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Consistência</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold">
            {consistente ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> OK
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-destructive" /> {desbalanceados.length}{" "}
                lançamento(s)
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {!consistente && (
        <Card className="mb-6 border-destructive">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Lançamentos desbalanceados</CardTitle>
            <ExportarRelatorio
              titulo="Auditoria Contábil — Lançamentos desbalanceados"
              colunas={COLUNAS_DESBALANCEADOS}
              linhas={linhasDesbalanceadosExportacao}
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="data" ord={ordDesbalanceados}>
                    Data
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="descricao" ord={ordDesbalanceados}>
                    Descrição
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="origem" ord={ordDesbalanceados}>
                    Origem
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="debito" ord={ordDesbalanceados} className="text-right">
                    Débito
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="credito"
                    ord={ordDesbalanceados}
                    className="text-right"
                  >
                    Crédito
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="diferenca"
                    ord={ordDesbalanceados}
                    className="text-right"
                  >
                    Diferença
                  </TableHeadOrdenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordDesbalanceados.itensOrdenados.map((d) => (
                  <TableRow key={d.lancamento_id}>
                    <TableCell>{fmtDate(d.data)}</TableCell>
                    <TableCell>{d.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">{d.origem_tipo ?? "—"}</TableCell>
                    <TableCell className="text-right">{brl(d.total_debito)}</TableCell>
                    <TableCell className="text-right">{brl(d.total_credito)}</TableCell>
                    <TableCell className="text-right text-destructive font-medium">
                      {brl(d.diferenca)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Saldo por conta analítica</CardTitle>
          <ExportarRelatorio
            titulo="Auditoria Contábil — Saldo por conta"
            colunas={COLUNAS_SALDOS}
            linhas={linhasSaldosExportacao}
          />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="codigo" ord={ordSaldos}>
                  Código
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="conta" ord={ordSaldos}>
                  Conta
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tipo" ord={ordSaldos}>
                  Tipo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="debito" ord={ordSaldos} className="text-right">
                  Débito
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="credito" ord={ordSaldos} className="text-right">
                  Crédito
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="saldo" ord={ordSaldos} className="text-right">
                  Saldo devedor
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itensPagina.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.codigo}</TableCell>
                  <TableCell>{c.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TIPO_LABEL[c.tipo] ?? c.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{brl(c.total_debito)}</TableCell>
                  <TableCell className="text-right">{brl(c.total_credito)}</TableCell>
                  <TableCell className="text-right">{brl(c.saldo_devedor)}</TableCell>
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
        </CardContent>
      </Card>
    </>
  );
}
