import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarPlanosEnsino,
  salvarPlanoEnsino,
  excluirPlanoEnsino,
  type PlanoEnsino,
} from "@/lib/backend/planos-ensino";
import { listarOrgs, listarOrgsGraus } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
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
import { Pencil, Trash2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/ensino/planos")({
  head: () => ({ meta: [{ title: "Planos de Ensino — Gestão Maçônica" }] }),
  component: PlanosEnsinoPage,
});

const FORM_VAZIO = {
  id: null as string | null,
  orgId: "",
  grau: "",
  ordem: 0,
  titulo: "",
  conteudo: "",
};

function PlanosEnsinoPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [filtroOrgId, setFiltroOrgId] = useState("todos");

  const { data: planos = [] } = useQuery({
    queryKey: ["planos_ensino"],
    queryFn: () => listarPlanosEnsino(),
  });

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  const { data: graus = [] } = useQuery({
    queryKey: ["orgs_graus", form.orgId],
    queryFn: () => listarOrgsGraus({ data: { orgId: form.orgId } }),
    enabled: !!form.orgId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["planos_ensino"] });

  const salvar = async () => {
    const grau = Number(form.grau);
    if (!form.titulo.trim()) return toast.error("Informe o título.");
    if (!grau) return toast.error("Selecione o grau.");
    try {
      await salvarPlanoEnsino({
        data: {
          id: form.id,
          grau,
          orgId: form.orgId || null,
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
      orgId: p.org_id ?? "",
      grau: String(p.grau),
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

  const itens = planos.filter((p) => filtroOrgId === "todos" || p.org_id === filtroOrgId);
  const ord = useOrdenacao(itens, {
    grau: (p) => p.grau,
    corpo: (p) => p.org_nome,
    ordem: (p) => p.ordem,
    titulo: (p) => p.titulo,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

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
          <CardContent className="grid gap-3 md:grid-cols-6">
            <div>
              <Label htmlFor="plano-corpo">Corpo (opcional)</Label>
              <Select
                value={form.orgId || "nenhum"}
                onValueChange={(v) =>
                  setForm({ ...form, orgId: v === "nenhum" ? "" : v, grau: "" })
                }
              >
                <SelectTrigger id="plano-corpo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Genérico (todos)</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="plano-grau">Grau</Label>
              {form.orgId ? (
                <Select value={form.grau} onValueChange={(v) => setForm({ ...form, grau: v })}>
                  <SelectTrigger id="plano-grau">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {graus.map((g) => (
                      <SelectItem key={g.id} value={String(g.grau)}>
                        Grau {g.grau} — {g.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="plano-grau"
                  type="number"
                  min={1}
                  value={form.grau}
                  onChange={(e) => setForm({ ...form, grau: e.target.value })}
                  placeholder="Ex.: 4"
                />
              )}
            </div>
            <div>
              <Label htmlFor="plano-ordem">Ordem</Label>
              <Input
                id="plano-ordem"
                type="number"
                value={form.ordem}
                onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })}
              />
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="plano-titulo">Título</Label>
              <Input
                id="plano-titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div className="md:col-span-6">
              <Label htmlFor="plano-conteudo">Conteúdo</Label>
              <Textarea
                id="plano-conteudo"
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
              />
            </div>
            <div className="flex gap-2 md:col-span-6">
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

      <div className="mb-3 w-56">
        <Select value={filtroOrgId} onValueChange={setFiltroOrgId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os corpos</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="grau" ord={ord}>
                Grau
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="corpo" ord={ord}>
                Corpo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="ordem" ord={ord}>
                Ordem
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="titulo" ord={ord}>
                Título
              </TableHeadOrdenavel>
              {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhum item cadastrado.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((p) => (
              <TableRow key={p.id}>
                <TableCell>Grau {p.grau}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.org_nome ?? "Genérico"}
                </TableCell>
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
