import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarOrcamentos,
  listarOrcamentoItens,
  listarContasOrcamento,
  listarRealizadoAnual,
  criarOrcamento,
  definirValorOrcamento,
  aprovarOrcamento,
  reabrirOrcamento,
} from "@/lib/backend/contabilidade-orcamento";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Lock, Plus, Unlock } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl } from "@/lib/format";
import { mensagemDeErro } from "@/lib/erro";

export const Route = createFileRoute("/_authenticated/contabilidade/orcamento")({
  head: () => ({ meta: [{ title: "Orçamento Anual — Gestão Maçônica" }] }),
  component: Orcamento,
});

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function Orcamento() {
  const can = useCan();
  const qc = useQueryClient();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoAno, setNovoAno] = useState(String(new Date().getFullYear() + 1));
  const [novoObs, setNovoObs] = useState("");

  const { data: orcamentos = [] } = useQuery({
    queryKey: ["orcamentos"],
    queryFn: () => listarOrcamentos(),
  });

  const selecionado = orcamentos.find((o) => o.id === selecionadoId) ?? orcamentos[0] ?? null;

  const { data: contas = [] } = useQuery({
    queryKey: ["plano_contas_orcamento"],
    queryFn: () => listarContasOrcamento(),
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["orcamento_itens", selecionado?.id],
    enabled: !!selecionado,
    queryFn: () => listarOrcamentoItens({ data: { orcamentoId: selecionado!.id } }),
  });

  const { data: realizado = [] } = useQuery({
    queryKey: ["orcamento_realizado", selecionado?.ano],
    enabled: !!selecionado,
    queryFn: () => listarRealizadoAnual({ data: { ano: selecionado!.ano } }),
  });

  const valorMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of itens) m.set(`${it.conta_id}:${it.mes}`, Number(it.valor));
    return m;
  }, [itens]);

  const realizadoPorMes = useMemo(() => {
    const receita = Array(12).fill(0);
    const despesa = Array(12).fill(0);
    for (const it of realizado) {
      const mes = new Date(it.data + "T00:00:00").getMonth();
      if (it.conta_tipo === "receita") {
        receita[mes] += it.tipo === "credito" ? Number(it.valor) : -Number(it.valor);
      } else {
        despesa[mes] += it.tipo === "debito" ? Number(it.valor) : -Number(it.valor);
      }
    }
    return { receita, despesa };
  }, [realizado]);

  const orcadoPorMes = useMemo(() => {
    const receita = Array(12).fill(0);
    const despesa = Array(12).fill(0);
    for (const it of itens) {
      const conta = contas.find((c) => c.id === it.conta_id);
      if (!conta) continue;
      const arr = conta.tipo === "receita" ? receita : despesa;
      arr[it.mes - 1] += Number(it.valor);
    }
    return { receita, despesa };
  }, [itens, contas]);

  const criarMutation = useMutation({
    mutationFn: () =>
      criarOrcamento({ data: { ano: Number(novoAno), observacoes: novoObs || null } }),
    onSuccess: () => {
      toast.success("Orçamento criado");
      setNovoOpen(false);
      setNovoObs("");
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao criar orçamento")),
  });

  const salvarValorMutation = useMutation({
    mutationFn: ({ contaId, mes, valor }: { contaId: string; mes: number; valor: number }) =>
      definirValorOrcamento({ data: { orcamentoId: selecionado!.id, contaId, mes, valor } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orcamento_itens", selecionado?.id] }),
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao salvar valor")),
  });

  const aprovarMutation = useMutation({
    mutationFn: () => aprovarOrcamento({ data: { orcamentoId: selecionado!.id } }),
    onSuccess: () => {
      toast.success("Orçamento aprovado");
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao aprovar")),
  });

  const reabrirMutation = useMutation({
    mutationFn: () => reabrirOrcamento({ data: { orcamentoId: selecionado!.id } }),
    onSuccess: () => {
      toast.success("Orçamento reaberto para edição");
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao reabrir")),
  });

  const contasReceita = contas.filter((c) => c.tipo === "receita");
  const contasDespesa = contas.filter((c) => c.tipo === "despesa");
  const editavel = selecionado?.status === "rascunho";

  return (
    <>
      <PageHeader
        title="Orçamento Anual"
        description="Planejamento orçamentário por conta e mês, com fluxo de aprovação e DRE orçado."
        actions={
          can.canManageFinancas && (
            <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" /> Novo orçamento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo orçamento anual</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="orcamento-novo-ano">Ano</Label>
                    <Input
                      id="orcamento-novo-ano"
                      type="number"
                      value={novoAno}
                      onChange={(e) => setNovoAno(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="orcamento-novo-obs">Observações</Label>
                    <Textarea
                      id="orcamento-novo-obs"
                      value={novoObs}
                      onChange={(e) => setNovoObs(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => criarMutation.mutate()} disabled={criarMutation.isPending}>
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div className="md:col-span-2">
          <Label htmlFor="orcamento-selecionado">Orçamento</Label>
          <Select value={selecionado?.id ?? ""} onValueChange={setSelecionadoId}>
            <SelectTrigger id="orcamento-selecionado">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {orcamentos.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.ano} {o.status === "aprovado" ? "— aprovado" : "— rascunho"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selecionado && (
          <div className="md:col-span-2 flex items-center gap-2">
            {selecionado.status === "aprovado" ? (
              <Badge className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado
              </Badge>
            ) : (
              <Badge variant="outline">Rascunho</Badge>
            )}
            {can.isAdmin && selecionado.status === "rascunho" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => aprovarMutation.mutate()}
                disabled={aprovarMutation.isPending}
              >
                <Lock className="h-3.5 w-3.5 mr-1" /> Aprovar
              </Button>
            )}
            {can.isAdmin && selecionado.status === "aprovado" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => reabrirMutation.mutate()}
                disabled={reabrirMutation.isPending}
              >
                <Unlock className="h-3.5 w-3.5 mr-1" /> Reabrir
              </Button>
            )}
          </div>
        )}
      </Card>

      {!selecionado && (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum orçamento cadastrado ainda.
        </Card>
      )}

      {selecionado && (
        <Tabs defaultValue="valores">
          <TabsList>
            <TabsTrigger value="valores">Valores Orçados</TabsTrigger>
            <TabsTrigger value="acompanhamento">Acompanhamento Mensal</TabsTrigger>
          </TabsList>

          <TabsContent value="valores" className="space-y-4">
            {(["receita", "despesa"] as const).map((tipo) => {
              const lista = tipo === "receita" ? contasReceita : contasDespesa;
              return (
                <Card key={tipo} className="overflow-x-auto">
                  <div className="p-3 border-b font-medium">
                    {tipo === "receita" ? "Receitas" : "Despesas"}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background">Conta</TableHead>
                        {MESES.map((m) => (
                          <TableHead key={m} className="text-right w-24">
                            {m}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lista.map((c) => {
                        const totalConta = Array.from(
                          { length: 12 },
                          (_, i) => valorMap.get(`${c.id}:${i + 1}`) ?? 0,
                        ).reduce((s, v) => s + v, 0);
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="sticky left-0 bg-background font-mono text-xs">
                              {c.codigo} {c.nome}
                            </TableCell>
                            {MESES.map((_, i) => (
                              <ValorCell
                                key={i}
                                valor={valorMap.get(`${c.id}:${i + 1}`) ?? 0}
                                editavel={!!editavel && !!can.canManageFinancas}
                                onSave={(v) =>
                                  salvarValorMutation.mutate({
                                    contaId: c.id,
                                    mes: i + 1,
                                    valor: v,
                                  })
                                }
                              />
                            ))}
                            <TableCell className="text-right font-medium">
                              {brl(totalConta)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {lista.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={14}
                            className="text-center py-4 text-muted-foreground"
                          >
                            Nenhuma conta analítica de {tipo} cadastrada.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="acompanhamento">
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receita Orçada</TableHead>
                    <TableHead className="text-right">Receita Real</TableHead>
                    <TableHead className="text-right">Despesa Orçada</TableHead>
                    <TableHead className="text-right">Despesa Real</TableHead>
                    <TableHead className="text-right">Resultado Orçado</TableHead>
                    <TableHead className="text-right">Resultado Real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MESES.map((m, i) => (
                    <TableRow key={m}>
                      <TableCell>{m}</TableCell>
                      <TableCell className="text-right">{brl(orcadoPorMes.receita[i])}</TableCell>
                      <TableCell className="text-right">
                        {brl(realizadoPorMes.receita[i])}
                      </TableCell>
                      <TableCell className="text-right">{brl(orcadoPorMes.despesa[i])}</TableCell>
                      <TableCell className="text-right">
                        {brl(realizadoPorMes.despesa[i])}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(orcadoPorMes.receita[i] - orcadoPorMes.despesa[i])}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(realizadoPorMes.receita[i] - realizadoPorMes.despesa[i])}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell>Total do ano</TableCell>
                    <TableCell className="text-right">
                      {brl(orcadoPorMes.receita.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(realizadoPorMes.receita.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(orcadoPorMes.despesa.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(realizadoPorMes.despesa.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(
                        orcadoPorMes.receita.reduce((s, v) => s + v, 0) -
                          orcadoPorMes.despesa.reduce((s, v) => s + v, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(
                        realizadoPorMes.receita.reduce((s, v) => s + v, 0) -
                          realizadoPorMes.despesa.reduce((s, v) => s + v, 0),
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function ValorCell({
  valor,
  editavel,
  onSave,
}: {
  valor: number;
  editavel: boolean;
  onSave: (v: number) => void;
}) {
  const [local, setLocal] = useState(valor > 0 ? String(valor) : "");

  useEffect(() => {
    setLocal(valor > 0 ? String(valor) : "");
  }, [valor]);

  if (!editavel) {
    return <TableCell className="text-right">{valor > 0 ? brl(valor) : "—"}</TableCell>;
  }

  return (
    <TableCell className="p-1">
      <Input
        type="number"
        step="0.01"
        className="text-right h-8 w-24"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const num = Number(local || 0);
          if (num !== valor) onSave(num);
        }}
      />
    </TableCell>
  );
}
