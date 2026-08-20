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
import { CATEGORIA_LABEL } from "@/components/app/movimentos-filtros";

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
  const isTronco = categoriaInicial === "tronco";

  const { data: receitas = [] } = useQuery({
    queryKey: ["planos_receita"],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "receita" } }),
  });

  const salvar = async () => {
    if (!(Number(valor) > 0) || !planoContaId || !contaFinanceiraId)
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
          <Label htmlFor="recebimentoavulso-categoria">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria} disabled={isTronco}>
            <SelectTrigger id="recebimentoavulso-categoria">
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
          <Label htmlFor="recebimentoavulso-valor">Valor</Label>
          <Input
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            id="recebimentoavulso-valor"
          />
        </div>
        <div>
          <Label htmlFor="recebimentoavulso-conta-de-receita">Conta de receita</Label>
          <Select value={planoContaId} onValueChange={setPlanoContaId}>
            <SelectTrigger id="recebimentoavulso-conta-de-receita">
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
          <Label htmlFor="recebimentoavulso-conta-que-recebeu">Conta que recebeu</Label>
          <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
            <SelectTrigger id="recebimentoavulso-conta-que-recebeu">
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
          <Label htmlFor="recebimentoavulso-data">Data</Label>
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            id="recebimentoavulso-data"
          />
        </div>
        {isTronco ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm md:col-span-2">
            Este crédito será registrado como PIX anônimo. O nome do irmão não será armazenado no
            histórico do Tronco.
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="recebimentoavulso-forma-de-pagamento">Forma de pagamento</Label>
              <Input
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                id="recebimentoavulso-forma-de-pagamento"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="recebimentoavulso-descricao-opcional">Descrição (opcional)</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                id="recebimentoavulso-descricao-opcional"
              />
            </div>
          </>
        )}
        <div className="md:col-span-2">
          <Label htmlFor="recebimentoavulso-observacoes">Observações</Label>
          <Textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            id="recebimentoavulso-observacoes"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={salvar}
          disabled={saving || !(Number(valor) > 0) || !planoContaId || !contaFinanceiraId}
        >
          Registrar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
