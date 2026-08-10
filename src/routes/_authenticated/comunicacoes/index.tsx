import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarComunicados,
  salvarComunicado,
  excluirComunicado,
  type Comunicado,
} from "@/lib/backend/comunicacoes";
import { listarOrgs } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const { data: comunicados = [] } = useQuery({
    queryKey: ["comunicados_all"],
    queryFn: () => listarComunicados(),
  });
  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

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
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div>
              <Label>Corpo</Label>
              <Textarea
                rows={4}
                value={form.corpo}
                onChange={(e) => setForm({ ...form, corpo: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Público</Label>
                <Select
                  value={form.publico}
                  onValueChange={(v) => setForm({ ...form, publico: v as Comunicado["publico"] })}
                >
                  <SelectTrigger>
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
                  <Label>Corpo maçônico</Label>
                  <Select value={form.orgId} onValueChange={(v) => setForm({ ...form, orgId: v })}>
                    <SelectTrigger>
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
        {comunicados.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            <Megaphone className="mx-auto mb-2 h-8 w-8" />
            Nenhum comunicado publicado.
          </Card>
        )}
        {comunicados.map((c) => (
          <Card key={c.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(c.criado_em)} · {PUBLICO_LABEL[c.publico]}
                    {c.publico === "org" && c.org_nome ? ` — ${c.org_nome}` : ""}
                  </p>
                </div>
                {can.canManageIrmaos && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => editar(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => excluir(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{c.corpo}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
