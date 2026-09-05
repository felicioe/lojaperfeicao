import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/lib/use-media-query";
import { baixarFaturaPdf } from "@/lib/backend/tesouraria-lancamentos";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

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

// PWA instalado (modo standalone, sem barra de navegador) é um caso à parte
// de WebView: no iOS, window.print() simplesmente não existe nesse modo —
// não é "não funciona direito", é ausente mesmo, sem diálogo de impressão
// nenhum pra abrir. Detecta-se só depois de montar (nunca no SSR, que não
// tem window nem navigator.standalone) pra não repetir o mesmo erro de
// hidratação corrigido em use-media-query.ts.
function useIsStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const iosStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(iosStandalone || displayModeStandalone);
  }, []);

  return isStandalone;
}

// Uma fatura tem PDF de verdade gerado no servidor (fatura-pdf.ts) — baixa
// com um toque, mesmo comportamento em qualquer navegador, celular ou PWA
// instalado, sem menu de compartilhar nem depender do diálogo de impressão
// do sistema. Certificado de quitação e impressão de faturas em lote (as
// outras duas telas que usam este componente) ainda não têm PDF próprio —
// continuam no window.print() de antes enquanto isso não existir.
function BotaoBaixarFaturaPdf({ faturaId }: { faturaId: string }) {
  const [baixando, setBaixando] = useState(false);

  const baixar = async () => {
    setBaixando(true);
    try {
      const arquivo = await baixarFaturaPdf({ data: { id: faturaId } });
      baixarBlob(base64ParaBlob(arquivo.base64, "application/pdf"), arquivo.nomeArquivo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar o PDF da fatura.");
    } finally {
      setBaixando(false);
    }
  };

  return (
    <Button onClick={baixar} disabled={baixando}>
      {baixando ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-1.5 h-4 w-4" />
      )}
      Baixar PDF da fatura
    </Button>
  );
}

export function BotaoImprimir({
  label = "Imprimir / salvar PDF",
  faturaId,
}: {
  label?: string;
  faturaId?: string;
}) {
  const isDesktop = useIsDesktop();
  const isStandalone = useIsStandalone();

  const compartilharLink = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado — cole no navegador para imprimir.");
      }
    } catch {
      // Usuário cancelou o compartilhamento — nada a fazer.
    }
  };

  if (faturaId) return <BotaoBaixarFaturaPdf faturaId={faturaId} />;

  // No PWA instalado, window.print() não é uma opção confiável (ausente no
  // iOS standalone) — o botão principal já sai direto pro fluxo de abrir no
  // navegador, em vez de chamar print() e depender do usuário notar um link
  // secundário depois que "nada aconteceu".
  if (isStandalone) {
    return (
      <Button onClick={compartilharLink}>
        <Printer className="mr-1.5 h-4 w-4" /> Abrir no navegador para imprimir/salvar PDF
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={() => window.print()}>
        <Printer className="mr-1.5 h-4 w-4" /> {label}
      </Button>
      {!isDesktop && (
        <button
          type="button"
          onClick={compartilharLink}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          Botão não abriu a impressão? Toque aqui para abrir no navegador
        </button>
      )}
    </div>
  );
}
