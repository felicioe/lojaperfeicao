import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarConferenciaContabilFinanceira } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { BarraFiltros, CampoFiltroCompacto, SeparadorFiltro } from "@/components/app/BarraFiltros";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { brl, fmtMesAno } from "@/lib/format";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/contabilidade/conferencia")({
  head: () => ({ meta: [{ title: "Conferência Contábil x Financeira — Gestão Maçônica" }] }),
  component: ConferenciaContabilFinanceira,
});

// Diferenças de até 1 centavo são arredondamento, não divergência real.
const TOLERANCIA = 0.01;

const COLUNAS: ColunaRelatorio[] = [
  { chave: "conta", titulo: "Conta financeira" },
  { chave: "mes", titulo: "Mês" },
  { chave: "financeiro", titulo: "Movimento financeiro", formato: "moeda" },
  { chave: "contabil", titulo: "Movimento contábil", formato: "moeda" },
  { chave: "diferenca", titulo: "Diferença no mês", formato: "moeda" },
  { chave: "diferencaAcumulada", titulo: "Diferença acumulada", formato: "moeda" },
];

type LinhaConta = {
  contaId: string;
  contaNome: string;
  meses: {
    mes: string;
    financeiro: number;
    contabil: number;
    diferenca: number;
    diferencaAcumulada: number;
  }[];
  diferencaFinal: number;
  totalFinanceiro: number;
  totalContabil: number;
};

function ConferenciaContabilFinanceira() {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const temFiltroAtivo = de !== "" || ate !== "";
  const limparFiltros = () => {
    setDe("");
    setAte("");
  };

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["conferencia_contabil_financeira", de, ate],
    queryFn: () =>
      listarConferenciaContabilFinanceira({ data: { de: de || null, ate: ate || null } }),
  });

  const contas = useMemo<LinhaConta[]>(() => {
    const porConta = new Map<string, LinhaConta>();
    for (const l of linhas) {
      let conta = porConta.get(l.conta_financeira_id);
      if (!conta) {
        conta = {
          contaId: l.conta_financeira_id,
          contaNome: l.conta_financeira_nome,
          meses: [],
          diferencaFinal: 0,
          totalFinanceiro: 0,
          totalContabil: 0,
        };
        porConta.set(l.conta_financeira_id, conta);
      }
      const financeiro = Number(l.movimento_financeiro);
      const contabil = Number(l.movimento_contabil);
      const diferenca = financeiro - contabil;
      const diferencaAcumulada = conta.diferencaFinal + diferenca;
      conta.meses.push({ mes: l.mes, financeiro, contabil, diferenca, diferencaAcumulada });
      conta.diferencaFinal = diferencaAcumulada;
      conta.totalFinanceiro += financeiro;
      conta.totalContabil += contabil;
    }
    return [...porConta.values()];
  }, [linhas]);

  const contasComDivergencia = contas.filter((c) => Math.abs(c.diferencaFinal) > TOLERANCIA);
  const mesesComDivergencia = contas.reduce(
    (soma, c) => soma + c.meses.filter((m) => Math.abs(m.diferenca) > TOLERANCIA).length,
    0,
  );
  const tudoConferido = !isLoading && contasComDivergencia.length === 0;

  const linhasExportacao = contas.flatMap((c) =>
    c.meses.map((m) => ({
      conta: c.contaNome,
      mes: fmtMesAno(m.mes),
      financeiro: m.financeiro,
      contabil: m.contabil,
      diferenca: m.diferenca,
      diferencaAcumulada: m.diferencaAcumulada,
    })),
  );

  return (
    <>
      <PageHeader
        title="Conferência Contábil x Financeira"
        description="Compara, mês a mês, o movimento real de cada conta financeira com o efeito líquido dos lançamentos contábeis nela — a mesma conferência feita manualmente na recuperação de agosto/2026, agora automática."
      />

      <BarraFiltros temFiltroAtivo={temFiltroAtivo} onLimpar={limparFiltros}>
        <CampoFiltroCompacto label="De" htmlFor="conferencia-de">
          <Input
            id="conferencia-de"
            type="date"
            className="h-8 w-[150px]"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </CampoFiltroCompacto>
        <CampoFiltroCompacto label="Até" htmlFor="conferencia-ate">
          <Input
            id="conferencia-ate"
            type="date"
            className="h-8 w-[150px]"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </CampoFiltroCompacto>
        <SeparadorFiltro />
        <ExportarRelatorio
          titulo="Conferência Contábil x Financeira"
          colunas={COLUNAS}
          linhas={linhasExportacao}
        />
      </BarraFiltros>
      <p className="text-xs text-muted-foreground mb-4 -mt-2">
        Sem período selecionado, considera todo o histórico de cada conta. O movimento financeiro
        usa sempre a data real do crédito/débito bancário; o contábil usa a data da baixa. Um lote
        que quita várias faturas atrasadas de uma vez com Pix de meses diferentes pode mostrar
        diferença nesses meses de propósito — é o dinheiro chegando num mês e virando receita
        reconhecida em outro, não um erro de dado.
      </p>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Contas conferidas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{contas.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Meses com diferença</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{mesesComDivergencia}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Resultado</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold">
            {tudoConferido ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Fecha
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-destructive" /> {contasComDivergencia.length}{" "}
                conta(s) com diferença
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {contas.map((conta) => {
          const divergente = Math.abs(conta.diferencaFinal) > TOLERANCIA;
          return (
            <Card key={conta.contaId} className={divergente ? "border-destructive" : undefined}>
              <CardHeader>
                <CardTitle className="text-base">{conta.contaNome}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead numeric>Movimento financeiro</TableHead>
                      <TableHead numeric>Movimento contábil</TableHead>
                      <TableHead numeric>Diferença no mês</TableHead>
                      <TableHead numeric>Diferença acumulada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conta.meses.map((m) => {
                      const mesDivergente = Math.abs(m.diferenca) > TOLERANCIA;
                      return (
                        <TableRow key={m.mes}>
                          <TableCell className="capitalize">{fmtMesAno(m.mes)}</TableCell>
                          <TableCell numeric>{brl(m.financeiro)}</TableCell>
                          <TableCell numeric>{brl(m.contabil)}</TableCell>
                          <TableCell
                            numeric
                            className={
                              mesDivergente
                                ? "font-medium text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            {brl(m.diferenca)}
                          </TableCell>
                          <TableCell
                            numeric
                            className={
                              Math.abs(m.diferencaAcumulada) > TOLERANCIA
                                ? "font-medium text-destructive"
                                : "text-muted-foreground"
                            }
                          >
                            {brl(m.diferencaAcumulada)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>Total / Diferença final</TableCell>
                      <TableCell numeric>{brl(conta.totalFinanceiro)}</TableCell>
                      <TableCell numeric>{brl(conta.totalContabil)}</TableCell>
                      <TableCell
                        numeric
                        className={divergente ? "font-semibold text-destructive" : "font-semibold"}
                      >
                        {brl(conta.diferencaFinal)}
                      </TableCell>
                      <TableCell
                        numeric
                        className={divergente ? "font-semibold text-destructive" : "font-semibold"}
                      >
                        {brl(conta.diferencaFinal)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && contas.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum movimento encontrado no período.</p>
        )}
      </div>
    </>
  );
}
