import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarTabelaValores,
  criarValorVigente,
  excluirValorVigente,
  contarIrmaosParaReajuste,
  reajustarMensalidadeEmMassa,
  TIPOS_SUGERIDOS,
  type ValorVigente,
} from "@/lib/backend/tabela-valores";
import { listarOrgs } from "@/lib/backend/orgs";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";

export const Route = createFileRoute("/_authenticated/tesouraria/tabela-valores")({
  head: () => ({ meta: [{ title: "Tabela de Valores — Gestão Maçônica" }] }),
  component: TabelaValoresPage,
});

const TIPO_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_SUGERIDOS.map((t) => [t.valor, t.label]),
);

function rotuloTipo(tipo: string) {
  return TIPO_LABEL[tipo] ?? tipo;
}

function ehVigenteHoje(item: ValorVigente, todosDoMesmoTipo: ValorVigente[]) {
  const hoje = toISODate(new Date());
  const doGrupo = todosDoMesmoTipo.filter(
    (v) => v.tipo === item.tipo && v.org_id === item.org_id && v.vigencia_inicio <= hoje,
  );
  if (doGrupo.length === 0) return false;
  const maisRecente = doGrupo.reduce((a, b) => (a.vigencia_inicio > b.vigencia_inicio ? a : b));
  return maisRecente.id === item.id;
}

const FORM_VAZIO = {
  tipo: "mensalidade",
  tipoCustom: "",
  orgId: "global",
  valor: "",
  vigenciaInicio: toISODate(new Date()),
  observacoes: "",
};

function TabelaValoresPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const podeEditar = can.canManageFinancas;

  const { data: itens = [] } = useQuery({
    queryKey: ["tabela_valores"],
    queryFn: () => listarTabelaValores(),
  });
  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(itens);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tabela_valores"] });

  const salvar = async () => {
    const tipo = form.tipo === "outro" ? form.tipoCustom.trim() : form.tipo;
    const valor = Number(form.valor);
    if (!tipo || !valor) return toast.error("Preencha o tipo e o valor.");
    try {
      await criarValorVigente({
        data: {
          tipo,
          orgId: form.orgId === "global" ? null : form.orgId,
          valor,
          vigenciaInicio: form.vigenciaInicio,
          observacoes: form.observacoes || null,
        },
      });
      toast.success("Valor registrado.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirValorVigente({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  return (
    <>
      <PageHeader
        title="Tabela de Valores"
        description="Manutenção de valores com data de vigência — mensalidade, iniciação, troca de grau e outras taxas."
        actions={podeEditar ? <ReajustarMensalidadeDialog onDone={invalidate} /> : undefined}
      />

      {podeEditar && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Novo valor</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-6">
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_SUGERIDOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="outro">Outro…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === "outro" && (
              <div>
                <Label>Nome do tipo</Label>
                <Input
                  value={form.tipoCustom}
                  onChange={(e) => setForm({ ...form, tipoCustom: e.target.value })}
                />
              </div>
            )}
            <div>
              <Label>Corpo (opcional)</Label>
              <Select value={form.orgId} onValueChange={(v) => setForm({ ...form, orgId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (todos)</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
            <div>
              <Label>Vigência a partir de</Label>
              <Input
                type="date"
                value={form.vigenciaInicio}
                onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={salvar} disabled={!form.valor}>
                <Plus className="mr-1.5 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Corpo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Observações</TableHead>
              <TableHead></TableHead>
              {podeEditar && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  Nenhum valor cadastrado ainda.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((item) => {
              const vigente = ehVigenteHoje(item, itens);
              return (
                <TableRow key={item.id} className={!vigente ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">{rotuloTipo(item.tipo)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.org_nome ?? "Global"}
                  </TableCell>
                  <TableCell>{brl(item.valor)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(item.vigencia_inicio)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.observacoes ?? "—"}
                  </TableCell>
                  <TableCell>
                    {vigente && (
                      <Badge variant="secondary">
                        <TrendingUp className="mr-1 h-3 w-3" /> Vigente
                      </Badge>
                    )}
                  </TableCell>
                  {podeEditar && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => excluir(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
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

function ReajustarMensalidadeDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [novoValor, setNovoValor] = useState("");
  const [vigenciaInicio, setVigenciaInicio] = useState(toISODate(new Date()));
  const [observacoes, setObservacoes] = useState("");
  const [somenteValorAtual, setSomenteValorAtual] = useState("");
  const [contagem, setContagem] = useState<number | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const consultarContagem = async () => {
    setConsultando(true);
    try {
      const total = await contarIrmaosParaReajuste({
        data: { apenasComValorAtual: somenteValorAtual ? Number(somenteValorAtual) : null },
      });
      setContagem(total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao consultar.");
    } finally {
      setConsultando(false);
    }
  };

  const confirmar = async () => {
    const valor = Number(novoValor);
    if (!valor) return toast.error("Informe o novo valor.");
    setSalvando(true);
    try {
      const resultado = await reajustarMensalidadeEmMassa({
        data: {
          novoValor: valor,
          vigenciaInicio,
          observacoes: observacoes || null,
          apenasComValorAtual: somenteValorAtual ? Number(somenteValorAtual) : null,
        },
      });
      toast.success(`${resultado.irmaosAtualizados} irmão(s) atualizado(s).`);
      setOpen(false);
      setNovoValor("");
      setObservacoes("");
      setSomenteValorAtual("");
      setContagem(null);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reajustar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <TrendingUp className="mr-1.5 h-4 w-4" /> Reajustar mensalidade em massa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reajustar mensalidade em massa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            Atualiza o valor de mensalidade dos irmãos ativos/quites/irregulares a partir de agora.
            Mensalidades já geradas não são alteradas — só as próximas gerações usam o valor novo.
          </p>
          <div>
            <Label>Novo valor</Label>
            <Input
              type="number"
              step="0.01"
              value={novoValor}
              onChange={(e) => setNovoValor(e.target.value)}
            />
          </div>
          <div>
            <Label>Vigência a partir de</Label>
            <Input
              type="date"
              value={vigenciaInicio}
              onChange={(e) => setVigenciaInicio(e.target.value)}
            />
          </div>
          <div>
            <Label>Só atualizar quem está no valor (opcional)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Deixe em branco para atualizar todos"
              value={somenteValorAtual}
              onChange={(e) => {
                setSomenteValorAtual(e.target.value);
                setContagem(null);
              }}
            />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={consultarContagem} disabled={consultando}>
            Consultar quantos irmãos serão afetados
          </Button>
          {contagem !== null && (
            <p className="text-sm font-medium">{contagem} irmão(s) serão atualizados.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={salvando || !novoValor}>
            Confirmar reajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
