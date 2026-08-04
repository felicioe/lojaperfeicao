import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarPlanosEnsino,
  salvarPlanoEnsino,
  excluirPlanoEnsino,
  type PlanoEnsino,
  type Grau,
} from "@/lib/backend/planos-ensino";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { GRAU_LABEL } from "@/lib/format";
import { Pencil, Trash2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/ensino/planos")({
  head: () => ({ meta: [{ title: "Planos de Ensino — Gestão Maçônica" }] }),
  component: PlanosEnsinoPage,
});

const FORM_VAZIO = {
  id: null as string | null,
  grau: "aprendiz" as Grau,
  ordem: 0,
  titulo: "",
  conteudo: "",
};

function PlanosEnsinoPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [filtroGrau, setFiltroGrau] = useState<Grau | "todos">("todos");

  const { data: planos = [] } = useQuery({
    queryKey: ["planos_ensino"],
    queryFn: () => listarPlanosEnsino(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["planos_ensino"] });

  const salvar = async () => {
    if (!form.titulo.trim()) return;
    try {
      await salvarPlanoEnsino({
        data: {
          id: form.id,
          grau: form.grau,
          ordem: Number(form.ordem) || 0,
          titulo: form.titulo.trim(),
          conteudo: form.conteudo || null,
        },
      });
      toast.success(form.id ? "Plano atualizado." : "Plano criado.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (p: PlanoEnsino) =>
    setForm({
      id: p.id,
      grau: p.grau,
      ordem: p.ordem,
      titulo: p.titulo,
      conteudo: p.conteudo ?? "",
    });

  const excluir = async (id: string) => {
    try {
      await excluirPlanoEnsino({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const itens = planos.filter((p) => filtroGrau === "todos" || p.grau === filtroGrau);

  return (
    <>
      <PageHeader
        title="Planos de Ensino"
        description="Referência de currículo/plano de estudo por grau — base para o calendário anual."
      />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">{form.id ? "Editar item" : "Novo item"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Grau</Label>
              <Select
                value={form.grau}
                onValueChange={(v) => setForm({ ...form, grau: v as Grau })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GRAU_LABEL) as Grau[]).map((g) => (
                    <SelectItem key={g} value={g}>
                      {GRAU_LABEL[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div className="md:col-span-4">
              <Label>Conteúdo</Label>
              <Textarea
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
              />
            </div>
            <div className="flex gap-2 md:col-span-4">
              <Button onClick={salvar} disabled={!form.titulo}>
                {form.id ? "Salvar alterações" : "Adicionar"}
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

      <div className="mb-3 w-48">
        <Select value={filtroGrau} onValueChange={(v) => setFiltroGrau(v as Grau | "todos")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os graus</SelectItem>
            {(Object.keys(GRAU_LABEL) as Grau[]).map((g) => (
              <SelectItem key={g} value={g}>
                {GRAU_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grau</TableHead>
              <TableHead>Ordem</TableHead>
              <TableHead>Título</TableHead>
              {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  Nenhum item cadastrado.
                </TableCell>
              </TableRow>
            )}
            {itens.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{GRAU_LABEL[p.grau]}</TableCell>
                <TableCell className="font-mono">{p.ordem}</TableCell>
                <TableCell className="font-medium">{p.titulo}</TableCell>
                {can.canManageIrmaos && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => editar(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => excluir(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
