import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listarMenuSite,
  salvarItemMenuSite,
  alternarVisivelItemMenuSite,
  excluirItemMenuSite,
  moverItemMenuSite,
  type ItemMenuSite,
  type TipoDestinoMenu,
} from "@/lib/backend/menu-site";
import { listarPaginasSite } from "@/lib/backend/paginas-site";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { ArrowDown, ArrowUp, Pencil, Trash2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/menu-site/")({
  head: () => ({ meta: [{ title: "Menu do Site — Gestão Maçônica" }] }),
  component: MenuSitePage,
});

const TIPO_LABEL: Record<TipoDestinoMenu, string> = {
  pagina: "Página existente",
  agenda: "Agenda",
  noticias: "Notícias",
  link_externo: "Link externo",
};

const FORM_VAZIO = {
  id: null as string | null,
  parentId: null as string | null,
  label: "",
  tipoDestino: "pagina" as TipoDestinoMenu,
  destino: "",
};

function MenuSitePage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const formularioRef = useRef<HTMLDivElement>(null);

  const { data: itens = [] } = useQuery({
    queryKey: ["menu_site_all"],
    queryFn: () => listarMenuSite(),
    enabled: can.isSuperAdmin,
  });

  const { data: paginas = [] } = useQuery({
    queryKey: ["paginas_site_all"],
    queryFn: () => listarPaginasSite(),
    enabled: can.isSuperAdmin && form.tipoDestino === "pagina",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["menu_site_all"] });

  const itensTopo = itens.filter((i) => !i.parent_id);
  const itensPorPai = new Map<string, ItemMenuSite[]>();
  for (const item of itens) {
    if (!item.parent_id) continue;
    const lista = itensPorPai.get(item.parent_id) ?? [];
    lista.push(item);
    itensPorPai.set(item.parent_id, lista);
  }

  const salvar = async () => {
    if (!form.label.trim() || !form.destino.trim()) return;
    try {
      await salvarItemMenuSite({
        data: {
          id: form.id,
          parentId: form.parentId,
          label: form.label.trim(),
          tipoDestino: form.tipoDestino,
          destino: form.destino.trim(),
        },
      });
      toast.success(form.id ? "Item atualizado." : "Item criado.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (item: ItemMenuSite) => {
    setForm({
      id: item.id,
      parentId: item.parent_id,
      label: item.label,
      tipoDestino: item.tipo_destino,
      destino: item.destino,
    });
    requestAnimationFrame(() => {
      formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const novoSubmenu = (parentId: string) => {
    setForm({ ...FORM_VAZIO, parentId });
    requestAnimationFrame(() => {
      formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const alternarVisivel = async (item: ItemMenuSite) => {
    try {
      await alternarVisivelItemMenuSite({ data: { id: item.id, visivel: !item.visivel } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar visibilidade.");
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirItemMenuSite({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const mover = async (id: string, direcao: "cima" | "baixo") => {
    try {
      await moverItemMenuSite({ data: { id, direcao } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reordenar.");
    }
  };

  if (!can.isSuperAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas o super administrador da plataforma pode acessar esta função.
      </Card>
    );
  }

  const linhaItem = (item: ItemMenuSite, ehSubmenu: boolean, irmaos: ItemMenuSite[]) => {
    const idx = irmaos.findIndex((i) => i.id === item.id);
    return (
      <TableRow key={item.id}>
        <TableCell className={ehSubmenu ? "pl-8 font-normal text-muted-foreground" : "font-medium"}>
          {ehSubmenu && "— "}
          {item.label}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {TIPO_LABEL[item.tipo_destino]}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">{item.destino}</TableCell>
        <TableCell>
          <Switch checked={item.visivel} onCheckedChange={() => alternarVisivel(item)} />
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          <Button
            variant="ghost"
            size="sm"
            disabled={idx <= 0}
            onClick={() => mover(item.id, "cima")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={idx === -1 || idx === irmaos.length - 1}
            onClick={() => mover(item.id, "baixo")}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          {!ehSubmenu && (
            <Button variant="ghost" size="sm" onClick={() => novoSubmenu(item.id)}>
              + Submenu
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => editar(item)}>
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
                <AlertDialogTitle>Excluir "{item.label}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  {ehSubmenu
                    ? "O item será excluído permanentemente. Essa ação não pode ser desfeita."
                    : "O item e todos os seus submenus serão excluídos permanentemente. Essa ação não pode ser desfeita."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => excluir(item.id)}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <PageHeader
        title="Menu do Site"
        description="Navegação do site institucional (associacaoadonhiramita.org) — oculte, reordene ou crie itens e submenus."
      />

      <Card ref={formularioRef} className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">
            {form.id ? "Editar item" : form.parentId ? "Novo submenu" : "Novo item"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div>
            <Label htmlFor="menu-label">Texto do menu</Label>
            <Input
              id="menu-label"
              maxLength={100}
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="menu-tipo">Aponta para</Label>
            <Select
              value={form.tipoDestino}
              onValueChange={(v) => {
                const tipo = v as TipoDestinoMenu;
                const destinoFixo =
                  tipo === "agenda" ? "/agenda" : tipo === "noticias" ? "/noticias" : "";
                setForm((f) => ({ ...f, tipoDestino: tipo, destino: destinoFixo }));
              }}
            >
              <SelectTrigger id="menu-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pagina">Página existente</SelectItem>
                <SelectItem value="agenda">Agenda</SelectItem>
                <SelectItem value="noticias">Notícias</SelectItem>
                <SelectItem value="link_externo">Link externo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.tipoDestino === "pagina" ? (
            <div>
              <Label htmlFor="menu-destino-pagina">Página</Label>
              <Select
                value={form.destino}
                onValueChange={(v) => setForm((f) => ({ ...f, destino: v }))}
              >
                <SelectTrigger id="menu-destino-pagina">
                  <SelectValue placeholder="Selecione uma página" />
                </SelectTrigger>
                <SelectContent>
                  {paginas.map((p) => (
                    <SelectItem key={p.id} value={p.slug}>
                      {p.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : form.tipoDestino === "link_externo" ? (
            <div>
              <Label htmlFor="menu-destino-link">URL completa</Label>
              <Input
                id="menu-destino-link"
                maxLength={500}
                placeholder="https://..."
                value={form.destino}
                onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Destino fixo: <code>{form.destino}</code>
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={salvar} disabled={!form.label.trim() || !form.destino.trim()}>
              {form.id ? "Salvar alterações" : "Criar item"}
            </Button>
            {(form.id || form.parentId) && (
              <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}>
                <X className="mr-1 h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Visível</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensTopo.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhum item de menu cadastrado.
                </TableCell>
              </TableRow>
            )}
            {itensTopo.map((item) => (
              <Fragment key={item.id}>
                {linhaItem(item, false, itensTopo)}
                {(itensPorPai.get(item.id) ?? []).map((sub) =>
                  linhaItem(sub, true, itensPorPai.get(item.id) ?? []),
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
