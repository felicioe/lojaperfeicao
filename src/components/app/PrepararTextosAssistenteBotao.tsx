import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { prepararTextosAssistentesIA } from "@/lib/backend/extracao-texto-ia";

// Processa em lotes pequenos (ver LIMITE_POR_FONTE_POR_CHAMADA em
// extracao-texto-ia.ts) — cada chamada individual nunca chega perto do
// timeout do proxy da Hostinger, mesmo com PDFs grandes; o loop aqui só
// encadeia várias chamadas curtas em sequência até não sobrar nada.
const MAXIMO_LOTES = 40;

export function PrepararTextosAssistenteBotao() {
  const [processando, setProcessando] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const preparar = async () => {
    setProcessando(true);
    setStatus("Iniciando…");
    let totalDocumentos = 0;
    let totalPecas = 0;
    try {
      for (let lote = 0; lote < MAXIMO_LOTES; lote++) {
        const resultado = await prepararTextosAssistentesIA();
        totalDocumentos += resultado.documentosProcessados;
        totalPecas += resultado.pecasProcessadas;
        const restantes = resultado.documentosRestantes + resultado.pecasRestantes;
        setStatus(
          `${totalDocumentos} documento(s) e ${totalPecas} peça(s) processados` +
            (restantes > 0 ? ` — faltam ${restantes}…` : "."),
        );
        const nadaProcessadoNesteLote =
          resultado.documentosProcessados === 0 && resultado.pecasProcessadas === 0;
        if (restantes === 0 || nadaProcessadoNesteLote) break;
      }
      toast.success("Preparação concluída.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao preparar os textos.");
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="mt-3 border-t pt-3">
      <Button variant="outline" size="sm" onClick={() => void preparar()} disabled={processando}>
        {processando ? "Preparando…" : "Preparar documentos para o assistente"}
      </Button>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Extrai o texto dos PDFs ainda não processados (roda automaticamente também via cron, mais
        devagar). Só admin/secretário vê este botão.
      </p>
      {status && (
        <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}
