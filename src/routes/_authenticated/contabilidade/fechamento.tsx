import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarFechamentos,
  listarEventosFechamento,
  listarNomesUsuarios,
  previewResultadoFechamento,
  fecharExercicio,
  reabrirExercicio,
} from "@/lib/backend/contabilidade-fechamento";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Lock, Plus, Unlock } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contabilidade/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento de Exercício — Gestão Maçônica" }] }),
  component: Fechamento,
});

function Fechamento() {
  const can = useCan();
  const qc = useQueryClient();

  const { data: fechamentos = [] } = useQuery({
    queryKey: ["fechamentos_exercicio"],
    queryFn: () => listarFechamentos(),
  });

  const { data: eventos = [] } = useQuery({
    queryKey: ["fechamentos_exercicio_eventos"],
    queryFn: () => listarEventosFechamento(),
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ["usuarios_nomes"],
    queryFn: () => listarNomesUsuarios(),
  });

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuarios) m.set(u.id, u.nome_completo ?? "—");
    return m;
  }, [usuarios]);

  const exercicioPorFechamentoId = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fechamentos) m.set(f.id, f.exercicio);
    return m;
  }, [fechamentos]);

  const ultimoFechado = fechamentos.find((f) => f.status === "fechado");
  const proximoExercicio = ultimoFechado ? ultimoFechado.exercicio + 1 : new Date().getFullYear();

  const reabrirMutation = useMutation({
    mutationFn: ({ exercicio, motivo }: { exercicio: number; motivo: string }) =>
      reabrirExercicio({ data: { exercicio, motivo } }),
    onSuccess: () => {
      toast.success("Exercício reaberto");
      qc.invalidateQueries({ queryKey: ["fechamentos_exercicio"] });
      qc.invalidateQueries({ queryKey: ["fechamentos_exercicio_eventos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao reabrir exercício"),
  });

  return (
    <>
      <PageHeader
        title="Fechamento de Exercício"
        description="Encerra lançamentos anteriores à data de corte, apura o resultado e transporta o saldo para Lucros/Prejuízos Acumulados."
        actions={can.isAdmin && <NovoFechamentoDialog exercicioSugerido={proximoExercicio} />}
      />

      {!can.isAdmin && (
        <Card className="mb-4 p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Apenas administradores podem fechar ou reabrir exercícios.
        </Card>
      )}

      <Card className="mb-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exercício</TableHead>
              <TableHead>Data de corte</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Resultado apurado</TableHead>
              <TableHead>Fechado por</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fechamentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhum exercício fechado ainda.
                </TableCell>
              </TableRow>
            )}
            {fechamentos.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.exercicio}</TableCell>
                <TableCell>{fmtDate(f.data_corte)}</TableCell>
                <TableCell>
                  {f.status === "fechado" ? (
                    <Badge className="gap-1">
                      <Lock className="h-3.5 w-3.5" /> Fechado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Unlock className="h-3.5 w-3.5" /> Reaberto
                    </Badge>
                  )}
                </TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    (f.resultado_apurado ?? 0) >= 0 ? "text-emerald-600" : "text-destructive"
                  }`}
                >
                  {f.resultado_apurado != null ? brl(f.resultado_apurado) : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {nomePorId.get(f.fechado_por ?? "") ?? "—"}
                </TableCell>
                <TableCell>
                  {can.isAdmin && f.status === "fechado" && <ReabrirDialog exercicio={f.exercicio} onConfirm={(motivo) => reabrirMutation.mutate({ exercicio: f.exercicio, motivo })} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-3 border-b font-medium">Histórico de eventos</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/hora</TableHead>
              <TableHead>Exercício</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Motivo/Observações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhum evento registrado ainda.
                </TableCell>
              </TableRow>
            )}
            {eventos.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{fmtDate(e.realizado_em)}</TableCell>
                <TableCell>{exercicioPorFechamentoId.get(e.fechamento_id) ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={e.acao === "fechamento" ? "default" : "outline"}>
                    {e.acao === "fechamento" ? "Fechamento" : "Reabertura"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{nomePorId.get(e.realizado_por ?? "") ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.motivo ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function NovoFechamentoDialog({ exercicioSugerido }: { exercicioSugerido: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [exercicio, setExercicio] = useState(String(exercicioSugerido));
  const [dataCorte, setDataCorte] = useState(toISODate(new Date(exercicioSugerido, 11, 31)));
  const [observacoes, setObservacoes] = useState("");

  const { data: preview } = useQuery({
    queryKey: ["fechamento_preview", dataCorte],
    enabled: open,
    queryFn: async () => {
      const r = await previewResultadoFechamento({ data: { dataCorte } });
      return { receita: r.total_receita, despesa: r.total_despesa, resultado: r.resultado };
    },
  });

  const fecharMutation = useMutation({
    mutationFn: () =>
      fecharExercicio({ data: { exercicio: Number(exercicio), dataCorte, observacoes: observacoes || null } }),
    onSuccess: () => {
      toast.success(`Exercício ${exercicio} fechado`);
      setOpen(false);
      setObservacoes("");
      qc.invalidateQueries({ queryKey: ["fechamentos_exercicio"] });
      qc.invalidateQueries({ queryKey: ["fechamentos_exercicio_eventos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao fechar exercício"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" /> Fechar exercício
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar exercício</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Exercício (ano)</Label>
            <Input type="number" value={exercicio} onChange={(e) => setExercicio(e.target.value)} />
          </div>
          <div>
            <Label>Data de corte</Label>
            <Input type="date" value={dataCorte} onChange={(e) => setDataCorte(e.target.value)} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
          {preview && (
            <Card className="p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receitas acumuladas até a data de corte</span>
                <span>{brl(preview.receita)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Despesas acumuladas até a data de corte</span>
                <span>{brl(preview.despesa)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Resultado a apurar e transportar</span>
                <span className={preview.resultado >= 0 ? "text-emerald-600" : "text-destructive"}>{brl(preview.resultado)}</span>
              </div>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => fecharMutation.mutate()} disabled={fecharMutation.isPending}>
            Confirmar fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReabrirDialog({ exercicio, onConfirm }: { exercicio: number; onConfirm: (motivo: string) => void }) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Unlock className="h-3.5 w-3.5 mr-1" /> Reabrir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reabrir exercício {exercicio}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Isso estorna o lançamento de fechamento (com auditoria completa) e volta a permitir lançamentos com data
            dentro deste exercício. Informe o motivo.
          </p>
          <div>
            <Label>Motivo da reabertura</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!motivo.trim()}
            onClick={() => {
              onConfirm(motivo);
              setOpen(false);
              setMotivo("");
            }}
          >
            Confirmar reabertura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
