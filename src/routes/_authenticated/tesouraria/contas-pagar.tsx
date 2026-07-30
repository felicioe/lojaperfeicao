import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tesouraria/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar — Gestão Maçônica" }] }),
  component: ContasPagar,
});

const SELECT_COLS = "id,data,data_vencimento,data_pagamento,descricao,valor,pago,forma_pagamento,plano_contas(codigo,nome),terceiros(nome),contas_financeiras!lancamentos_conta_id_fkey(nome)";

function ContasPagar() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;
  const [openNova, setOpenNova] = useState(false);

  const { data: abertas = [], isLoading } = useQuery({
    queryKey: ["contas_pagar_abertas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos").select(SELECT_COLS).eq("tipo", "saida").eq("pago", false).order("data_vencimento");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: pagas = [] } = useQuery({
    queryKey: ["contas_pagar_pagas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos").select(SELECT_COLS).eq("tipo", "saida").eq("pago", true).order("data_pagamento", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["contas_pagar_abertas"] });
    qc.invalidateQueries({ queryKey: ["contas_pagar_pagas"] });
  };

  const hoje = toISODate(new Date());
  const totalAberto = abertas.reduce((s, l) => s + Number(l.valor), 0);

  return (
    <>
      <PageHeader
        title="Contas a Pagar"
        description="Despesas provisionadas com baixa em conta bancária e postagem contábil automática."
        actions={
          podeEditar && (
            <Dialog open={openNova} onOpenChange={setOpenNova}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova conta a pagar</Button></DialogTrigger>
              <NovaContaPagarDialog onDone={() => { setOpenNova(false); invalidate(); }} />
            </Dialog>
          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="text-sm text-muted-foreground">Total em aberto</div>
        <div className="text-2xl font-semibold">{brl(totalAberto)}</div>
      </Card>

      <Tabs defaultValue="abertas">
        <TabsList className="mb-4">
          <TabsTrigger value="abertas">Em aberto</TabsTrigger>
          <TabsTrigger value="pagas">Pagas</TabsTrigger>
        </TabsList>

        <TabsContent value="abertas">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && abertas.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma conta em aberto.</TableCell></TableRow>
                )}
                {abertas.map((l) => {
                  const vencida = l.data_vencimento && l.data_vencimento < hoje;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{fmtDate(l.data_vencimento)}</TableCell>
                      <TableCell>{l.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">{l.plano_contas?.nome ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{l.terceiros?.nome ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{brl(l.valor)}</TableCell>
                      <TableCell>{vencida ? <Badge variant="destructive">Vencida</Badge> : <Badge variant="outline">Aberta</Badge>}</TableCell>
                      {podeEditar && (
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="ghost"><CheckCircle2 className="h-4 w-4 mr-1" /> Baixar</Button>
                            </DialogTrigger>
                            <BaixarContaPagarDialog lancamento={l} onDone={invalidate} />
                          </Dialog>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="pagas">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagas.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhuma conta paga ainda.</TableCell></TableRow>
                )}
                {pagas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{fmtDate(l.data_pagamento)}</TableCell>
                    <TableCell>{l.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">{l.plano_contas?.nome ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.contas_financeiras?.nome ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.forma_pagamento ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{brl(l.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function NovaContaPagarDialog({ onDone }: { onDone: () => void }) {
  const [d, setD] = useState({
    descricao: "", valor: 0, plano_conta_id: "", terceiro_id: "none",
    data: toISODate(new Date()), data_vencimento: toISODate(new Date()), observacoes: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos_despesa"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plano_contas").select("id,codigo,nome").eq("tipo", "despesa").eq("analitica", true).eq("ativo", true).order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string }[];
    },
  });

  const { data: terceiros = [] } = useQuery({
    queryKey: ["terceiros_fornecedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terceiros").select("id,nome").in("tipo", ["fornecedor", "ambos"]).eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const salvar = async () => {
    if (!d.descricao.trim() || !d.valor || !d.plano_conta_id) return;
    setSaving(true);
    const { error } = await supabase.rpc("criar_conta_pagar", {
      _descricao: d.descricao.trim(),
      _valor: Number(d.valor),
      _plano_conta_id: d.plano_conta_id,
      _data: d.data,
      _data_vencimento: d.data_vencimento,
      _terceiro_id: d.terceiro_id === "none" ? null : d.terceiro_id,
      _observacoes: d.observacoes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Conta a pagar registrada e provisão contábil lançada.");
    onDone();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Nova conta a pagar</DialogTitle></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Label>Descrição</Label><Input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} /></div>
        <div><Label>Valor</Label><Input type="number" step="0.01" min="0" value={d.valor} onChange={(e) => setD({ ...d, valor: Number(e.target.value) })} /></div>
        <div>
          <Label>Categoria</Label>
          <Select value={d.plano_conta_id} onValueChange={(v) => setD({ ...d, plano_conta_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Fornecedor (opcional)</Label>
          <Select value={d.terceiro_id} onValueChange={(v) => setD({ ...d, terceiro_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— nenhum —</SelectItem>
              {terceiros.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Emissão</Label><Input type="date" value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} /></div>
        <div><Label>Vencimento</Label><Input type="date" value={d.data_vencimento} onChange={(e) => setD({ ...d, data_vencimento: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>Observações</Label><Textarea value={d.observacoes} onChange={(e) => setD({ ...d, observacoes: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving || !d.descricao || !d.valor || !d.plano_conta_id}>Registrar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function BaixarContaPagarDialog({ lancamento, onDone }: { lancamento: any; onDone: () => void }) {
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(toISODate(new Date()));
  const [saving, setSaving] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_financeiras").select("id,nome,plano_conta_id").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; plano_conta_id: string | null }[];
    },
  });

  const baixar = async () => {
    if (!contaFinanceiraId) return toast.error("Selecione a conta que pagou.");
    setSaving(true);
    const { error } = await supabase.rpc("baixar_conta_pagar", {
      _lancamento_id: lancamento.id,
      _conta_financeira_id: contaFinanceiraId,
      _forma_pagamento: formaPagamento || null,
      _data_pagamento: dataPagamento,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Baixa registrada e lançamento contábil postado.");
    onDone();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Baixar: {lancamento.descricao}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm text-muted-foreground">Valor: <span className="font-medium text-foreground">{brl(lancamento.valor)}</span></div>
        <div>
          <Label>Conta que pagou</Label>
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
        <div>
          <Label>Forma de pagamento</Label>
          <Input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="PIX, boleto, débito…" />
        </div>
        <div>
          <Label>Data do pagamento</Label>
          <Input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={baixar} disabled={saving || !contaFinanceiraId}>Confirmar baixa</Button>
      </DialogFooter>
    </DialogContent>
  );
}
