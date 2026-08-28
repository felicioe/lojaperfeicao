import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  listarNoticias,
  listarColunasDisponiveis,
  salvarNoticia,
  definirStatusNoticia,
  enviarNoticiaParaAprovacao,
  aprovarNoticia,
  rejeitarNoticia,
  excluirNoticia,
  type Noticia,
} from "@/lib/backend/noticias";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/_authenticated/noticias-site/")({
  head: () => ({ meta: [{ title: "Notícias — Gestão Maçônica" }] }),
  component: NoticiasPage,
});

const STATUS_LABEL: Record<Noticia["status"], string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  publicado: "Publicado",
};

const STATUS_VARIANT: Record<Noticia["status"], "default" | "secondary" | "outline"> = {
  rascunho: "secondary",
  aguardando_aprovacao: "outline",
  publicado: "default",
};

const fmtDataHora = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(d.replace(" ", "T")),
  );

const FORM_VAZIO = {
  id: null as string | null,
  titulo: "",
  resumo: "",
  conteudo: "",
  colunaId: null as string | null,
};

function NoticiasPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [rejeicao, setRejeicao] = useState<{ id: string; motivo: string } | null>(null);
  const formularioRef = useRef<HTMLDivElement>(null);

  // editor_cms nunca publica direto e aprovador_cms nunca escreve conteúdo —
  // só super_admin e editor_cms têm o que fazer com o formulário abaixo.
  const podeEscrever = can.isSuperAdmin || can.isEditorCms;

  const { data: noticias = [] } = useQuery({
    queryKey: ["noticias_all"],
    queryFn: () => listarNoticias(),
    enabled: can.canAcessarCms,
  });

  const { data: colunas = [] } = useQuery({
    queryKey: ["noticias_colunas_disponiveis"],
    queryFn: () => listarColunasDisponiveis(),
    enabled: podeEscrever,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["noticias_all"] });

  const salvar = async () => {
    if (!form.titulo.trim() || !form.conteudo.trim()) return;
    if (can.isEditorCms && !can.isSuperAdmin && !form.colunaId) {
      toast.error("Escolha a coluna desta notícia.");
      return;
    }
    try {
      await salvarNoticia({
        data: {
          id: form.id,
          titulo: form.titulo.trim(),
          resumo: form.resumo.trim() || null,
          conteudo: form.conteudo,
          colunaId: form.colunaId,
        },
      });
      toast.success(form.id ? "Notícia atualizada." : "Notícia criada.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (n: Noticia) => {
    setForm({
      id: n.id,
      titulo: n.titulo,
      resumo: n.resumo ?? "",
      conteudo: n.conteudo,
      colunaId: n.coluna_id,
    });
    // Sem isso, editar uma notícia mais abaixo na lista atualiza o
    // formulário fora da área visível e parece que o clique não fez nada
    // (achado do usuário testando em produção).
    requestAnimationFrame(() => {
      formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const alternarStatus = async (n: Noticia) => {
    try {
      await definirStatusNoticia({
        data: { id: n.id, status: n.status === "publicado" ? "rascunho" : "publicado" },
      });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar status.");
    }
  };

  const enviarParaAprovacao = async (id: string) => {
    try {
      await enviarNoticiaParaAprovacao({ data: { id } });
      toast.success("Notícia enviada para aprovação.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar para aprovação.");
    }
  };

  const aprovar = async (id: string) => {
    try {
      await aprovarNoticia({ data: { id } });
      toast.success("Notícia aprovada e publicada.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar.");
    }
  };

  const confirmarRejeicao = async () => {
    if (!rejeicao || !rejeicao.motivo.trim()) return;
    try {
      await rejeitarNoticia({ data: { id: rejeicao.id, motivo: rejeicao.motivo.trim() } });
      toast.success("Notícia rejeitada — volta como rascunho pro autor corrigir.");
      setRejeicao(null);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao rejeitar.");
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirNoticia({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const ord = useOrdenacao(noticias, {
    titulo: (n) => n.titulo,
    status: (n) => n.status,
    criado_em: (n) => n.criado_em,
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

  return (
    <>
      <PageHeader
        title="Notícias"
        description="Publicações exibidas no site institucional (associacaoadonhiramita.org)."
      />

      {podeEscrever && (
        <Card ref={formularioRef} className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">
              {form.id ? "Editar notícia" : "Nova notícia"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {can.isEditorCms && !can.isSuperAdmin && colunas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma coluna atribuída a você ainda — peça ao super administrador pra te atribuir
                uma antes de escrever.
              </p>
            ) : (
              <>
                <div>
                  <Label htmlFor="noticia-titulo">Título</Label>
                  <Input
                    id="noticia-titulo"
                    maxLength={200}
                    value={form.titulo}
                    onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Coluna{can.isSuperAdmin ? " (opcional)" : ""}</Label>
                  <Select
                    value={form.colunaId ?? "__nenhuma__"}
                    onValueChange={(v) =>
                      setForm({ ...form, colunaId: v === "__nenhuma__" ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      {can.isSuperAdmin && <SelectItem value="__nenhuma__">Sem coluna</SelectItem>}
                      {colunas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="noticia-resumo">
                    Resumo (opcional, exibido em listagens no site)
                  </Label>
                  <Textarea
                    id="noticia-resumo"
                    maxLength={500}
                    rows={2}
                    value={form.resumo}
                    onChange={(e) => setForm({ ...form, resumo: e.target.value })}
                  />
                </div>
                <div>
                  <Label id="noticia-conteudo-label">Conteúdo</Label>
                  <LazyRichTextEditor
                    ariaLabelledBy="noticia-conteudo-label"
                    value={form.conteudo}
                    onChange={(html) => setForm({ ...form, conteudo: html })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={salvar} disabled={!form.titulo.trim() || !form.conteudo.trim()}>
                    {form.id ? "Salvar alterações" : "Criar notícia"}
                  </Button>
                  {form.id && (
                    <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}>
                      <X className="mr-1 h-4 w-4" /> Cancelar
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {can.isSuperAdmin
                    ? 'Notícias novas começam como rascunho — use "Publicar" na lista abaixo para que apareçam no site.'
                    : 'Notícias novas começam como rascunho — use "Enviar para aprovação" na lista abaixo quando estiver pronta.'}
                </p>
              </>
            )}
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
              <TableHead>Coluna</TableHead>
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
                  Nenhuma notícia cadastrada.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((n) => {
              const podeEditarEsta =
                can.isSuperAdmin || (can.isEditorCms && n.status === "rascunho");
              const podeExcluirEsta =
                can.isSuperAdmin || (can.isEditorCms && n.status === "rascunho");
              const podeEnviar = can.isEditorCms && !can.isSuperAdmin && n.status === "rascunho";
              const podeAprovarOuRejeitar =
                (can.isSuperAdmin || can.isAprovadorCms) && n.status === "aguardando_aprovacao";
              return (
                <Fragment key={n.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandido(expandido === n.id ? null : n.id)}
                      >
                        {expandido === n.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{n.titulo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {n.coluna_nome ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[n.status]}>{STATUS_LABEL[n.status]}</Badge>
                      {n.motivo_rejeicao && (
                        <p className="mt-1 max-w-[220px] text-xs text-destructive">
                          Rejeitada: {n.motivo_rejeicao}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDataHora(n.criado_em)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {can.isSuperAdmin && (
                        <Button variant="outline" size="sm" onClick={() => alternarStatus(n)}>
                          {n.status === "publicado" ? "Despublicar" : "Publicar"}
                        </Button>
                      )}
                      {podeEnviar && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => enviarParaAprovacao(n.id)}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" /> Enviar p/ aprovação
                        </Button>
                      )}
                      {podeAprovarOuRejeitar && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => aprovar(n.id)}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRejeicao({ id: n.id, motivo: "" })}
                          >
                            <Ban className="mr-1 h-3.5 w-3.5" /> Rejeitar
                          </Button>
                        </>
                      )}
                      {podeEditarEsta && (
                        <Button variant="ghost" size="sm" onClick={() => editar(n)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {podeExcluirEsta && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir "{n.titulo}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A notícia será excluída permanentemente, inclusive do site caso
                                esteja publicada. Essa ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir(n.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandido === n.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <RichTextView html={n.conteudo} />
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
            <DialogTitle>Rejeitar notícia</DialogTitle>
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
