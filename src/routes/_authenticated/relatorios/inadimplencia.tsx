import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { relatorioInadimplenciaDetalhado, gerarCobrancaLote } from "@/lib/backend/relatorios";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowUpDown, Download, FileText, Loader2, Mail, Share2 } from "lucide-react";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { gerarArquivoRelatorio } from "@/lib/backend/relatorio-exportacao";
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
  { chave: "valor_original", titulo: "Valor original", formato: "moeda" },
  { chave: "valor_multa", titulo: "Multa", formato: "moeda" },
  { chave: "valor_juros", titulo: "Juros", formato: "moeda" },
  { chave: "valor_total", titulo: "Total atualizado", formato: "moeda" },
];

type Ordenacao = "dias_atraso" | "valor_total";

function InadimplenciaDetalhada() {
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("dias_atraso");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [idsDaPrevia, setIdsDaPrevia] = useState<string[]>([]);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [irmaoId, setIrmaoId] = useState("todos");
  const [vencimentoDe, setVencimentoDe] = useState("");
  const [vencimentoAte, setVencimentoAte] = useState("");

  const { data: todosItens = [], isError } = useQuery({
    queryKey: ["relatorio_inadimplencia_detalhado"],
    queryFn: () => relatorioInadimplenciaDetalhado(),
  });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const itens = todosItens
    .filter((i) => irmaoId === "todos" || i.irmao_id === irmaoId)
    .filter((i) => !vencimentoDe || i.data_vencimento >= vencimentoDe)
    .filter((i) => !vencimentoAte || i.data_vencimento <= vencimentoAte);

  const itensOrdenadosManual = [...itens].sort((a, b) =>
    ordenacao === "dias_atraso" ? b.dias_atraso - a.dias_atraso : b.valor_total - a.valor_total,
  );

  const ord = useOrdenacao(itensOrdenadosManual, {
    irmao: (i) => i.nome_civil,
    descricao: (i) => i.descricao,
    vencimento: (i) => i.data_vencimento,
    dias_atraso: (i) => i.dias_atraso,
    valor_original: (i) => Number(i.valor_original),
    valor_multa: (i) => Number(i.valor_multa),
    valor_juros: (i) => Number(i.valor_juros),
    valor_total: (i) => Number(i.valor_total),
  });

  const toggleOrdenacao = (campo: Ordenacao) => setOrdenacao(campo);

  const toggleSelecionado = (id: string) =>
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  const itensSelecionados = itensOrdenadosManual.filter((item) => selecionados.includes(item.id));
  const linhasCobranca = itensSelecionados.map((i) => ({
    nome_civil: i.nome_civil,
    descricao: i.descricao,
    vencimento: fmtDate(i.data_vencimento),
    dias_atraso: i.dias_atraso,
    valor_original: Number(i.valor_original),
    valor_multa: Number(i.valor_multa),
    valor_juros: Number(i.valor_juros),
    valor_total: Number(i.valor_total),
  }));

  const gerarPreviaCobranca = async () => {
    if (selecionados.length === 0) return;
    setGerandoPdf(true);
    try {
      const resultado = await gerarArquivoRelatorio({
        data: {
          formato: "pdf",
          titulo: "Cobrança — Faturas em atraso",
          colunas: COLUNAS,
          linhas: linhasCobranca,
        },
      });
      const binario = atob(resultado.base64);
      const bytes = new Uint8Array(binario.length);
      for (let indice = 0; indice < binario.length; indice++) {
        bytes[indice] = binario.charCodeAt(indice);
      }
      const blob = new Blob([bytes], { type: resultado.mimeType });
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfBlob(blob);
      setPdfUrl(URL.createObjectURL(blob));
      setIdsDaPrevia([...selecionados]);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar a prévia da cobrança.");
    } finally {
      setGerandoPdf(false);
    }
  };

  const enviarCobranca = async () => {
    if (idsDaPrevia.length === 0) return;
    setEnviando(true);
    try {
      const resultado = await gerarCobrancaLote({ data: { lancamentoIds: idsDaPrevia } });
      const sucesso = resultado.filter((r) => r.sucesso).length;
      const idsComFalha = resultado.filter((r) => !r.sucesso).map((r) => r.id);
      if (idsComFalha.length === 0) {
        toast.success(`Cobrança enviada para ${sucesso} fatura(s).`);
        setSelecionados([]);
        setPreviewOpen(false);
      } else {
        toast.error(
          `${sucesso} enviada(s), ${idsComFalha.length} falharam. As pendências com falha continuam selecionadas.`,
        );
        setSelecionados(idsComFalha);
        setIdsDaPrevia(idsComFalha);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar cobrança.");
    } finally {
      setEnviando(false);
    }
  };

  const baixarPdf = () => {
    if (!pdfUrl) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = "cobranca-faturas-em-atraso.pdf";
    link.click();
  };

  const compartilharPdf = async () => {
    if (!pdfBlob) return;
    const arquivo = new File([pdfBlob], "cobranca-faturas-em-atraso.pdf", {
      type: "application/pdf",
    });
    if (navigator.share && navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({
          title: "Cobrança — Faturas em atraso",
          text: "Segue a cobrança para conferência.",
          files: [arquivo],
        });
        return;
      } catch (erro) {
        if ((erro as { name?: string }).name === "AbortError") return;
      }
    }
    baixarPdf();
    toast.info("O PDF foi baixado. Anexe-o no aplicativo pelo qual deseja enviar.");
  };

  const abrirPdfEmNovaAba = () => {
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  };

  const totalAtualizado = itens.reduce((s, i) => s + Number(i.valor_total), 0);

  const linhasExportacao = itensOrdenadosManual.map((i) => ({
    nome_civil: i.nome_civil,
    descricao: i.descricao,
    vencimento: fmtDate(i.data_vencimento),
    dias_atraso: i.dias_atraso,
    valor_original: Number(i.valor_original),
    valor_multa: Number(i.valor_multa),
    valor_juros: Number(i.valor_juros),
    valor_total: Number(i.valor_total),
  }));

  const pag = usePaginacao(ord.itensOrdenados);

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
            totais={[{ rotulo: "Total em atraso (atualizado)", valor: totalAtualizado }]}
          />
        }
      />

      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-3">
        <div>
          <Label className="text-xs" htmlFor="inadimplencia-irmao">
            Irmão
          </Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger id="inadimplencia-irmao">
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
          <Label className="text-xs" htmlFor="inadimplencia-vencimento-de">
            Vencimento de
          </Label>
          <Input
            id="inadimplencia-vencimento-de"
            type="date"
            value={vencimentoDe}
            onChange={(e) => setVencimentoDe(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="inadimplencia-vencimento-ate">
            Vencimento até
          </Label>
          <Input
            id="inadimplencia-vencimento-ate"
            type="date"
            value={vencimentoAte}
            onChange={(e) => setVencimentoAte(e.target.value)}
          />
        </div>
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total em atraso (atualizado)</div>
          <div className="text-2xl font-semibold">{brl(totalAtualizado)}</div>
          <div className="text-xs text-muted-foreground">{itens.length} fatura(s)</div>
        </Card>
        <Card className="flex flex-col justify-center gap-2 p-4">
          <div className="flex gap-2">
            <Button
              variant={ordenacao === "dias_atraso" ? "default" : "outline"}
              size="sm"
              onClick={() => toggleOrdenacao("dias_atraso")}
            >
              <ArrowUpDown className="mr-1 h-3.5 w-3.5" /> Dias de atraso
            </Button>
            <Button
              variant={ordenacao === "valor_total" ? "default" : "outline"}
              size="sm"
              onClick={() => toggleOrdenacao("valor_total")}
            >
              <ArrowUpDown className="mr-1 h-3.5 w-3.5" /> Valor
            </Button>
          </div>
          {selecionados.length > 0 && (
            <Button size="sm" onClick={gerarPreviaCobranca} disabled={gerandoPdf}>
              {gerandoPdf ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="mr-1 h-3.5 w-3.5" />
              )}
              Gerar e visualizar cobrança ({selecionados.length})
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
                <TableHeadOrdenavel campo="irmao" ord={ord}>
                  Irmão
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="descricao" ord={ord}>
                  Descrição
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="vencimento" ord={ord}>
                  Vencimento
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="dias_atraso" ord={ord} className="text-right">
                  Dias de atraso
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor_original" ord={ord} className="text-right">
                  Valor original
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor_multa" ord={ord} className="text-right">
                  Multa
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor_juros" ord={ord} className="text-right">
                  Juros
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor_total" ord={ord} className="text-right">
                  Total atualizado
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isError && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-destructive">
                    Erro ao carregar o relatório. Tente novamente.
                  </TableCell>
                </TableRow>
              )}
              {!isError && itens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
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
                      aria-label={`Selecionar cobrança de ${i.nome_civil} referente a ${i.descricao} com vencimento em ${fmtDate(i.data_vencimento)}`}
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-4 sm:px-5">
            <DialogTitle>Prévia da cobrança</DialogTitle>
            <DialogDescription>
              Confira o PDF antes de baixar, compartilhar ou enviar. Cada irmão receberá somente a
              cobrança das próprias faturas.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 bg-muted/30 p-3 sm:p-4">
            {pdfUrl ? (
              <div className="space-y-3">
                <iframe
                  src={pdfUrl}
                  title="Prévia em PDF da cobrança"
                  className="h-[56dvh] min-h-80 w-full rounded-lg border bg-background"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    No celular ou em navegadores com bloqueio de preview, abra o PDF em nova aba.
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={abrirPdfEmNovaAba}>
                    Abrir em nova aba
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex h-[56dvh] min-h-80 items-center justify-center rounded-lg border bg-background text-sm text-muted-foreground">
                A prévia do PDF não está disponível.
              </div>
            )}
          </div>

          <DialogFooter className="border-t bg-background px-4 py-3 sm:px-5">
            <Button variant="outline" onClick={baixarPdf} disabled={!pdfBlob || enviando}>
              <Download aria-hidden="true" /> Baixar PDF
            </Button>
            <Button variant="outline" onClick={compartilharPdf} disabled={!pdfBlob || enviando}>
              <Share2 aria-hidden="true" /> Compartilhar
            </Button>
            <Button onClick={enviarCobranca} disabled={enviando || idsDaPrevia.length === 0}>
              {enviando ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Mail aria-hidden="true" />
              )}
              {enviando ? "Enviando⬦" : "Enviar por e-mail"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
