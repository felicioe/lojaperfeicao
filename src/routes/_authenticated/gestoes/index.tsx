import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarGestoes,
  criarGestao,
  listarGestaoCargos,
  listarCargosDisponiveis,
  criarGestaoCargo,
  removerGestaoCargo,
  type Gestao,
} from "@/lib/backend/gestoes";
import { listarOrgs } from "@/lib/backend/orgs";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
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
import { fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/gestoes/")({
  head: () => ({ meta: [{ title: "Gestões — Gestão Maçônica" }] }),
  component: Gestoes,
});

type Org = { id: string; nome: string; sigla: string | null };

const FORM_VAZIO = { org_id: "", nome: "", data_inicio: "", data_fim: "", ativo: true };

function Gestoes() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [expandida, setExpandida] = useState<string | null>(null);

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs_all"],
    queryFn: () => listarOrgs(),
  });

  const { data: gestoes = [] } = useQuery({
    queryKey: ["gestoes_all"],
    queryFn: () => listarGestoes(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["gestoes_all"] });

  const salvar = async () => {
    if (!form.org_id || !form.nome.trim() || !form.data_inicio || !form.data_fim) return;
    try {
      await criarGestao({
        data: {
          org_id: form.org_id,
          nome: form.nome.trim(),
          data_inicio: form.data_inicio,
          data_fim: form.data_fim,
          ativo: form.ativo,
        },
      });
      toast.success("Gestão criada.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    }
  };

  const nomeOrg = (id: string) =>
    orgs.find((o) => o.id === id)?.sigla ?? orgs.find((o) => o.id === id)?.nome ?? "—";

  const ord = useOrdenacao(gestoes, {
    corpo: (g) => nomeOrg(g.org_id),
    gestao: (g) => g.nome,
    periodo: (g) => g.data_inicio,
    status: (g) => (g.ativo ? 1 : 0),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  return (
    <>
      <PageHeader
        title="Gestões"
        description="Mandatos administrativos de cada corpo e seus ocupantes de cargo."
        actions={
          <Link to="/gestoes/cargos">
            <Button variant="outline">Cargos</Button>
          </Link>
        }
      />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Nova gestão</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div>
              <Label htmlFor="gestao-corpo">Corpo</Label>
              <Select value={form.org_id} onValueChange={(v) => setForm({ ...form, org_id: v })}>
                <SelectTrigger id="gestao-corpo">
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
            <div>
              <Label htmlFor="gestao-nome">Nome</Label>
              <Input
                id="gestao-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="2026-2028"
              />
            </div>
            <div>
              <Label htmlFor="gestao-inicio">Início</Label>
              <Input
                id="gestao-inicio"
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="gestao-fim">Fim</Label>
              <Input
                id="gestao-fim"
                type="date"
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={salvar}
                disabled={!form.org_id || !form.nome || !form.data_inicio || !form.data_fim}
                className="w-full"
              >
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
              <TableHeadOrdenavel campo="gestao" ord={ord}>
                Gestão
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="periodo" ord={ord}>
                Período
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="status" ord={ord}>
                Status
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gestoes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma gestão cadastrada.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((g) => (
              <Fragment key={g.id}>
                <TableRow>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandida(expandida === g.id ? null : g.id)}
                    >
                      {expandida === g.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>{nomeOrg(g.org_id)}</TableCell>
                  <TableCell className="font-medium">{g.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(g.data_inicio)} – {fmtDate(g.data_fim)}
                  </TableCell>
                  <TableCell>
                    {g.ativo ? <Badge>Atual</Badge> : <Badge variant="outline">Encerrada</Badge>}
                  </TableCell>
                </TableRow>
                {expandida === g.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30">
                      <OrganogramaPanel gestao={g} podeEditar={can.canManageIrmaos} />
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

function OrganogramaPanel({ gestao, podeEditar }: { gestao: Gestao; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ cargo_id: "", irmao_id: "" });

  const { data: ocupantes = [] } = useQuery({
    queryKey: ["gestao_cargos", gestao.id],
    queryFn: () => listarGestaoCargos({ data: { gestaoId: gestao.id } }),
  });

  const { data: cargos = [] } = useQuery({
    queryKey: ["cargos_disponiveis", gestao.org_id],
    queryFn: () => listarCargosDisponiveis({ data: { orgId: gestao.org_id } }),
  });

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["gestao_cargos", gestao.id] });

  const ordOcupantes = useOrdenacao(ocupantes, {
    cargo: (o) => o.cargos?.nome,
    irmao: (o) => o.irmaos?.nome_civil,
  });

  const adicionar = async () => {
    if (!novo.cargo_id || !novo.irmao_id) return;
    try {
      await criarGestaoCargo({
        data: { gestaoId: gestao.id, cargoId: novo.cargo_id, irmaoId: novo.irmao_id },
      });
      setNovo({ cargo_id: "", irmao_id: "" });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar.");
    }
  };

  const remover = async (id: string) => {
    try {
      await removerGestaoCargo({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <div className="py-2 space-y-3">
      <div className="text-sm font-medium">Organograma — {gestao.nome}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeadOrdenavel campo="cargo" ord={ordOcupantes}>
              Cargo
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="irmao" ord={ordOcupantes}>
              Irmão
            </TableHeadOrdenavel>
            {podeEditar && <TableHead className="w-10"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ocupantes.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground text-sm">
                Nenhum cargo ocupado ainda.
              </TableCell>
            </TableRow>
          )}
          {ordOcupantes.itensOrdenados.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{o.cargos?.nome}</TableCell>
              <TableCell>{o.irmaos?.nome_civil}</TableCell>
              {podeEditar && (
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => remover(o.id)}>
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
            <Label htmlFor="gestao-membro-cargo" className="text-xs">
              Cargo
            </Label>
            <Select value={novo.cargo_id} onValueChange={(v) => setNovo({ ...novo, cargo_id: v })}>
              <SelectTrigger id="gestao-membro-cargo" className="h-8">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {cargos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label htmlFor="gestao-membro-irmao" className="text-xs">
              Irmão
            </Label>
            <Select value={novo.irmao_id} onValueChange={(v) => setNovo({ ...novo, irmao_id: v })}>
              <SelectTrigger id="gestao-membro-irmao" className="h-8">
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
