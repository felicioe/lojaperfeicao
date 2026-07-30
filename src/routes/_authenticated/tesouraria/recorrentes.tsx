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
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, RefreshCw, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tesouraria/recorrentes")({
  head: () => ({ meta: [{ title: "Despesas Recorrentes — Gestão Maçônica" }] }),
  component: Recorrentes,
});

type Recorrente = {
  id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  plano_conta_id: string;
  terceiro_id: string | null;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  observacoes: string | null;
  plano_contas: { codigo: string; nome: string } | null;
  terceiros: { nome: string } | null;
};

type Status = "inativa" | "fora_periodo" | "efetivada" | "vencida" | "aguardando";

const STATUS_LABEL: Record<Status, string> = {
  inativa: "Inativa",
  fora_periodo: "Fora do período",
  efetivada: "Efetivada este mês",
  vencida: "Vencida",
  aguardando: "Aguardando",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  inativa: "outline",
  fora_periodo: "outline",
  efetivada: "default",
  vencida: "destructive",
  aguardando: "secondary",
};

function statusCompetencia(r: Recorrente, efetivadasEsteMes: Set<string>): Status {
  if (!r.ativo) return "inativa";
  const hoje = new Date();
  const inicio = new Date(r.data_inicio + "T00:00:00");
  const fim = r.data_fim ? new Date(r.data_fim + "T00:00:00") : null;
  if (hoje < inicio || (fim && hoje > fim)) return "fora_periodo";
  if (efetivadasEsteMes.has(r.id)) return "efetivada";
  return hoje.getDate() >= r.dia_vencimento ? "vencida" : "aguardando";
}

const FORM_VAZIO = {
  id: null as string | null,
  descricao: "", valor: 0, dia_vencimento: 10, plano_conta_id: "", terceiro_id: "none",
  data_inicio: toISODate(new Date()), data_fim: "", observacoes: "",
};

function Recorrentes() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;
  const [form, setForm] = useState(FORM_VAZIO);
  const [efetivando, setEfetivando] = useState(false);

  const { data: recorrentes = [] } = useQuery({
    queryKey: ["despesas_recorrentes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("despesas_recorrentes").select("*,plano_contas(codigo,nome),terceiros(nome)").order("descricao");
      if (error) throw error;
      return (data ?? []) as Recorrente[];
    },
  });

  const inicioMes = toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { data: efetivadas = [] } = useQuery({
    queryKey: ["recorrentes_efetivadas_mes", inicioMes],
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos").select("recorrente_id").eq("competencia_mes", inicioMes).not("recorrente_id", "is", null);
      if (error) throw error;
      return (data ?? []) as { recorrente_id: string }[];
    },
  });
  const efetivadasSet = new Set(efetivadas.map((e) => e.recorrente_id));

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["despesas_recorrentes"] });
    qc.invalidateQueries({ queryKey: ["recorrentes_efetivadas_mes"] });
  };

  const salvar = async () => {
    if (!form.descricao.trim() || !form.valor || !form.plano_conta_id) return;
    const payload = {
      descricao: form.descricao.trim(),
      valor: Number(form.valor),
      dia_vencimento: Number(form.dia_vencimento),
      plano_conta_id: form.plano_conta_id,
      terceiro_id: form.terceiro_id === "none" ? null : form.terceiro_id,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      observacoes: form.observacoes || null,
    };
    const { error } = form.id
      ? await supabase.from("despesas_recorrentes").update(payload).eq("id", form.id)
      : await supabase.from("despesas_recorrentes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Atualizada." : "Recorrência criada.");
    setForm(FORM_VAZIO);
    invalidate();
  };

  const editar = (r: Recorrente) =>
    setForm({
      id: r.id, descricao: r.descricao, valor: r.valor, dia_vencimento: r.dia_vencimento,
      plano_conta_id: r.plano_conta_id, terceiro_id: r.terceiro_id ?? "none",
      data_inicio: r.data_inicio, data_fim: r.data_fim ?? "", observacoes: r.observacoes ?? "",
    });

  const alternarAtivo = async (r: Recorrente) => {
    const { error } = await supabase.from("despesas_recorrentes").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const efetivarAgora = async () => {
    setEfetivando(true);
    const { data, error } = await supabase.rpc("efetivar_recorrentes_vencidas");
    setEfetivando(false);
    if (error) return toast.error(error.message);
    toast.success(`${data ?? 0} conta(s) a pagar gerada(s).`);
    invalidate();
  };

  return (
    <>
      <PageHeader
        title="Despesas Recorrentes"
        description="Templates que geram contas a pagar automaticamente por competência (aluguel, água/luz/internet etc.)."
        actions={
          podeEditar && (
            <Button variant="outline" onClick={efetivarAgora} disabled={efetivando}>
              <RefreshCw className={`h-4 w-4 mr-1 ${efetivando ? "animate-spin" : ""}`} /> Efetivar recorrências vencidas
            </Button>
          )
        }
      />

      {podeEditar && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">{form.id ? "Editar recorrência" : "Nova recorrência"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2"><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
            <div><Label>Valor</Label><Input type="number" step="0.01" min="0" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} /></div>
            <div><Label>Dia do vencimento</Label><Input type="number" min={1} max={28} value={form.dia_vencimento} onChange={(e) => setForm({ ...form, dia_vencimento: Number(e.target.value) })} /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.plano_conta_id} onValueChange={(v) => setForm({ ...form, plano_conta_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor (opcional)</Label>
              <Select value={form.terceiro_id} onValueChange={(v) => setForm({ ...form, terceiro_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— nenhum —</SelectItem>
                  {terceiros.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Início</Label><Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div><Label>Fim (opcional)</Label><Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} /></div>
            <div className="md:col-span-4"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div>
            <div className="md:col-span-4 flex gap-2">
              <Button onClick={salvar} disabled={!form.descricao || !form.valor || !form.plano_conta_id}>{form.id ? "Salvar alterações" : "Adicionar"}</Button>
              {form.id && <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}><X className="h-4 w-4 mr-1" /> Cancelar</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Dia</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ativa</TableHead>
              {podeEditar && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {recorrentes.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhuma recorrência cadastrada.</TableCell></TableRow>
            )}
            {recorrentes.map((r) => {
              const status = statusCompetencia(r, efetivadasSet);
              return (
                <TableRow key={r.id} className={!r.ativo ? "opacity-50" : undefined}>
                  <TableCell className="font-medium">{r.descricao}</TableCell>
                  <TableCell className="text-muted-foreground">{r.plano_contas?.nome ?? "—"}</TableCell>
                  <TableCell className="font-mono">{r.dia_vencimento}</TableCell>
                  <TableCell className="text-right">{brl(r.valor)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(r.data_inicio)} – {r.data_fim ? fmtDate(r.data_fim) : "indeterminado"}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge></TableCell>
                  <TableCell><Switch checked={r.ativo} onCheckedChange={() => alternarAtivo(r)} disabled={!podeEditar} /></TableCell>
                  {podeEditar && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => editar(r)}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
