import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { toISODate } from "@/lib/format";

export const CATEGORIA_LABEL: Record<string, string> = {
  mensalidade: "Mensalidade",
  taxa_grau: "Taxa de grau",
  tronco: "Tronco de Beneficência",
  doacao: "Doação",
  outros: "Outros",
};

export function useMovimentosFiltrados(filtrosIniciais?: { categoria?: string }) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [contaId, setContaId] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState(filtrosIniciais?.categoria ?? "todas");

  const { data: movimentos = [] } = useQuery({
    queryKey: ["movimentos_financeiros", de, ate, contaId, tipo, categoria],
    queryFn: async () => {
      let q = supabase
        .from("lancamentos")
        .select(
          "id,data,descricao,valor,tipo,pago,forma_pagamento,categoria_recebimento,contas_financeiras!lancamentos_conta_id_fkey(nome),destino:contas_financeiras!lancamentos_conta_destino_id_fkey(nome),plano_contas(nome)",
        )
        .order("data", { ascending: false })
        .limit(300);
      if (de) q = q.gte("data", de);
      if (ate) q = q.lte("data", ate);
      if (contaId !== "todas") q = q.eq("conta_id", contaId);
      if (tipo !== "todos") q = q.eq("tipo", tipo);
      if (categoria !== "todas") q = q.eq("categoria_recebimento", categoria);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  return { movimentos, de, setDe, ate, setAte, contaId, setContaId, tipo, setTipo, categoria, setCategoria };
}

export function RecebimentoAvulsoDialog({ contas, onDone, categoriaInicial = "doacao" }: { contas: { id: string; nome: string }[]; onDone: () => void; categoriaInicial?: string }) {
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [planoContaId, setPlanoContaId] = useState("");
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [valor, setValor] = useState(0);
  const [data, setData] = useState(toISODate(new Date()));
  const [formaPagamento, setFormaPagamento] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: receitas = [] } = useQuery({
    queryKey: ["planos_receita"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plano_contas").select("id,codigo,nome").eq("tipo", "receita").eq("analitica", true).eq("ativo", true).order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string }[];
    },
  });

  const salvar = async () => {
    if (!valor || !planoContaId || !contaFinanceiraId) return toast.error("Preencha valor, categoria contábil e conta.");
    setSaving(true);
    const { error } = await supabase.rpc("registrar_recebimento_avulso", {
      _valor: Number(valor),
      _categoria: categoria as any,
      _plano_conta_id: planoContaId,
      _conta_financeira_id: contaFinanceiraId,
      _data: data,
      _forma_pagamento: formaPagamento || null,
      _descricao: descricao || null,
      _observacoes: observacoes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Recebimento registrado e lançamento contábil postado.");
    onDone();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Registrar recebimento avulso</DialogTitle></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CATEGORIA_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Valor</Label><Input type="number" step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} /></div>
        <div>
          <Label>Conta de receita</Label>
          <Select value={planoContaId} onValueChange={setPlanoContaId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{receitas.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Conta que recebeu</Label>
          <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div><Label>Forma de pagamento</Label><Input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Descrição (opcional)</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        <div className="md:col-span-2"><Label>Observações</Label><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving || !valor || !planoContaId || !contaFinanceiraId}>Registrar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
