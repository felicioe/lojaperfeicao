import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Printer,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/auth-hooks";
import { gerarArquivoRelatorio, enviarRelatorioPorEmail } from "@/lib/backend/relatorio-exportacao";
import type {
  ColunaRelatorio,
  FormatoRelatorio,
  GrupoRelatorio,
  LinhaRelatorio,
  TotalRelatorio,
} from "@/lib/relatorio-export";

const FORMATO_LABEL: Record<FormatoRelatorio, string> = {
  xlsx: "Excel (.xlsx)",
  pdf: "PDF (.pdf)",
  csv: "CSV (.csv)",
  txt: "Texto (.txt)",
};

function base64ParaBlob(base64: string, mimeType: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportarRelatorio({
  titulo,
  colunas,
  linhas,
  totais,
  permitirImpressao = false,
  permitirWhatsapp = false,
  resumoCompartilhamento,
  grupos,
  resultado,
  subtitulo,
}: {
  titulo: string;
  colunas: ColunaRelatorio[];
  linhas: LinhaRelatorio[];
  totais?: TotalRelatorio[];
  permitirImpressao?: boolean;
  permitirWhatsapp?: boolean;
  resumoCompartilhamento?: string;
  // Modo agrupado (issue #450 — DRE): PDF/XLSX saem com seções e subtotal
  // em vez de tabela plana. `colunas`/`linhas` continuam obrigatórios —
  // servem pro CSV/TXT e pro envio por e-mail, que não têm modo agrupado.
  grupos?: GrupoRelatorio[];
  resultado?: TotalRelatorio | null;
  subtitulo?: string | null;
}) {
  const { user } = useSession();
  const [exportando, setExportando] = useState<FormatoRelatorio | null>(null);
  const [openEmail, setOpenEmail] = useState(false);
  const [destinatarios, setDestinatarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [formatoEmail, setFormatoEmail] = useState<"xlsx" | "pdf">("xlsx");

  // Prévia + compartilhamento do PDF (achado: baixar direto era a única
  // opção — no celular, o download por blob URL costuma falhar em
  // silêncio ou abrir num app que não mostra nada, sem forma de mandar o
  // arquivo direto pro WhatsApp/e-mail do sistema. Mesmo padrão já usado
  // em relatorios/inadimplencia.tsx para a cobrança em lote, generalizado
  // aqui pra todos os relatórios que usam este componente.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [nomeArquivoPdf, setNomeArquivoPdf] = useState("relatorio.pdf");

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  const exportar = async (formato: FormatoRelatorio) => {
    setExportando(formato);
    try {
      const arquivo = await gerarArquivoRelatorio({
        data: { formato, titulo, colunas, linhas, totais, grupos, resultado, subtitulo },
      });
      const blob = base64ParaBlob(arquivo.base64, arquivo.mimeType);
      if (formato === "pdf") {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfBlob(blob);
        setPdfUrl(URL.createObjectURL(blob));
        setNomeArquivoPdf(arquivo.nomeArquivo);
        setPreviewOpen(true);
      } else {
        baixarBlob(blob, arquivo.nomeArquivo);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao exportar relatório.");
    } finally {
      setExportando(null);
    }
  };

  const baixarPdfDaPreVia = () => {
    if (!pdfUrl) return;
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = nomeArquivoPdf;
    link.click();
  };

  const compartilharPdfDaPreVia = async () => {
    if (!pdfBlob) return;
    const arquivo = new File([pdfBlob], nomeArquivoPdf, { type: "application/pdf" });
    if (navigator.share && navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ title: titulo, files: [arquivo] });
        return;
      } catch (erro) {
        if ((erro as { name?: string }).name === "AbortError") return;
      }
    }
    baixarPdfDaPreVia();
    toast.info("O PDF foi baixado. Anexe-o no aplicativo pelo qual deseja enviar.");
  };

  const abrirPdfEmNovaAba = () => {
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  };

  const abrirEmail = () => {
    setDestinatarios(user?.email ?? "");
    setOpenEmail(true);
  };

  const enviar = async () => {
    const lista = destinatarios
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (lista.length === 0) return toast.error("Informe ao menos um e-mail de destino.");
    setEnviando(true);
    try {
      const envio = await enviarRelatorioPorEmail({
        data: {
          formato: formatoEmail,
          titulo,
          colunas,
          linhas,
          totais,
          grupos,
          resultado,
          subtitulo,
          destinatarios: lista,
        },
      });
      const falhas = envio.filter((r) => !r.sucesso);
      if (falhas.length === 0) {
        toast.success("Relatório enviado por e-mail.");
        setOpenEmail(false);
      } else {
        // Mostrar o motivo devolvido pelo SMTP, e não só "falhou": é o que
        // diferencia "a senha do e-mail está errada" de "o anexo é grande
        // demais" sem precisar abrir o log do servidor.
        const motivo = falhas.find((f) => f.erro)?.erro;
        toast.error(
          `Falha ao enviar para: ${falhas.map((f) => f.destinatario).join(", ")}` +
            (motivo ? ` — ${motivo}` : ""),
          { duration: 12000 },
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar relatório.");
    } finally {
      setEnviando(false);
    }
  };

  const imprimir = (salvarPdf = false) => {
    if (salvarPdf) toast.info('Na janela de impressão, escolha "Salvar como PDF".');
    window.print();
  };

  const compartilharWhatsapp = async () => {
    const texto = `${titulo}\n${resumoCompartilhamento ?? `${linhas.length} movimento(s)`}\n${window.location.href}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url: window.location.href });
        return;
      } catch (erro) {
        if ((erro as { name?: string }).name === "AbortError") return;
      }
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={exportando !== null || linhas.length === 0}>
            {exportando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            Exportar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(Object.keys(FORMATO_LABEL) as FormatoRelatorio[]).map((formato) => (
            <DropdownMenuItem key={formato} onClick={() => exportar(formato)}>
              {formato === "xlsx" ? (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              {FORMATO_LABEL[formato]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openEmail} onOpenChange={setOpenEmail}>
        <DialogTrigger asChild>
          <Button variant="outline" onClick={abrirEmail} disabled={linhas.length === 0}>
            <Mail className="h-4 w-4 mr-1" /> Enviar por e-mail
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar relatório por e-mail</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="exportar-destinatario-s">Destinatário(s)</Label>
              <Input
                id="exportar-destinatario-s"
                value={destinatarios}
                onChange={(e) => setDestinatarios(e.target.value)}
                placeholder="email@exemplo.com, outro@exemplo.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separe vários e-mails por vírgula.
              </p>
            </div>
            <div>
              <Label htmlFor="exportar-formato-email">Formato do anexo</Label>
              <Select
                value={formatoEmail}
                onValueChange={(value) => setFormatoEmail(value as "xlsx" | "pdf")}
              >
                <SelectTrigger id="exportar-formato-email" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={enviando}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={enviar} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {permitirImpressao && (
        <>
          <Button variant="outline" onClick={() => imprimir(false)} disabled={linhas.length === 0}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={() => imprimir(true)} disabled={linhas.length === 0}>
            <FileDown className="mr-1 h-4 w-4" /> PDF
          </Button>
        </>
      )}

      {permitirWhatsapp && (
        <Button variant="outline" onClick={compartilharWhatsapp} disabled={linhas.length === 0}>
          <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
        </Button>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-4 sm:px-5">
            <DialogTitle>Prévia do relatório</DialogTitle>
            <DialogDescription>
              Confira o PDF antes de baixar, compartilhar ou enviar.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 bg-muted/30 p-3 sm:p-4">
            {pdfUrl ? (
              <div className="space-y-3">
                <iframe
                  src={pdfUrl}
                  title="Prévia em PDF do relatório"
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
            <Button variant="outline" onClick={baixarPdfDaPreVia} disabled={!pdfBlob}>
              <Download aria-hidden="true" /> Baixar PDF
            </Button>
            <Button variant="outline" onClick={compartilharPdfDaPreVia} disabled={!pdfBlob}>
              <Share2 aria-hidden="true" /> Compartilhar
            </Button>
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setFormatoEmail("pdf");
                abrirEmail();
              }}
            >
              <Mail aria-hidden="true" /> Enviar por e-mail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
