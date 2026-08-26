import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarNoticias,
  salvarNoticia,
  definirStatusNoticia,
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
import { Badge } from "@/components/ui/badge";
import { Fragment } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/noticias/")({
  head: () => ({ meta: [{ title: "Notícias — Gestão Maçônica" }] }),
  component: NoticiasPage,
});

const STATUS_LABEL: Record<Noticia["status"], string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
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
};

function NoticiasPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: noticias = [] } = useQuery({
    queryKey: ["noticias_all"],
    queryFn: () => listarNoticias(),
    enabled: can.isSuperAdmin,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["noticias_all"] });

  const salvar = async () => {
    if (!form.titulo.trim() || !form.conteudo.trim()) return;
    try {
      await salvarNoticia({
        data: {
          id: form.id,
          titulo: form.titulo.trim(),
          resumo: form.resumo.trim() || null,
          conteudo: form.conteudo,
        },
      });
      toast.success(form.id ? "Notícia atualizada." : "Notícia criada.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (n: Noticia) =>
    setForm({ id: n.id, titulo: n.titulo, resumo: n.resumo ?? "", conteudo: n.conteudo });

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

  if (!can.isSuperAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas o super administrador da plataforma pode acessar esta função.
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Notícias"
        description="Publicações exibidas no site institucional (associacaoadonhiramita.org)."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">{form.id ? "Editar notícia" : "Nova notícia"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
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
            <Label htmlFor="noticia-resumo">Resumo (opcional, exibido em listagens no site)</Label>
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
            Notícias novas começam como rascunho — use "Publicar" na lista abaixo para que apareçam
            no site.
          </p>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHeadOrdenavel campo="titulo" ord={ord}>
                Título
              </TableHeadOrdenavel>
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
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhuma notícia cadastrada.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((n) => (
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
                  <TableCell>
                    <Badge variant={n.status === "publicado" ? "default" : "secondary"}>
                      {STATUS_LABEL[n.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDataHora(n.criado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => alternarStatus(n)}>
                      {n.status === "publicado" ? "Despublicar" : "Publicar"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => editar(n)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
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
                            A notícia será excluída permanentemente, inclusive do site caso esteja
                            publicada. Essa ação não pode ser desfeita.
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
                  </TableCell>
                </TableRow>
                {expandido === n.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30">
                      <RichTextView html={n.conteudo} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
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
    </>
  );
}
