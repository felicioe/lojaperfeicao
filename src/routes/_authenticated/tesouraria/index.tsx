import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/lib/auth-hooks";
import { Plus, CheckCircle2, Repeat } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tesouraria/")({
  head: () => ({ meta: [{ title: "Tesouraria — Gestão Maçônica" }] }),
  component: Tesouraria,
});

function Tesouraria() {
  const qc = useQueryClient();
  const can = useCan();
  const [openLanc, setOpenLanc] = useState(false);
  const [openTransf, setOpenTransf] = useState(false);

  const contas = useQuery({
    queryKey: ["contas"],
    queryFn: async () => (await supabase.from("contas_financeiras").select("*").eq("ativo", true).order("nome")).data ?? [],
  });
  const planos = useQuery({
    queryKey: ["planos"],
    queryFn: async () => (await supabase.from("plano_contas").select("*").eq("ativo", true).order("codigo")).data ?? [],
  });
  const lancamentos = useQuery({
    queryKey: ["lancamentos"],
    queryFn: async () =>
      (await supabase.from("lancamentos").select("*, contas_financeiras!lancamentos_conta_id_fkey(nome), destino:contas_financeiras!lancamentos_conta_destino_id_fkey(nome), plano_contas(nome)").order("data", { ascending: false }).limit(200)).data ?? [],
  });

  const marcarPago = async (id: string) => {
    const { error } = await supabase.from("lancamentos").update({ pago: true, data_pagamento: toISODate(new Date()) }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
    toast.success("Lançamento pago.");
  };

  const gerarMensalidades = async () => {
    const hoje = new Date();
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
    const { data, error } = await supabase.rpc("gerar_mensalidades", { _competencia: comp });
    if (error) return toast.error(error.message);
    toast.success(`${data ?? 0} mensalidade(s) geradas para ${comp.slice(0, 7)}.`);
    qc.invalidateQueries({ queryKey: ["lancamentos"] });
  };

  return (
    <>
      <PageHeader
        title="Tesouraria"
        description="Movimento financeiro, transferências e mensalidades."
        actions={
          can.canManageFinancas && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={gerarMensalidades}>
                <Repeat className="h-4 w-4 mr-1" /> Gerar mensalidades do mês
              </Button>
              <Dialog open={openTransf} onOpenChange={setOpenTransf}>
                <DialogTrigger asChild><Button variant="outline">Transferência</Button></DialogTrigger>
                <TransferenciaDialog contas={contas.data ?? []} onDone={() => { setOpenTransf(false); qc.invalidateQueries({ queryKey: ["lancamentos"] }); }} />
              </Dialog>
              <Dialog open={openLanc} onOpenChange={setOpenLanc}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Novo lançamento</Button></DialogTrigger>
                <LancamentoDialog contas={contas.data ?? []} planos={planos.data ?? []} onDone={() => { setOpenLanc(false); qc.invalidateQueries({ queryKey: ["lancamentos"] }); }} />
              </Dialog>
            </div>
          )
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos lançamentos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lancamentos.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhum lançamento.</TableCell></TableRow>
              )}
              {(lancamentos.data ?? []).map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{fmtDate(l.data)}</TableCell>
                  <TableCell>{l.descricao}</TableCell>
                  <TableCell>
                    {l.contas_financeiras?.nome ?? "—"}
                    {l.destino?.nome && <span className="text-muted-foreground"> → {l.destino.nome}</span>}
                  </TableCell>
                  <TableCell>{l.plano_contas?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={l.tipo === "entrada" ? "default" : l.tipo === "saida" ? "destructive" : "secondary"}>
                      {l.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{brl(l.valor)}</TableCell>
                  <TableCell>
                    {l.pago ? <Badge variant="secondary">Pago</Badge> : <Badge variant="outline">Aberto</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!l.pago && can.canManageFinancas && (
                      <Button size="sm" variant="ghost" onClick={() => marcarPago(l.id)}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function LancamentoDialog({ contas, planos, onDone }: any) {
  const [d, setD] = useState({
    data: toISODate(new Date()),
    data_vencimento: toISODate(new Date()),
    descricao: "",
    valor: 0,
    tipo: "saida",
    conta_id: contas[0]?.id ?? "",
    plano_conta_id: "",
    pago: true,
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const payload: any = { ...d, valor: Number(d.valor) };
    if (!payload.plano_conta_id) delete payload.plano_conta_id;
    if (payload.pago) payload.data_pagamento = payload.data;
    const { error } = await supabase.from("lancamentos").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lançamento salvo.");
    onDone();
  };
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Tipo</Label>
          <Select value={d.tipo} onValueChange={(v) => setD({ ...d, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Valor</Label>
          <Input type="number" step="0.01" min="0" value={d.valor} onChange={(e) => setD({ ...d, valor: Number(e.target.value) })} />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição</Label>
          <Input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
        </div>
        <div>
          <Label>Data</Label>
          <Input type="date" value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} />
        </div>
        <div>
          <Label>Vencimento</Label>
          <Input type="date" value={d.data_vencimento} onChange={(e) => setD({ ...d, data_vencimento: e.target.value })} />
        </div>
        <div>
          <Label>Conta</Label>
          <Select value={d.conta_id} onValueChange={(v) => setD({ ...d, conta_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>{contas.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Categoria (plano de contas)</Label>
          <Select value={d.plano_conta_id} onValueChange={(v) => setD({ ...d, plano_conta_id: v })}>
            <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>{planos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex items-center gap-2">
          <input id="pago" type="checkbox" checked={d.pago} onChange={(e) => setD({ ...d, pago: e.target.checked })} />
          <Label htmlFor="pago" className="cursor-pointer">Já pago/recebido</Label>
        </div>
        <div className="md:col-span-2">
          <Label>Observações</Label>
          <Textarea value={d.observacoes} onChange={(e) => setD({ ...d, observacoes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving || !d.descricao || !d.conta_id}>Salvar</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TransferenciaDialog({ contas, onDone }: any) {
  const [d, setD] = useState({
    data: toISODate(new Date()),
    descricao: "Transferência",
    valor: 0,
    conta_id: contas[0]?.id ?? "",
    conta_destino_id: contas[1]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (d.conta_id === d.conta_destino_id) return toast.error("Contas devem ser diferentes.");
    setSaving(true);
    const { error } = await supabase.rpc("criar_transferencia", {
      _conta_origem_id: d.conta_id,
      _conta_destino_id: d.conta_destino_id,
      _valor: Number(d.valor),
      _data: d.data,
      _descricao: d.descricao,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Transferência registrada e lançamento contábil postado.");
    onDone();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Transferência entre contas</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Conta de origem</Label>
          <Select value={d.conta_id} onValueChange={(v) => setD({ ...d, conta_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{contas.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Conta de destino</Label>
          <Select value={d.conta_destino_id} onValueChange={(v) => setD({ ...d, conta_destino_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{contas.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Valor</Label>
          <Input type="number" step="0.01" value={d.valor} onChange={(e) => setD({ ...d, valor: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Data</Label>
          <Input type="date" value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} />
        </div>
        <div>
          <Label>Descrição</Label>
          <Input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving || !d.valor}>Transferir</Button>
      </DialogFooter>
    </DialogContent>
  );
}
