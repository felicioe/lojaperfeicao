import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  listarPaginasSite,
  salvarPaginaSite,
  definirStatusPaginaSite,
  enviarPaginaSiteParaAprovacao,
  aprovarPaginaSite,
  rejeitarPaginaSite,
  excluirPaginaSite,
  type PaginaSite,
} from "@/lib/backend/paginas-site";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LazyRichTextEditor } from "@/components/app/LazyRichTextEditor";
import { RichTextView } from "@/components/app/RichTextView";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Fragment } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, X, Send, Check, Ban } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/paginas-site/")({
  head: () => ({ meta: [{ title: "Páginas do Site — Gestão Maçônica" }] }),
  component: PaginasSitePage,
});

const STATUS_LABEL: Record<PaginaSite["status"], string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  publicado: "Publicado",
};

const STATUS_VARIANT: Record<PaginaSite["status"], "default" | "secondary" | "outline"> = {
  rascunho: "secondary",
  aguardando_aprovacao: "outline",
  publicado: "default",
};

const fmtDataHora = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(d.replace(" ", "T")),
  );

function gerarSlug(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas combinantes)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const FORM_VAZIO = {
  id: null as string | null,
  titulo: "",
  slug: "",
  conteudo: "",
};

function PaginasSitePage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [rejeicao, setRejeicao] = useState<{ id: string; motivo: string } | null>(null);
  const formularioRef = useRef<HTMLDivElement>(null);

  const { data: paginas = [] } = useQuery({
    queryKey: ["paginas_site_all"],
    queryFn: () => listarPaginasSite(),
    enabled: can.canAcessarCms,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["paginas_site_all"] });

  const salvar = async () => {
    if (!form.titulo.trim() || !form.slug.trim() || !form.conteudo.trim()) return;
    try {
      await salvarPaginaSite({
        data: {
          id: form.id,
          titulo: form.titulo.trim(),
          slug: form.slug.trim(),
          conteudo: form.conteudo,
        },
      });
      toast.success(form.id ? "Página atualizada." : "Página criada.");
      setForm(FORM_VAZIO);
      setSlugEditadoManualmente(false);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (p: PaginaSite) => {
    setForm({ id: p.id, titulo: p.titulo, slug: p.slug, conteudo: p.conteudo });
    setSlugEditadoManualmente(true);
    requestAnimationFrame(() => {
      formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const alternarStatus = async (p: PaginaSite) => {
    try {
      await definirStatusPaginaSite({
        data: { id: p.id, status: p.status === "publicado" ? "rascunho" : "publicado" },
      });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar status.");
    }
  };

  const enviarParaAprovacao = async (id: string) => {
    try {
      await enviarPaginaSiteParaAprovacao({ data: { id } });
      toast.success("Página enviada para aprovação.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar para aprovação.");
    }
  };

  const aprovar = async (id: string) => {
    try {
      await aprovarPaginaSite({ data: { id } });
      toast.success("Página aprovada e publicada.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar.");
    }
  };

  const confirmarRejeicao = async () => {
    if (!rejeicao || !rejeicao.motivo.trim()) return;
    try {
      await rejeitarPaginaSite({ data: { id: rejeicao.id, motivo: rejeicao.motivo.trim() } });
      toast.success("Página rejeitada — volta como rascunho pro autor corrigir.");
      setRejeicao(null);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao rejeitar.");
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirPaginaSite({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const ord = useOrdenacao(paginas, {
    titulo: (p) => p.titulo,
    status: (p) => p.status,
    criado_em: (p) => p.criado_em,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  if (!can.canAcessarCms) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Você não tem acesso ao CMS do site institucional.
      </Card>
    );
  }

  // editor_cms nunca cria página nova (estrutura do site é exclusiva de
  // super_admin — issue #391) — só edita o conteúdo de uma já atribuída a
  // ele, então o formulário só aparece depois de clicar em "editar".
  const mostrarFormulario = can.isSuperAdmin || (can.isEditorCms && !!form.id);

  return (
    <>
      <PageHeader
        title="Páginas do Site"
        description="Páginas de conteúdo do site institucional (associacaoadonhiramita.org), tipo Quem Somos e Contato."
      />

      {mostrarFormulario && (
        <Card ref={formularioRef} className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">{form.id ? "Editar página" : "Nova página"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label htmlFor="pagina-titulo">Título</Label>
              <Input
                id="pagina-titulo"
                maxLength={200}
                value={form.titulo}
                onChange={(e) => {
                  const titulo = e.target.value;
                  setForm((f) => ({
                    ...f,
                    titulo,
                    slug: slugEditadoManualmente ? f.slug : gerarSlug(titulo),
                  }));
                }}
              />
            </div>
            <div>
              <Label htmlFor="pagina-slug">
                Endereço no site (associacaoadonhiramita.org/paginas/
                <strong>{form.slug || "..."}</strong>)
              </Label>
              <Input
                id="pagina-slug"
                maxLength={200}
                value={form.slug}
                disabled={!can.isSuperAdmin}
                onChange={(e) => {
                  setSlugEditadoManualmente(true);
                  setForm((f) => ({ ...f, slug: gerarSlug(e.target.value) }));
                }}
              />
            </div>
            <div>
              <Label id="pagina-conteudo-label">Conteúdo</Label>
              <LazyRichTextEditor
                ariaLabelledBy="pagina-conteudo-label"
                value={form.conteudo}
                onChange={(html) => setForm({ ...form, conteudo: html })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={salvar}
                disabled={!form.titulo.trim() || !form.slug.trim() || !form.conteudo.trim()}
              >
                {form.id ? "Salvar alterações" : "Criar página"}
              </Button>
              {form.id && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setForm(FORM_VAZIO);
                    setSlugEditadoManualmente(false);
                  }}
                >
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {can.isSuperAdmin
                ? 'Páginas novas começam como rascunho — use "Publicar" na lista abaixo para que apareçam no site.'
                : 'Ao terminar, use "Enviar para aprovação" na lista abaixo.'}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHeadOrdenavel campo="titulo" ord={ord}>
                Título
              </TableHeadOrdenavel>
              <TableHead>Endereço</TableHead>
              <TableHeadOrdenavel campo="status" ord={ord}>
                Status
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="criado_em" ord={ord}>
                Criada em
              </TableHeadOrdenavel>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensPagina.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhuma página cadastrada.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((p) => {
              const podeEditarEsta =
                can.isSuperAdmin || (can.isEditorCms && p.status === "rascunho");
              const podeEnviar = can.isEditorCms && !can.isSuperAdmin && p.status === "rascunho";
              const podeAprovarOuRejeitar =
                (can.isSuperAdmin || can.isAprovadorCms) && p.status === "aguardando_aprovacao";
              return (
                <Fragment key={p.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                      >
                        {expandido === p.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{p.titulo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">/{p.slug}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      {p.motivo_rejeicao && (
                        <p className="mt-1 max-w-[220px] text-xs text-destructive">
                          Rejeitada: {p.motivo_rejeicao}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDataHora(p.criado_em)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {can.isSuperAdmin && (
                        <Button variant="outline" size="sm" onClick={() => alternarStatus(p)}>
                          {p.status === "publicado" ? "Despublicar" : "Publicar"}
                        </Button>
                      )}
                      {podeEnviar && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => enviarParaAprovacao(p.id)}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" /> Enviar p/ aprovação
                        </Button>
                      )}
                      {podeAprovarOuRejeitar && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => aprovar(p.id)}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRejeicao({ id: p.id, motivo: "" })}
                          >
                            <Ban className="mr-1 h-3.5 w-3.5" /> Rejeitar
                          </Button>
                        </>
                      )}
                      {podeEditarEsta && (
                        <Button variant="ghost" size="sm" onClick={() => editar(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {can.isSuperAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir "{p.titulo}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A página será excluída permanentemente, inclusive do site caso
                                esteja publicada. Essa ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir(p.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandido === p.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <RichTextView html={p.conteudo} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        <TabelaPaginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalItens={totalItens}
          tamanhoPagina={tamanhoPagina}
          setPagina={setPagina}
        />
      </Card>

      <Dialog open={!!rejeicao} onOpenChange={(v) => !v && setRejeicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar página</DialogTitle>
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
