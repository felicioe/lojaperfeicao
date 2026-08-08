import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { relatorioInadimplenciaDetalhado, gerarCobrancaLote } from "@/lib/backend/relatorios";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";
import { ArrowUpDown, Loader2, Mail } from "lucide-react";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/relatorios/inadimplencia")({
  head: () => ({ meta: [{ title: "Inadimplência Detalhada — Gestão Maçônica" }] }),
  component: InadimplenciaDetalhada,
});

const COLUNAS: ColunaRelatorio[] = [
  { chave: "nome_civil", titulo: "Irmão" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "vencimento", titulo: "Vencimento" },
  { chave: "dias_atraso", titulo: "Dias de atraso" },
  { chave: "valor_original", titulo: "Valor original" },
  { chave: "valor_multa", titulo: "Multa" },
  { chave: "valor_juros", titulo: "Juros" },
  { chave: "valor_total", titulo: "Total atualizado" },
];

type Ordenacao = "dias_atraso" | "valor_total";

function InadimplenciaDetalhada() {
  const qc = useQueryClient();
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("dias_atraso");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const { data: itens = [] } = useQuery({
    queryKey: ["relatorio_inadimplencia_detalhado"],
    queryFn: () => relatorioInadimplenciaDetalhado(),
  });

  const itensOrdenados = [...itens].sort((a, b) =>
    ordenacao === "dias_atraso" ? b.dias_atraso - a.dias_atraso : b.valor_total - a.valor_total,
  );

  const toggleOrdenacao = (campo: Ordenacao) => setOrdenacao(campo);

  const toggleSelecionado = (id: string) =>
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const gerarCobranca = async () => {
    if (selecionados.length === 0) return;
    setEnviando(true);
    try {
      const resultado = await gerarCobrancaLote({ data: { lancamentoIds: selecionados } });
      const sucesso = resultado.filter((r) => r.sucesso).length;
      const falhas = resultado.length - sucesso;
      if (falhas === 0) {
        toast.success(`Cobrança enviada para ${sucesso} fatura(s).`);
      } else {
        toast.error(
          `${sucesso} enviada(s), ${falhas} falharam (irmão sem e-mail cadastrado ou erro de envio).`,
        );
      }
      setSelecionados([]);
      qc.invalidateQueries({ queryKey: ["relatorio_inadimplencia_detalhado"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar cobrança.");
    } finally {
      setEnviando(false);
    }
  };

  const totalAtualizado = itens.reduce((s, i) => s + Number(i.valor_total), 0);

  const linhasExportacao = itensOrdenados.map((i) => ({
    nome_civil: i.nome_civil,
    descricao: i.descricao,
    vencimento: fmtDate(i.data_vencimento),
    dias_atraso: i.dias_atraso,
    valor_original: Number(i.valor_original),
    valor_multa: Number(i.valor_multa),
    valor_juros: Number(i.valor_juros),
    valor_total: Number(i.valor_total),
  }));

  const pag = usePaginacao(itensOrdenados);

  return (
    <>
      <PageHeader
        title="Relatório de Inadimplência Detalhado"
        description="Irmãos com faturas vencidas em aberto, com multa/juros calculados até hoje."
        actions={
          <ExportarRelatorio
            titulo="Inadimplência Detalhada"
            colunas={COLUNAS}
            linhas={linhasExportacao}
          />
        }
      />

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total em atraso (atualizado)</div>
          <div className="text-2xl font-semibold">{brl(totalAtualizado)}</div>
          <div className="text-xs text-muted-foreground">{itens.length} fatura(s)</div>
        </Card>
        <Card className="p-4 flex flex-col justify-center gap-2">
          <div className="flex gap-2">
            <Button
              variant={ordenacao === "dias_atraso" ? "default" : "outline"}
              size="sm"
              onClick={() => toggleOrdenacao("dias_atraso")}
            >
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Dias de atraso
            </Button>
            <Button
              variant={ordenacao === "valor_total" ? "default" : "outline"}
              size="sm"
              onClick={() => toggleOrdenacao("valor_total")}
            >
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Valor
            </Button>
          </div>
          {selecionados.length > 0 && (
            <Button size="sm" onClick={gerarCobranca} disabled={enviando}>
              {enviando ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5 mr-1" />
              )}
              Gerar cobrança ({selecionados.length})
            </Button>
          )}
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Irmão</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Dias de atraso</TableHead>
                <TableHead className="text-right">Valor original</TableHead>
                <TableHead className="text-right">Multa</TableHead>
                <TableHead className="text-right">Juros</TableHead>
                <TableHead className="text-right">Total atualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                    Nenhuma fatura em atraso.
                  </TableCell>
                </TableRow>
              )}
              {pag.itensPagina.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Checkbox
                      checked={selecionados.includes(i.id)}
                      onCheckedChange={() => toggleSelecionado(i.id)}
                    />
                  </TableCell>
                  <TableCell>
                    {i.nome_civil}
                    {i.nome_simbolico ? ` (${i.nome_simbolico})` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{i.descricao}</TableCell>
                  <TableCell>{fmtDate(i.data_vencimento)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive">{i.dias_atraso}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{brl(i.valor_original)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {brl(i.valor_multa)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {brl(i.valor_juros)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{brl(i.valor_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
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
  );
}
