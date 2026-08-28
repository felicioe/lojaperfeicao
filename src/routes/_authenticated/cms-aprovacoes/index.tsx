import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarNoticias,
  aprovarNoticia,
  rejeitarNoticia,
  type Noticia,
} from "@/lib/backend/noticias";
import {
  listarPaginasSite,
  aprovarPaginaSite,
  rejeitarPaginaSite,
  type PaginaSite,
} from "@/lib/backend/paginas-site";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RichTextView } from "@/components/app/RichTextView";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Ban } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/cms-aprovacoes/")({
  head: () => ({ meta: [{ title: "Aprovações do Site — Gestão Maçônica" }] }),
  component: CmsAprovacoesPage,
});

const fmtDataHora = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(d.replace(" ", "T")),
  );

type Rejeicao = { tipo: "noticia" | "pagina"; id: string; motivo: string };

function CmsAprovacoesPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [rejeicao, setRejeicao] = useState<Rejeicao | null>(null);

  const podeAprovar = can.isSuperAdmin || can.isAprovadorCms;

  const { data: noticias = [] } = useQuery({
    queryKey: ["noticias_all"],
    queryFn: () => listarNoticias(),
    enabled: podeAprovar,
  });
  const { data: paginas = [] } = useQuery({
    queryKey: ["paginas_site_all"],
    queryFn: () => listarPaginasSite(),
    enabled: podeAprovar,
  });

  const noticiasPendentes = noticias.filter((n) => n.status === "aguardando_aprovacao");
  const paginasPendentes = paginas.filter((p) => p.status === "aguardando_aprovacao");

  const aprovarUmaNoticia = async (n: Noticia) => {
    try {
      await aprovarNoticia({ data: { id: n.id } });
      toast.success("Notícia aprovada e publicada.");
      qc.invalidateQueries({ queryKey: ["noticias_all"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar.");
    }
  };

  const aprovarUmaPagina = async (p: PaginaSite) => {
    try {
      await aprovarPaginaSite({ data: { id: p.id } });
      toast.success("Página aprovada e publicada.");
      qc.invalidateQueries({ queryKey: ["paginas_site_all"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar.");
    }
  };

  const confirmarRejeicao = async () => {
    if (!rejeicao || !rejeicao.motivo.trim()) return;
    try {
      if (rejeicao.tipo === "noticia") {
        await rejeitarNoticia({ data: { id: rejeicao.id, motivo: rejeicao.motivo.trim() } });
        qc.invalidateQueries({ queryKey: ["noticias_all"] });
      } else {
        await rejeitarPaginaSite({ data: { id: rejeicao.id, motivo: rejeicao.motivo.trim() } });
        qc.invalidateQueries({ queryKey: ["paginas_site_all"] });
      }
      toast.success("Rejeitado — volta como rascunho pro autor corrigir.");
      setRejeicao(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao rejeitar.");
    }
  };

  if (!podeAprovar) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas quem tem o papel Aprovador CMS (ou super administrador) acessa esta função.
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Aprovações do Site"
        description="Rascunhos de Notícias e Páginas enviados por editores CMS, aguardando aprovação para publicar."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Notícias ({noticiasPendentes.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {noticiasPendentes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada aguardando aprovação.</p>
          )}
          {noticiasPendentes.map((n) => (
            <div key={n.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{n.titulo}</div>
                  <div className="text-xs text-muted-foreground">
                    {n.coluna_nome ?? "Sem coluna"} · {n.autor_nome} · enviada em{" "}
                    {fmtDataHora(n.atualizado_em)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => aprovarUmaNoticia(n)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejeicao({ tipo: "noticia", id: n.id, motivo: "" })}
                  >
                    <Ban className="mr-1 h-3.5 w-3.5" /> Rejeitar
                  </Button>
                </div>
              </div>
              <RichTextView html={n.conteudo} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Páginas ({paginasPendentes.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {paginasPendentes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada aguardando aprovação.</p>
          )}
          {paginasPendentes.map((p) => (
            <div key={p.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{p.titulo}</div>
                  <div className="text-xs text-muted-foreground">
                    /{p.slug} · {p.autor_nome} · enviada em {fmtDataHora(p.atualizado_em)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => aprovarUmaPagina(p)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejeicao({ tipo: "pagina", id: p.id, motivo: "" })}
                  >
                    <Ban className="mr-1 h-3.5 w-3.5" /> Rejeitar
                  </Button>
                </div>
              </div>
              <RichTextView html={p.conteudo} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!rejeicao} onOpenChange={(v) => !v && setRejeicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar</DialogTitle>
            <DialogDescription>
              Volta como rascunho pro autor corrigir. Diga o que precisa mudar.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            maxLength={500}
            placeholder="Motivo da rejeição"
            value={rejeicao?.motivo ?? ""}
            onChange={(e) => setRejeicao((r) => (r ? { ...r, motivo: e.target.value } : r))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejeicao(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarRejeicao}
              disabled={!rejeicao?.motivo.trim()}
              variant="destructive"
            >
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
