import { Fragment, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarComissoes,
  criarComissao,
  alternarAtivoComissao,
  excluirComissao,
  listarComissaoMembros,
  criarComissaoMembro,
  removerComissaoMembro,
  PAPEIS_SUGERIDOS,
  type Comissao,
} from "@/lib/backend/comissoes";
import { listarOrgs } from "@/lib/backend/orgs";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/comissoes/")({
  head: () => ({ meta: [{ title: "Comissões — Gestão Maçônica" }] }),
  component: Comissoes,
});

const FORM_VAZIO = { org_id: "", nome: "" };

function Comissoes() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [expandida, setExpandida] = useState<string | null>(null);

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });
  const { data: comissoes = [] } = useQuery({
    queryKey: ["comissoes_all"],
    queryFn: () => listarComissoes(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["comissoes_all"] });

  const nomeOrg = (id: string) =>
    orgs.find((o) => o.id === id)?.sigla ?? orgs.find((o) => o.id === id)?.nome ?? "—";

  const ord = useOrdenacao(comissoes, {
    corpo: (c) => nomeOrg(c.org_id),
    comissao: (c) => c.nome,
    status: (c) => (c.ativo ? 1 : 0),
  });

  const salvar = async () => {
    if (!form.org_id || !form.nome.trim()) return;
    try {
      await criarComissao({ data: { orgId: form.org_id, nome: form.nome.trim() } });
      toast.success("Comissão criada.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    }
  };

  const alternarAtivo = async (c: Comissao) => {
    try {
      await alternarAtivoComissao({ data: { id: c.id, ativo: !c.ativo } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirComissao({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  return (
    <>
      <PageHeader
        title="Comissões"
        description="Grupos de trabalho de cada corpo (ex.: Ensino/Ritualística/Liturgia/Graus, Finanças) e seus membros."
      />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Nova comissão</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="comissao-corpo">Corpo</Label>
              <Select value={form.org_id} onValueChange={(v) => setForm({ ...form, org_id: v })}>
                <SelectTrigger id="comissao-corpo">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.sigla ?? o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="comissao-nome">Nome</Label>
              <Input
                id="comissao-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ensino, Ritualística, Liturgia e Graus"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={salvar} disabled={!form.org_id || !form.nome} className="w-full">
                Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHeadOrdenavel campo="corpo" ord={ord}>
                Corpo
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="comissao" ord={ord}>
                Comissão
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="status" ord={ord}>
                Status
              </TableHeadOrdenavel>
              {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {comissoes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nenhuma comissão cadastrada.
                </TableCell>
              </TableRow>
            )}
            {ord.itensOrdenados.map((c) => (
              <Fragment key={c.id}>
                <TableRow>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandida(expandida === c.id ? null : c.id)}
                    >
                      {expandida === c.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>{nomeOrg(c.org_id)}</TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    {c.ativo ? <Badge>Ativa</Badge> : <Badge variant="outline">Inativa</Badge>}
                  </TableCell>
                  {can.canManageIrmaos && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => alternarAtivo(c)}>
                        {c.ativo ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => excluir(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
                {expandida === c.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30">
                      <MembrosPanel comissao={c} podeEditar={can.canManageIrmaos} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function MembrosPanel({ comissao, podeEditar }: { comissao: Comissao; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ papel: "", irmao_id: "" });

  const { data: membros = [] } = useQuery({
    queryKey: ["comissao_membros", comissao.id],
    queryFn: () => listarComissaoMembros({ data: { comissaoId: comissao.id } }),
  });

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["comissao_membros", comissao.id] });

  const ordMembros = useOrdenacao(membros, {
    papel: (m) => m.papel,
    irmao: (m) => m.nome_civil,
  });

  const adicionar = async () => {
    if (!novo.papel.trim() || !novo.irmao_id) return;
    try {
      await criarComissaoMembro({
        data: { comissaoId: comissao.id, papel: novo.papel.trim(), irmaoId: novo.irmao_id },
      });
      setNovo({ papel: "", irmao_id: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const remover = async (id: string) => {
    try {
      await removerComissaoMembro({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <div className="space-y-3 py-2">
      <div className="text-sm font-medium">Membros — {comissao.nome}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeadOrdenavel campo="papel" ord={ordMembros}>
              Papel
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="irmao" ord={ordMembros}>
              Irmão
            </TableHeadOrdenavel>
            {podeEditar && <TableHead className="w-10"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {membros.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-sm text-muted-foreground">
                Nenhum membro ainda.
              </TableCell>
            </TableRow>
          )}
          {ordMembros.itensOrdenados.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.papel}</TableCell>
              <TableCell>{m.nome_civil}</TableCell>
              {podeEditar && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => remover(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {podeEditar && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="comissao-membro-papel" className="text-xs">
              Papel
            </Label>
            <Input
              id="comissao-membro-papel"
              className="h-8"
              list="papeis-sugeridos"
              value={novo.papel}
              onChange={(e) => setNovo({ ...novo, papel: e.target.value })}
              placeholder="Presidente"
            />
            <datalist id="papeis-sugeridos">
              {PAPEIS_SUGERIDOS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="flex-1">
            <Label htmlFor="comissao-membro-irmao" className="text-xs">
              Irmão
            </Label>
            <Select value={novo.irmao_id} onValueChange={(v) => setNovo({ ...novo, irmao_id: v })}>
              <SelectTrigger id="comissao-membro-irmao" className="h-8">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {irmaos.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.nome_civil}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={adicionar}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
