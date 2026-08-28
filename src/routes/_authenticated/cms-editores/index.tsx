import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarUsuariosLoja,
  concederPapelCms,
  revogarPapelCms,
  listarColunasNoticia,
  salvarColunaNoticia,
  excluirColunaNoticia,
  atribuirColunaNoticia,
  desatribuirColunaNoticia,
  listarAtribuicoesPaginas,
  atribuirPaginaSite,
  desatribuirPaginaSite,
} from "@/lib/backend/cms-editorial";
import { listarPaginasSite } from "@/lib/backend/paginas-site";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/cms-editores/")({
  head: () => ({ meta: [{ title: "Editores do Site — Gestão Maçônica" }] }),
  component: CmsEditoresPage,
});

const SEM_EDITOR = "__sem_editor__";

function CmsEditoresPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [novaColuna, setNovaColuna] = useState("");

  const { data: usuarios = [] } = useQuery({
    queryKey: ["cms_usuarios_loja"],
    queryFn: () => listarUsuariosLoja(),
    enabled: can.isSuperAdmin,
  });
  const { data: colunas = [] } = useQuery({
    queryKey: ["cms_colunas"],
    queryFn: () => listarColunasNoticia(),
    enabled: can.isSuperAdmin,
  });
  const { data: paginas = [] } = useQuery({
    queryKey: ["paginas_site_all"],
    queryFn: () => listarPaginasSite(),
    enabled: can.isSuperAdmin,
  });
  const { data: atribuicoesPaginas = [] } = useQuery({
    queryKey: ["cms_atribuicoes_paginas"],
    queryFn: () => listarAtribuicoesPaginas(),
    enabled: can.isSuperAdmin,
  });

  const invalidarUsuarios = () => qc.invalidateQueries({ queryKey: ["cms_usuarios_loja"] });
  const invalidarColunas = () => qc.invalidateQueries({ queryKey: ["cms_colunas"] });
  const invalidarPaginas = () => qc.invalidateQueries({ queryKey: ["cms_atribuicoes_paginas"] });

  const editoresCms = usuarios.filter((u) => u.papeis.includes("editor_cms"));

  const alternarPapel = async (
    usuarioId: string,
    papel: "editor_cms" | "aprovador_cms",
    ligar: boolean,
  ) => {
    try {
      await (ligar ? concederPapelCms : revogarPapelCms)({ data: { usuarioId, papel } });
      invalidarUsuarios();
      if (!ligar && papel === "editor_cms") {
        invalidarColunas();
        invalidarPaginas();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar papel.");
    }
  };

  const criarColuna = async () => {
    if (!novaColuna.trim()) return;
    try {
      await salvarColunaNoticia({ data: { id: null, nome: novaColuna.trim() } });
      setNovaColuna("");
      invalidarColunas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar coluna.");
    }
  };

  const excluirColuna = async (id: string) => {
    try {
      await excluirColunaNoticia({ data: { id } });
      invalidarColunas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir coluna.");
    }
  };

  const escolherEditorColuna = async (colunaId: string, usuarioId: string) => {
    try {
      if (usuarioId === SEM_EDITOR) {
        await desatribuirColunaNoticia({ data: { colunaId } });
      } else {
        await atribuirColunaNoticia({ data: { colunaId, usuarioId } });
      }
      invalidarColunas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atribuir coluna.");
    }
  };

  const escolherEditorPagina = async (paginaId: string, usuarioId: string) => {
    try {
      if (usuarioId === SEM_EDITOR) {
        await desatribuirPaginaSite({ data: { paginaId } });
      } else {
        await atribuirPaginaSite({ data: { paginaId, usuarioId } });
      }
      invalidarPaginas();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atribuir página.");
    }
  };

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
        title="Editores do Site"
        description="Quem escreve (Editor CMS) e quem aprova (Aprovador CMS) o conteúdo do site institucional, e em qual coluna/página cada editor pode mexer."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Papéis</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Editor CMS</TableHead>
                <TableHead>Aprovador CMS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    Nenhum usuário ativo nesta Loja.
                  </TableCell>
                </TableRow>
              )}
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.nome_completo ?? u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.papeis.includes("editor_cms")}
                      onCheckedChange={(v) => alternarPapel(u.id, "editor_cms", v)}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.papeis.includes("aprovador_cms")}
                      onCheckedChange={(v) => alternarPapel(u.id, "aprovador_cms", v)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Editor CMS só mexe na(s) coluna(s)/página(s) atribuída(s) abaixo e nunca publica direto
            — todo rascunho pronto vai pra aprovação. Aprovador CMS vê e aprova/rejeita qualquer
            rascunho, mas não edita conteúdo.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Colunas de Notícias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-2">
            <div className="flex-1">
              <Label htmlFor="nova-coluna" className="sr-only">
                Nome da coluna
              </Label>
              <Input
                id="nova-coluna"
                placeholder="Nome da coluna (ex.: Palavra do Venerável)"
                maxLength={120}
                value={novaColuna}
                onChange={(e) => setNovaColuna(e.target.value)}
              />
            </div>
            <Button onClick={criarColuna} disabled={!novaColuna.trim()}>
              Criar coluna
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coluna</TableHead>
                <TableHead>Editor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colunas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    Nenhuma coluna cadastrada.
                  </TableCell>
                </TableRow>
              )}
              {colunas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <Select
                      value={c.editor_usuario_id ?? SEM_EDITOR}
                      onValueChange={(v) => escolherEditorColuna(c.id, v)}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_EDITOR}>Sem editor</SelectItem>
                        {editoresCms.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nome_completo ?? u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir coluna "{c.nome}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            As notícias já escritas nesta coluna não são excluídas, só ficam sem
                            coluna (voltam a ser geridas só pelo super administrador). Essa ação não
                            pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluirColuna(c.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Páginas do Site</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Página</TableHead>
                <TableHead>Editor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                    Nenhuma página cadastrada — crie em "Páginas do Site" primeiro.
                  </TableCell>
                </TableRow>
              )}
              {paginas.map((p) => {
                const atual = atribuicoesPaginas.find((a) => a.pagina_id === p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.titulo}</div>
                      <div className="text-xs text-muted-foreground">/{p.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={atual?.usuario_id ?? SEM_EDITOR}
                        onValueChange={(v) => escolherEditorPagina(p.id, v)}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_EDITOR}>Sem editor</SelectItem>
                          {editoresCms.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.nome_completo ?? u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
