import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Undo2 } from "lucide-react";

// Compartilhado entre o relatório de Extrato da Conciliação (issue #113) e a
// tela de Conciliação Bancária (issue #141) — mesmo fluxo de "Desfazer"
// (motivo obrigatório) chamando desfazerConciliacao nos dois lugares.
export function DesfazerConciliacaoDialog({ onConfirm }: { onConfirm: (motivo: string) => void }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desfazer conciliação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Volta a(s) linha(s) do OFX pra pendente e o(s) lançamento(s) pra em aberto, estornando a
            contrapartida contábil gerada. Se esta linha fez parte de uma conciliação em lote, todas
            as outras linhas do mesmo evento também serão desfeitas. Informe o motivo.
          </p>
          <div>
            <Label htmlFor="desfazer-conciliacao-motivo">Motivo</Label>
            <Textarea
              id="desfazer-conciliacao-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!motivo.trim()}
            onClick={() => {
              onConfirm(motivo);
              setOpen(false);
              setMotivo("");
            }}
          >
            Confirmar desfazimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
