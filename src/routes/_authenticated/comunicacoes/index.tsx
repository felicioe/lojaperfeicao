import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listarComunicados,
  salvarComunicado,
  excluirComunicado,
  marcarComunicadoLido,
  type Comunicado,
} from "@/lib/backend/comunicacoes";
import { listarOrgs } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { usePaginacao } from "@/lib/use-paginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { fmtDate } from "@/lib/format";
import { Megaphone, Pencil, Trash2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/comunicacoes/")({
  head: () => ({ meta: [{ title: "Comunicações — Gestão Maçônica" }] }),
  component: ComunicacoesPage,
});

const PUBLICO_LABEL: Record<Comunicado["publico"], string> = {
  todos: "Todos",
  org: "Corpo específico",
};

const FORM_VAZIO = {
  id: null as string | null,
  titulo: "",
  corpo: "",
  publico: "todos" as Comunicado["publico"],
  orgId: "",
  enviarEmail: false,
};

function ComunicacoesPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);

  const {
    data: comunicados = [],
    isError,
    refetch,
  } = useQuery({
    queryKey: ["comunicados_all"],
    queryFn: () => listarComunicados(),
  });
  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  // Marca como lido automaticamente (mesmo padrão de painel/comunicacoes.tsx)
  // — esta rota é a mesma tela compartilhada por quem publica (admin/
  // secretario) e por irmãos que acessam via desktop; sem isto, o badge de
  // pendências do menu nunca zerava pra quem lia por aqui.
  const marcados = useRef(new Set<string>());
  useEffect(() => {
    const naoLidos = comunicados.filter((c) => !c.lido && !marcados.current.has(c.id));
    if (naoLidos.length === 0) return;
    Promise.all(
      naoLidos.map((c) => {
        marcados.current.add(c.id);
        return marcarComunicadoLido({ data: { comunicadoId: c.id } });
      }),
    ).then(() => {
      qc.invalidateQueries({ queryKey: ["comunicados_all"] });
      qc.invalidateQueries({ queryKey: ["painel", "comunicadosNaoLidos"] });
    });
  }, [comunicados, qc]);

  // Paginação client-side (mesmo padrão de contas-pagar.tsx etc.) — o mural
  // cresce sem limite ao longo dos anos e antes era renderizado inteiro de
  // uma vez.
  const comunicadosPag = usePaginacao(comunicados);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["comunicados_all"] });

  const salvar = async () => {
    if (!form.titulo.trim() || !form.corpo.trim()) return;
    try {
      await salvarComunicado({
        data: {
          id: form.id,
          titulo: form.titulo.trim(),
          corpo: form.corpo.trim(),
          publico: form.publico,
          orgId: form.publico === "org" ? form.orgId || null : null,
          enviarEmail: form.enviarEmail,
        },
      });
      toast.success(form.id ? "Comunicado atualizado." : "Comunicado publicado.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (c: Comunicado) =>
    setForm({
      id: c.id,
      titulo: c.titulo,
      corpo: c.corpo,
      publico: c.publico,
      orgId: c.org_id ?? "",
      enviarEmail: false,
    });

  const excluir = async (id: string) => {
    try {
      await excluirComunicado({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  return (
    <>
      <PageHeader
        title="Comunicações"
        description="Mural de comunicados/avisos internos, visível no portal do irmão."
      />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">
              {form.id ? "Editar comunicado" : "Novo comunicado"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label htmlFor="comunicado-titulo">Título</Label>
              <Input
                id="comunicado-titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="comunicado-corpo">Corpo</Label>
              <Textarea
                id="comunicado-corpo"
                rows={4}
                value={form.corpo}
                onChange={(e) => setForm({ ...form, corpo: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="comunicado-publico">Público</Label>
                <Select
                  value={form.publico}
                  onValueChange={(v) => setForm({ ...form, publico: v as Comunicado["publico"] })}
                >
                  <SelectTrigger id="comunicado-publico">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PUBLICO_LABEL) as Comunicado["publico"][]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PUBLICO_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.publico === "org" && (
                <div>
                  <Label htmlFor="comunicado-org">Corpo maçônico</Label>
                  <Select value={form.orgId} onValueChange={(v) => setForm({ ...form, orgId: v })}>
                    <SelectTrigger id="comunicado-org">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {!form.id && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={form.enviarEmail}
                  onCheckedChange={(v) => setForm({ ...form, enviarEmail: v === true })}
                />
                Enviar também por e-mail
              </label>
            )}
            <div className="flex gap-2">
              <Button onClick={salvar} disabled={!form.titulo || !form.corpo}>
                {form.id ? "Salvar alterações" : "Publicar"}
              </Button>
              {form.id && (
                <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}>
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {isError && (
          <Card className="p-10 text-center text-muted-foreground">
            <Megaphone className="mx-auto mb-2 h-8 w-8" />
            <p>Não foi possível carregar os comunicados.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </Card>
        )}
        {!isError && comunicados.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            <Megaphone className="mx-auto mb-2 h-8 w-8" />
            Nenhum comunicado publicado.
          </Card>
        )}
        {comunicadosPag.itensPagina.map((c) => (
          <Card key={c.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{c.titulo}</p>
                    {!c.lido && (
                      <Badge variant="secondary" className="shrink-0">
                        Novo
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(c.criado_em)} · {PUBLICO_LABEL[c.publico]}
                    {c.publico === "org" && c.org_nome ? ` — ${c.org_nome}` : ""}
                  </p>
                </div>
                {can.canManageIrmaos && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar comunicado "${c.titulo}"`}
                      onClick={() => editar(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Excluir comunicado "${c.titulo}"`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir "{c.titulo}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O comunicado será excluído permanentemente. Essa ação não pode ser
                            desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluir(c.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {c.corpo}
              </p>
            </CardContent>
          </Card>
        ))}
        <TabelaPaginacao
          pagina={comunicadosPag.pagina}
          totalPaginas={comunicadosPag.totalPaginas}
          totalItens={comunicadosPag.totalItens}
          tamanhoPagina={comunicadosPag.tamanhoPagina}
          setPagina={comunicadosPag.setPagina}
        />
      </div>
    </>
  );
}
