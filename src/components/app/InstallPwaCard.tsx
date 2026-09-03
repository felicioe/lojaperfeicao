import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const CHAVE_DISPENSA = "sglfm:pwa-install-dismissed";

function foiDispensado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DISPENSA) === "1";
  } catch {
    return false;
  }
}

export function InstallPwaCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [mostrarAjudaIos, setMostrarAjudaIos] = useState(false);
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone || foiDispensado()) return;

    const dispositivoIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(dispositivoIos);
    setOculto(!dispositivoIos);

    const aoSolicitarInstalacao = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setOculto(false);
    };
    const aoInstalar = () => setOculto(true);

    window.addEventListener("beforeinstallprompt", aoSolicitarInstalacao);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoSolicitarInstalacao);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (oculto) return null;

  async function instalar() {
    if (!prompt) {
      setMostrarAjudaIos(true);
      return;
    }
    await prompt.prompt();
    const escolha = await prompt.userChoice;
    if (escolha.outcome === "accepted") setOculto(true);
  }

  function dispensar() {
    try {
      window.localStorage.setItem(CHAVE_DISPENSA, "1");
    } catch {
      // Navegadores em modo privado podem bloquear armazenamento local.
    }
    setOculto(true);
  }

  return (
    <aside
      className="relative rounded-xl border bg-card p-4 text-card-foreground shadow-sm"
      aria-label="Instalar o aplicativo SGLFM"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 min-h-11 min-w-11"
        onClick={dispensar}
        aria-label="Não mostrar novamente"
      >
        <X className="h-4 w-4" />
      </Button>
      <div className="flex items-start gap-3 pr-10">
        <img src="/icons/sglfm-app-v2-192.png" alt="" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0">
          <h2 className="font-semibold">Instale o SGLFM neste aparelho</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra o sistema pela tela inicial, como qualquer outro aplicativo.
          </p>
        </div>
      </div>
      <Button type="button" className="mt-3 min-h-11 w-full" onClick={instalar}>
        {ios ? <Share2 className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
        {ios ? "Ver como instalar" : "Instalar aplicativo"}
      </Button>
      {mostrarAjudaIos && (
        <p className="mt-3 text-sm" role="status">
          No iPhone ou iPad, toque em <strong>Compartilhar</strong> e depois em
          <strong> Adicionar à Tela de Início</strong>.
        </p>
      )}
    </aside>
  );
}
