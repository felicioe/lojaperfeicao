import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

// Componente compartilhado entre os assistentes de IA (Legislação #648,
// Biblioteca de Peças #657) — só a pergunta/resposta muda de tela pra
// tela, a interface é a mesma. Usa flex-col em telas pequenas e
// flex-row a partir de sm:, mesmo padrão responsivo já usado no resto do
// app — funciona tanto no navegador quanto no PWA instalado no celular.
export function AssistenteIACard<
  TResposta extends { resposta: string; fontes: { titulo: string }[] },
>({
  titulo,
  descricao,
  placeholder,
  perguntar,
}: {
  titulo: string;
  descricao: string;
  placeholder: string;
  perguntar: (pergunta: string) => Promise<TResposta>;
}) {
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<TResposta | null>(null);

  const enviar = async () => {
    const texto = pergunta.trim();
    if (!texto) return;
    setEnviando(true);
    setResultado(null);
    try {
      setResultado(await perguntar(texto));
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : "Não foi possível consultar o assistente.",
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Textarea
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              placeholder={placeholder}
              rows={2}
              className="flex-1"
              aria-label={titulo}
            />
            <Button
              onClick={() => void enviar()}
              disabled={enviando || !pergunta.trim()}
              className="sm:self-end"
            >
              {enviando ? "Consultando…" : "Perguntar"}
            </Button>
          </div>
          {resultado && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
              <p className="whitespace-pre-wrap">{resultado.resposta}</p>
              {resultado.fontes.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Fontes: {resultado.fontes.map((fonte) => fonte.titulo).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
