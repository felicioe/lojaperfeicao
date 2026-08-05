import { useQuery } from "@tanstack/react-query";
import {
  listarLancamentos,
  registrarRecebimentoAvulso,
} from "@/lib/backend/tesouraria-lancamentos";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { Button } from "@/components/ui/button";
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
    queryFn: () =>
      listarLancamentos({
        data: {
          de: de || null,
          ate: ate || null,
          contaId: contaId !== "todas" ? contaId : null,
          tipo: tipo !== "todos" ? (tipo as "entrada" | "saida" | "transferencia") : null,
          categoria: categoria !== "todas" ? categoria : null,
          limite: 500,
        },
      }),
  });

  return {
    movimentos,
    de,
    setDe,
    ate,
    setAte,
    contaId,
    setContaId,
    tipo,
    setTipo,
    categoria,
    setCategoria,
  };
}

export function RecebimentoAvulsoDialog({
  contas,
  onDone,
  categoriaInicial = "doacao",
}: {
  contas: { id: string; nome: string }[];
  onDone: () => void;
  categoriaInicial?: string;
}) {
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
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "receita" } }),
  });

  const salvar = async () => {
    if (!valor || !planoContaId || !contaFinanceiraId)
      return toast.error("Preencha valor, categoria contábil e conta.");
    setSaving(true);
    try {
      await registrarRecebimentoAvulso({
        data: {
          valor: Number(valor),
          categoria: categoria as "mensalidade" | "taxa_grau" | "tronco" | "doacao" | "outros",
          planoContaId,
          contaFinanceiraId,
          data,
          formaPagamento: formaPagamento || null,
          descricao: descricao || null,
          observacoes: observacoes || null,
        },
      });
      toast.success("Recebimento registrado e lançamento contábil postado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Registrar recebimento avulso</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
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
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Conta de receita</Label>
          <Select value={planoContaId} onValueChange={setPlanoContaId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {receitas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Conta que recebeu</Label>
          <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div>
          <Label>Forma de pagamento</Label>
          <Input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição (opcional)</Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Observações</Label>
          <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving || !valor || !planoContaId || !contaFinanceiraId}>
          Registrar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
