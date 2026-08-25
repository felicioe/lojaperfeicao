import { useState } from "react";
import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { obterChamadoPlataforma, responderChamadoPlataforma } from "@/lib/backend/saas-chamados";
import type { Prioridade, StatusChamado } from "@/lib/backend/chamados";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, LifeBuoy, Paperclip, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-saas/chamados/$id")({
  head: () => ({ meta: [{ title: "Chamado — Plataforma" }] }),
  component: ChamadoPlataformaDetalhe,
});

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const STATUS_LABEL: Record<StatusChamado, string> = {
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

function ChamadoPlataformaDetalhe() {
  const { id } = useParams({ from: "/_authenticated/admin-saas/chamados/$id" });
  const qc = useQueryClient();
  const [mensagem, setMensagem] = useState("");
  const [novoStatus, setNovoStatus] = useState<StatusChamado | "manter">("manter");
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const [enviando, setEnviando] = useState(false);

  const {
    data: chamado,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["saas-chamado", id],
    queryFn: () => obterChamadoPlataforma({ data: { chamadoId: id } }),
  });

  const adicionarArquivos = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const dataUrl = await arquivoParaDataUrl(file);
      setAnexos((prev) => [...prev, { nomeArquivo: file.name, dataUrl }]);
    }
  };

  const enviar = async () => {
    if (!mensagem.trim() && novoStatus === "manter") {
      return toast.error("Escreva uma mensagem ou mude o status.");
    }
    setEnviando(true);
    try {
      await responderChamadoPlataforma({
        data: {
          chamadoId: id,
          mensagem: mensagem.trim() || undefined,
          anexos,
          novoStatus: novoStatus === "manter" ? undefined : novoStatus,
        },
      });
      toast.success("Atualizado.");
      setMensagem("");
      setAnexos([]);
      setNovoStatus("manter");
      qc.invalidateQueries({ queryKey: ["saas-chamado", id] });
      qc.invalidateQueries({ queryKey: ["saas-chamados"] });
      qc.invalidateQueries({ queryKey: ["saas-auditoria"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar chamado.");
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
          <Link to="/admin-saas/chamados">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Chamados
          </Link>
        </Button>
        <PageHeader
          title={chamado.assunto}
          description={`${chamado.loja_nome} · ${chamado.aberto_por_email} · ${PRIORIDADE_LABEL[chamado.prioridade]} · aberto em ${dataHora(chamado.criado_em)}`}
        />
        <Badge>{STATUS_LABEL[chamado.status]}</Badge>
      </div>

      <div className="space-y-3">
        {chamado.mensagens.map((m) => (
          <Card key={m.id} className={m.eh_super_admin ? "border-primary/40" : undefined}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.eh_super_admin ? "Você (suporte)" : chamado.aberto_por_email}
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

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label htmlFor="chamado-status">Status</Label>
            <Select
              value={novoStatus}
              onValueChange={(v) => setNovoStatus(v as StatusChamado | "manter")}
            >
              <SelectTrigger id="chamado-status" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manter">Manter — {STATUS_LABEL[chamado.status]}</SelectItem>
                {(Object.keys(STATUS_LABEL) as StatusChamado[])
                  .filter((s) => s !== chamado.status)
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Responda ao chamado (opcional se só mudar o status)…"
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
            <Button onClick={enviar} disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
