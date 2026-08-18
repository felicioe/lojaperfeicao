import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarPotencias,
  salvarPotencia,
  alternarAtivoPotencia,
  type Potencia,
} from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { useOrdenacao } from "@/lib/use-ordenacao";

export const Route = createFileRoute("/_authenticated/orgs/potencias")({
  head: () => ({ meta: [{ title: "Potência — Gestão Maçônica" }] }),
  component: Potencias,
});

const FORM_VAZIO = { id: null as string | null, nome: "", sigla: "", jurisdicao: "", site: "" };

function Potencias() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);

  const { data = [] } = useQuery({
    queryKey: ["potencias_all"],
    queryFn: () => listarPotencias(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["potencias_all"] });

  const ord = useOrdenacao(data, {
    nome: (p) => p.nome,
    sigla: (p) => p.sigla,
    jurisdicao: (p) => p.jurisdicao,
    ativa: (p) => (p.ativo ? 1 : 0),
  });

  const salvar = async () => {
    if (!form.nome.trim()) return;
    try {
      await salvarPotencia({
        data: {
          id: form.id,
          nome: form.nome.trim(),
          sigla: form.sigla || null,
          jurisdicao: form.jurisdicao || null,
          site: form.site || null,
        },
      });
      toast.success(form.id ? "Potência atualizada." : "Potência criada.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const alternarAtivo = async (p: Potencia) => {
    try {
      await alternarAtivoPotencia({ data: { id: p.id, ativo: !p.ativo } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  };

  return (
    <>
      <PageHeader
        title="Potência"
        description="Órgãos federativos/obediências aos quais os corpos maçônicos são filiados."
      />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">
              {form.id ? "Editar potência" : "Nova potência"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="potencia-nome">Nome</Label>
              <Input
                id="potencia-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="potencia-sigla">Sigla</Label>
              <Input
                id="potencia-sigla"
                value={form.sigla}
                onChange={(e) => setForm({ ...form, sigla: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="potencia-jurisdicao">Jurisdição</Label>
              <Input
                id="potencia-jurisdicao"
                value={form.jurisdicao}
                onChange={(e) => setForm({ ...form, jurisdicao: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="potencia-site">Site</Label>
              <Input
                id="potencia-site"
                value={form.site}
                onChange={(e) => setForm({ ...form, site: e.target.value })}
              />
            </div>
            <div className="md:col-span-4 flex gap-2">
              <Button onClick={salvar} disabled={!form.nome}>
                {form.id ? "Salvar alterações" : "Adicionar"}
              </Button>
              {form.id && (
                <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="nome" ord={ord}>
                Nome
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="sigla" ord={ord}>
                Sigla
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="jurisdicao" ord={ord}>
                Jurisdição
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="ativa" ord={ord}>
                Ativa
              </TableHeadOrdenavel>
              {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma potência cadastrada.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((p) => (
              <TableRow key={p.id} className={!p.ativo ? "opacity-50" : undefined}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>{p.sigla ?? "—"}</TableCell>
                <TableCell>{p.jurisdicao ?? "—"}</TableCell>
                <TableCell>
                  <Switch
                    checked={p.ativo}
                    onCheckedChange={() => alternarAtivo(p)}
                    disabled={!can.canManageIrmaos}
                  />
                </TableCell>
                {can.canManageIrmaos && (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm({
                          id: p.id,
                          nome: p.nome,
                          sigla: p.sigla ?? "",
                          jurisdicao: p.jurisdicao ?? "",
                          site: p.site ?? "",
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" />
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
