import { useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { obterMeuChamado, responderMeuChamado, type Prioridade } from "@/lib/backend/chamados";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ArrowLeft, LifeBuoy, Paperclip, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/chamados/$id")({
  head: () => ({ meta: [{ title: "Chamado — Gestão Maçônica" }] }),
  component: MeuChamadoDetalhe,
});

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

type AnexoPendente = { nomeArquivo: string; dataUrl: string };

function arquivoParaDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MeuChamadoDetalhe() {
  const { id } = useParams({ from: "/_authenticated/painel/chamados/$id" });
  const qc = useQueryClient();
  const [mensagem, setMensagem] = useState("");
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const [enviando, setEnviando] = useState(false);

  const {
    data: chamado,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["meu-chamado", id],
    queryFn: () => obterMeuChamado({ data: { chamadoId: id } }),
  });

  const adicionarArquivos = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const dataUrl = await arquivoParaDataUrl(file);
      setAnexos((prev) => [...prev, { nomeArquivo: file.name, dataUrl }]);
    }
  };

  const responder = async () => {
    if (!mensagem.trim()) return toast.error("Escreva uma mensagem.");
    setEnviando(true);
    try {
      await responderMeuChamado({ data: { chamadoId: id, mensagem, anexos } });
      toast.success("Mensagem enviada.");
      setMensagem("");
      setAnexos([]);
      qc.invalidateQueries({ queryKey: ["meu-chamado", id] });
      qc.invalidateQueries({ queryKey: ["meus-chamados"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem.");
    } finally {
      setEnviando(false);
    }
  };

  if (isLoading) return null;

  if (isError || !chamado) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={LifeBuoy}
            title="Não foi possível carregar o chamado"
            description="Falha ao buscar os dados. Tente novamente."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link to="/painel/chamados">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Meus chamados
          </Link>
        </Button>
        <PageHeader
          title={chamado.assunto}
          description={`${PRIORIDADE_LABEL[chamado.prioridade]} · aberto em ${dataHora(chamado.criado_em)}`}
        />
        <Badge>{STATUS_LABEL[chamado.status]}</Badge>
      </div>

      <div className="space-y-3">
        {chamado.mensagens.map((m) => (
          <Card key={m.id} className={m.eh_super_admin ? "border-primary/40" : undefined}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.eh_super_admin ? "Suporte da plataforma" : "Você"}
                </span>
                <span>{dataHora(m.criado_em)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{m.mensagem}</p>
              {m.anexos.length > 0 && (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {m.anexos.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground"
                    >
                      <Paperclip className="h-3 w-3" /> {a.nome_arquivo}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {chamado.status !== "fechado" && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Escreva uma mensagem…"
              rows={4}
              maxLength={5000}
            />
            <Input
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => adicionarArquivos(e.target.files)}
            />
            {anexos.length > 0 && (
              <ul className="space-y-1">
                {anexos.map((a, i) => (
                  <li
                    key={`${a.nomeArquivo}-${i}`}
                    className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Paperclip className="h-3 w-3 shrink-0" /> {a.nomeArquivo}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover ${a.nomeArquivo}`}
                      onClick={() => setAnexos((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button onClick={responder} disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
