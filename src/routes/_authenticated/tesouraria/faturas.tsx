import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, Plus, Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tesouraria/faturas")({
  head: () => ({ meta: [{ title: "Faturas — Gestão Maçônica" }] }),
  component: Faturas,
});

type Rateio = { conta_id: string; percentual: number };

function RateioBuilder({ rateio, setRateio, receitas }: { rateio: Rateio[]; setRateio: (r: Rateio[]) => void; receitas: { id: string; codigo: string; nome: string }[] }) {
  const total = rateio.reduce((s, r) => s + Number(r.percentual || 0), 0);
  const add = () => setRateio([...rateio, { conta_id: "", percentual: 0 }]);
  const update = (i: number, patch: Partial<Rateio>) => setRateio(rateio.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRateio(rateio.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 md:col-span-4">
      <div className="flex items-center justify-between">
        <Label>Rateio entre contas de receita (opcional — vazio usa 100% Mensalidades)</Label>
        <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="h-3 w-3 mr-1" /> Linha</Button>
      </div>
      {rateio.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={r.conta_id} onValueChange={(v) => update(i, { conta_id: v })}>
            <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Conta de receita…" /></SelectTrigger>
            <SelectContent>{receitas.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" step="0.01" className="h-8 w-24" value={r.percentual} onChange={(e) => update(i, { percentual: Number(e.target.value) })} placeholder="%" />
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      {rateio.length > 0 && (
        <div className={`text-xs ${Math.abs(total - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
          Soma: {total.toFixed(2)}% {Math.abs(total - 100) > 0.01 && "— precisa somar 100%"}
        </div>
      )}
    </div>
  );
}

function Faturas() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;

  const { data: receitas = [] } = useQuery({
    queryKey: ["planos_receita"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plano_contas").select("id,codigo,nome").eq("tipo", "receita").eq("analitica", true).eq("ativo", true).order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string }[];
    },
  });

  const { data: abertas = [] } = useQuery({
    queryKey: ["faturas_abertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos")
        .select("id,irmao_id,descricao,valor,data_vencimento,competencia_mes,irmaos(nome_civil,telefone,celular)")
        .eq("tipo", "entrada").eq("is_mensalidade", true).eq("pago", false)
        .order("data_vencimento");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [openBaixa, setOpenBaixa] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["faturas_abertas"] });
    setSelecionadas([]);
  };

  const irmaoSelecionadoId = abertas.find((f) => f.id === selecionadas[0])?.irmao_id;
  const toggleSelecionada = (f: any) => {
    if (selecionadas.includes(f.id)) {
      setSelecionadas(selecionadas.filter((id) => id !== f.id));
      return;
    }
    if (irmaoSelecionadoId && f.irmao_id !== irmaoSelecionadoId) {
      toast.info("A baixa agrupada precisa ser de faturas do mesmo irmão — seleção reiniciada.");
      setSelecionadas([f.id]);
      return;
    }
    setSelecionadas([...selecionadas, f.id]);
  };
  const faturasSelecionadas = abertas.filter((f) => selecionadas.includes(f.id));

  return (
    <>
      <PageHeader title="Faturas" description="Emissão de mensalidades individual e em lote, com rateio contábil." />

      <Tabs defaultValue="lote">
        <TabsList className="mb-4">
          <TabsTrigger value="lote">Emissão em lote</TabsTrigger>
          <TabsTrigger value="individual">Emissão individual</TabsTrigger>
          <TabsTrigger value="abertas">Em aberto</TabsTrigger>
        </TabsList>

        <TabsContent value="lote">
          {podeEditar ? <LoteForm receitas={receitas} onDone={invalidate} /> : <SemPermissao />}
        </TabsContent>

        <TabsContent value="individual">
          {podeEditar ? <IndividualForm receitas={receitas} onDone={invalidate} /> : <SemPermissao />}
        </TabsContent>

        <TabsContent value="abertas">
          {podeEditar && selecionadas.length > 0 && (
            <Card className="mb-4 p-4 flex items-center justify-between">
              <div className="text-sm">{selecionadas.length} fatura(s) selecionada(s) — total {brl(faturasSelecionadas.reduce((s, f) => s + Number(f.valor), 0))}</div>
              <Dialog open={openBaixa} onOpenChange={setOpenBaixa}>
                <DialogTrigger asChild><Button><CheckCircle2 className="h-4 w-4 mr-1" /> Baixar selecionadas</Button></DialogTrigger>
                <BaixaDialog faturas={faturasSelecionadas} onDone={() => { setOpenBaixa(false); invalidate(); }} />
              </Dialog>
            </Card>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  {podeEditar && <TableHead className="w-10"></TableHead>}
                  <TableHead>Irmão</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Cobrança</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abertas.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma fatura em aberto.</TableCell></TableRow>
                )}
                {abertas.map((f) => {
                  const fone = (f.irmaos?.celular || f.irmaos?.telefone || "").replace(/\D/g, "");
                  const msg = `Olá, ${f.irmaos?.nome_civil}! Sua fatura "${f.descricao}" no valor de ${brl(f.valor)} vence em ${fmtDate(f.data_vencimento)}.`;
                  return (
                    <TableRow key={f.id}>
                      {podeEditar && (
                        <TableCell>
                          <Checkbox checked={selecionadas.includes(f.id)} onCheckedChange={() => toggleSelecionada(f)} />
                        </TableCell>
                      )}
                      <TableCell>{f.irmaos?.nome_civil ?? "—"}</TableCell>
                      <TableCell>{f.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(f.competencia_mes)}</TableCell>
                      <TableCell>{fmtDate(f.data_vencimento)}</TableCell>
                      <TableCell className="text-right font-medium">{brl(f.valor)}</TableCell>
                      <TableCell className="text-right">
                        {fone && (
                          <a href={`https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="ghost"><MessageCircle className="h-4 w-4" /></Button>
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function BaixaDialog({ faturas, onDone }: { faturas: any[]; onDone: () => void }) {
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(toISODate(new Date()));
  const [desconto, setDesconto] = useState(0);
  const [observacoes, setObservacoes] = useState("");
  const [calculos, setCalculos] = useState<Record<string, { multa: number; juros: number; dias_atraso: number; total: number }>>({});
  const [salvando, setSalvando] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_financeiras").select("id,nome,plano_conta_id").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; plano_conta_id: string | null }[];
    },
  });

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(faturas.map(async (f) => {
        const { data } = await supabase.rpc("calcular_multa_juros", { _valor: f.valor, _vencimento: f.data_vencimento, _data_referencia: dataPagamento });
        return [f.id, (data as any)?.[0] ?? { multa: 0, juros: 0, dias_atraso: 0, total: f.valor }] as const;
      }));
      setCalculos(Object.fromEntries(entries));
    })();
  }, [faturas, dataPagamento]);

  const somaOriginal = faturas.reduce((s, f) => s + Number(f.valor), 0);
  const somaMulta = Object.values(calculos).reduce((s, c) => s + Number(c.multa), 0);
  const somaJuros = Object.values(calculos).reduce((s, c) => s + Number(c.juros), 0);
  const totalLiquido = somaOriginal + somaMulta + somaJuros - Number(desconto || 0);

  const confirmar = async () => {
    if (!contaFinanceiraId) return toast.error("Selecione a conta que recebeu o pagamento.");
    setSalvando(true);
    const { error } = await supabase.rpc("baixar_faturas", {
      _lancamento_ids: faturas.map((f) => f.id),
      _conta_financeira_id: contaFinanceiraId,
      _forma_pagamento: formaPagamento || null,
      _data_pagamento: dataPagamento,
      _desconto: Number(desconto) || 0,
      _observacoes: observacoes || null,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Baixa registrada, recibo emitido e lançamento contábil postado.");
    onDone();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Baixar {faturas.length} fatura(s)</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="border rounded-md divide-y">
          {faturas.map((f) => {
            const c = calculos[f.id];
            return (
              <div key={f.id} className="p-2 text-sm flex justify-between">
                <span>{f.descricao} {c?.dias_atraso > 0 && <span className="text-destructive">({c.dias_atraso}d atraso)</span>}</span>
                <span>{brl(f.valor)}{c && (c.multa > 0 || c.juros > 0) ? ` + ${brl(c.multa + c.juros)}` : ""}</span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>Multa: {brl(somaMulta)}</div>
          <div>Juros: {brl(somaJuros)}</div>
        </div>
        <div>
          <Label>Conta que recebeu</Label>
          <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id} disabled={!c.plano_conta_id}>
                  {c.nome}{!c.plano_conta_id ? " (sem categoria contábil vinculada)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Forma de pagamento</Label><Input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="PIX, dinheiro…" /></div>
          <div><Label>Data do pagamento</Label><Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} /></div>
        </div>
        <div><Label>Desconto (opcional)</Label><Input type="number" step="0.01" min="0" value={desconto} onChange={(e) => setDesconto(Number(e.target.value))} /></div>
        <div><Label>Observações</Label><Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>
        <div className="text-lg font-semibold flex justify-between border-t pt-3">
          <span>Total líquido</span><span>{brl(totalLiquido)}</span>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={confirmar} disabled={salvando || !contaFinanceiraId || totalLiquido < 0}>Confirmar baixa</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SemPermissao() {
  return <Card className="p-6 text-center text-muted-foreground">Apenas administradores e tesoureiros podem emitir faturas.</Card>;
}

function LoteForm({ receitas, onDone }: { receitas: { id: string; codigo: string; nome: string }[]; onDone: () => void }) {
  const [competencia, setCompetencia] = useState(toISODate(new Date()).slice(0, 7) + "-01");
  const [vencimento, setVencimento] = useState("");
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [gerando, setGerando] = useState(false);

  const { data: preview = [] } = useQuery({
    queryKey: ["preview_lote", competencia],
    queryFn: async () => {
      const { data: irmaosAtivos, error } = await supabase
        .from("irmaos").select("id,nome_civil,valor_mensalidade")
        .in("situacao", ["ativo", "quite", "irregular"]).gt("valor_mensalidade", 0);
      if (error) throw error;
      const { data: jaGerados } = await supabase.from("lancamentos").select("irmao_id").eq("is_mensalidade", true).eq("competencia_mes", competencia);
      const gerados = new Set((jaGerados ?? []).map((l: any) => l.irmao_id));
      return (irmaosAtivos ?? []).filter((i: any) => !gerados.has(i.id));
    },
  });

  const gerar = async () => {
    if (rateio.length > 0 && Math.abs(rateio.reduce((s, r) => s + Number(r.percentual || 0), 0) - 100) > 0.01) {
      return toast.error("O rateio precisa somar 100%.");
    }
    setGerando(true);
    const { data, error } = await supabase.rpc("gerar_mensalidades", {
      _competencia: competencia,
      _data_vencimento: vencimento || null,
      _rateio: rateio.length > 0 ? rateio : null,
    });
    setGerando(false);
    if (error) return toast.error(error.message);
    toast.success(`${data ?? 0} fatura(s) gerada(s).`);
    onDone();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Gerar mensalidades do mês</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div><Label>Competência</Label><Input type="month" value={competencia.slice(0, 7)} onChange={(e) => setCompetencia(e.target.value + "-01")} /></div>
        <div><Label>Vencimento (opcional)</Label><Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
        <RateioBuilder rateio={rateio} setRateio={setRateio} receitas={receitas} />

        <div className="md:col-span-4 text-sm text-muted-foreground">
          {preview.length} irmão(s) serão cobrados nesta emissão (situação ativa/quite/irregular, com mensalidade &gt; 0, ainda sem fatura para esta competência).
        </div>
        {preview.length > 0 && (
          <div className="md:col-span-4 max-h-40 overflow-y-auto border rounded-md">
            <Table>
              <TableBody>
                {preview.map((i: any) => (
                  <TableRow key={i.id}><TableCell>{i.nome_civil}</TableCell><TableCell className="text-right">{brl(i.valor_mensalidade)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="md:col-span-4">
          <Button onClick={gerar} disabled={gerando || preview.length === 0}>Gerar {preview.length > 0 ? `(${preview.length})` : ""}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IndividualForm({ receitas, onDone }: { receitas: { id: string; codigo: string; nome: string }[]; onDone: () => void }) {
  const [irmaoId, setIrmaoId] = useState("");
  const [valor, setValor] = useState(0);
  const [competencia, setCompetencia] = useState(toISODate(new Date()).slice(0, 7) + "-01");
  const [vencimento, setVencimento] = useState(toISODate(new Date()));
  const [descricao, setDescricao] = useState("");
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [salvando, setSalvando] = useState(false);

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("irmaos").select("id,nome_civil").order("nome_civil");
      if (error) throw error;
      return (data ?? []) as { id: string; nome_civil: string }[];
    },
  });

  const salvar = async () => {
    if (!irmaoId || !valor) return;
    if (rateio.length > 0 && Math.abs(rateio.reduce((s, r) => s + Number(r.percentual || 0), 0) - 100) > 0.01) {
      return toast.error("O rateio precisa somar 100%.");
    }
    setSalvando(true);
    const { error } = await supabase.rpc("criar_fatura_avulsa", {
      _irmao_id: irmaoId,
      _valor: Number(valor),
      _competencia_mes: competencia,
      _data_vencimento: vencimento,
      _descricao: descricao || null,
      _rateio: rateio.length > 0 ? rateio : null,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Fatura criada e provisão contábil lançada.");
    setValor(0);
    setDescricao("");
    setRateio([]);
    onDone();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Nova fatura avulsa</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label>Irmão</Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{irmaos.map((i) => <SelectItem key={i.id} value={i.id}>{i.nome_civil}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Valor</Label><Input type="number" step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} /></div>
        <div><Label>Competência</Label><Input type="month" value={competencia.slice(0, 7)} onChange={(e) => setCompetencia(e.target.value + "-01")} /></div>
        <div><Label>Vencimento</Label><Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
        <div className="md:col-span-3"><Label>Descrição (opcional)</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        <RateioBuilder rateio={rateio} setRateio={setRateio} receitas={receitas} />
        <div className="md:col-span-4">
          <Button onClick={salvar} disabled={salvando || !irmaoId || !valor}>Criar fatura</Button>
        </div>
      </CardContent>
    </Card>
  );
}
