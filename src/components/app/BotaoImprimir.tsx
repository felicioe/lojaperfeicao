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
export function BotaoImprimir({ label = "Imprimir / salvar PDF" }: { label?: string }) {
  const isDesktop = useIsDesktop();

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
