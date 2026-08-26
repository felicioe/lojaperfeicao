import { useState } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/auth-hooks";
import { gerarArquivoRelatorio, enviarRelatorioPorEmail } from "@/lib/backend/relatorio-exportacao";
import type {
  ColunaRelatorio,
  FormatoRelatorio,
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
}: {
  titulo: string;
  colunas: ColunaRelatorio[];
  linhas: LinhaRelatorio[];
  totais?: TotalRelatorio[];
  permitirImpressao?: boolean;
  permitirWhatsapp?: boolean;
  resumoCompartilhamento?: string;
}) {
  const { user } = useSession();
  const [exportando, setExportando] = useState<FormatoRelatorio | null>(null);
  const [openEmail, setOpenEmail] = useState(false);
  const [destinatarios, setDestinatarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [formatoEmail, setFormatoEmail] = useState<"xlsx" | "pdf">("xlsx");

  const exportar = async (formato: FormatoRelatorio) => {
    setExportando(formato);
    try {
      const resultado = await gerarArquivoRelatorio({
        data: { formato, titulo, colunas, linhas, totais },
      });
      baixarBlob(base64ParaBlob(resultado.base64, resultado.mimeType), resultado.nomeArquivo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao exportar relatório.");
    } finally {
      setExportando(null);
    }
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
      const resultado = await enviarRelatorioPorEmail({
        data: { formato: formatoEmail, titulo, colunas, linhas, totais, destinatarios: lista },
      });
      const falhas = resultado.filter((r) => !r.sucesso);
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
              <select
                id="exportar-formato-email"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formatoEmail}
                onChange={(e) => setFormatoEmail(e.target.value as "xlsx" | "pdf")}
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="pdf">PDF (.pdf)</option>
              </select>
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
    </div>
  );
}
