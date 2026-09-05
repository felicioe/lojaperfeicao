import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/lib/use-media-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";

// window.print() não funciona em vários navegadores embutidos de celular
// (o WebView que o WhatsApp/Instagram abrem ao tocar num link compartilhado,
// por exemplo — e faturas são compartilhadas por WhatsApp na tela de
// Faturas). Não dá pra detectar isso de antemão nem forçar o print a
// funcionar lá dentro; a saída real é abrir o link no navegador de verdade.
// O botão principal continua chamando print() (funciona normalmente em
// navegador comum, desktop ou mobile); a dica abaixo só aparece em telas
// mobile e usa o share nativo (com "abrir no navegador"/"copiar link" como
// opções do próprio sistema) em vez de tentar adivinhar o navegador.

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

export function BotaoImprimir({ label = "Imprimir / salvar PDF" }: { label?: string }) {
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
