import { useState } from "react";
import { toast } from "sonner";
import { criarTransferencia } from "@/lib/backend/tesouraria-lancamentos";
import type { ContaFinanceira } from "@/lib/backend/tesouraria-contas";
import { Button } from "@/components/ui/button";
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
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toISODate } from "@/lib/format";

// Diálogo único de transferência entre contas — usado tanto no botão
// "Transferência" da Tesouraria quanto no botão "Lançar transferência" da
// Conciliação Bancária (issue #467), onde vem pré-preenchido a partir da
// linha do extrato marcada. `onDone` recebe o id do lançamento criado pra
// quem chamou poder pré-selecioná-lo em seguida (ex.: já deixar marcado
// pra vincular à linha do OFX sem precisar procurar de novo na lista).
export function TransferenciaDialog({
  contas,
  onDone,
  titulo = "Transferência entre contas",
  ajuda,
  inicial,
}: {
  contas: ContaFinanceira[];
  onDone: (id: string) => void;
  titulo?: string;
  ajuda?: string;
  inicial?: {
    data?: string;
    valor?: number;
    descricao?: string;
    contaOrigemId?: string;
    contaDestinoId?: string;
  };
}) {
  const [d, setD] = useState(() => {
    const origem = inicial?.contaOrigemId ?? contas[0]?.id ?? "";
    const destino =
      inicial?.contaDestinoId && inicial.contaDestinoId !== origem
        ? inicial.contaDestinoId
        : (contas.find((c) => c.id !== origem)?.id ?? "");
    return {
      data: inicial?.data ?? toISODate(new Date()),
      descricao: inicial?.descricao ?? "Transferência",
      valor: inicial?.valor ?? 0,
      conta_id: origem,
      conta_destino_id: destino,
    };
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (d.conta_id === d.conta_destino_id) return toast.error("Contas devem ser diferentes.");
    setSaving(true);
    try {
      const { id } = await criarTransferencia({
        data: {
          contaOrigemId: d.conta_id,
          contaDestinoId: d.conta_destino_id,
          valor: Number(d.valor),
          data: d.data,
          descricao: d.descricao,
        },
      });
      toast.success("Transferência registrada e lançamento contábil postado.");
      onDone(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao transferir.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
      </DialogHeader>
      {ajuda && <p className="text-sm text-muted-foreground">{ajuda}</p>}
      <div className="grid gap-3">
        <div>
          <Label htmlFor="transf-origem">Conta de origem</Label>
          <Select
            value={d.conta_id}
            onValueChange={(v) => {
              const destino =
                d.conta_destino_id === v
                  ? (contas.find((c) => c.id !== v)?.id ?? "")
                  : d.conta_destino_id;
              setD({ ...d, conta_id: v, conta_destino_id: destino });
            }}
          >
            <SelectTrigger id="transf-origem">
              <SelectValue />
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
          <Label htmlFor="transf-destino">Conta de destino</Label>
          <Select
            value={d.conta_destino_id}
            onValueChange={(v) => setD({ ...d, conta_destino_id: v })}
          >
            <SelectTrigger id="transf-destino">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contas
                .filter((c) => c.id !== d.conta_id)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="transf-valor">Valor</Label>
          <Input
            id="transf-valor"
            type="number"
            step="0.01"
            value={d.valor}
            onChange={(e) => setD({ ...d, valor: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="transf-data">Data</Label>
          <Input
            id="transf-data"
            type="date"
            value={d.data}
            onChange={(e) => setD({ ...d, data: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="transf-descricao">Descrição</Label>
          <Input
            id="transf-descricao"
            value={d.descricao}
            onChange={(e) => setD({ ...d, descricao: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button onClick={save} disabled={saving || !(Number(d.valor) > 0)}>
          Transferir
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
