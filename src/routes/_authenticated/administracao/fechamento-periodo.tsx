import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarPeriodosFechados,
  listarEventosPeriodosFechados,
  fecharPeriodo,
  reabrirPeriodo,
} from "@/lib/backend/administracao-fechamento-periodo";
import { listarNomesUsuarios } from "@/lib/backend/contabilidade-fechamento";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { fmtDate, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/administracao/fechamento-periodo")({
  head: () => ({ meta: [{ title: "Fechamento de Período — Gestão Maçônica" }] }),
  component: FechamentoPeriodo,
});

function competenciaLabel(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(Number(ano), Number(mes) - 1, 1),
  );
}

function primeiroDiaDoMes(d: Date): string {
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function FechamentoPeriodo() {
  const can = useCan();
  const qc = useQueryClient();

  const { data: periodos = [] } = useQuery({
    queryKey: ["periodos_fechados"],
    queryFn: () => listarPeriodosFechados(),
  });

  const { data: eventos = [] } = useQuery({
    queryKey: ["periodos_fechados_eventos"],
    queryFn: () => listarEventosPeriodosFechados(),
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

  const competenciaPorPeriodoId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of periodos) m.set(p.id, p.competencia);
    return m;
  }, [periodos]);

  const ultimoFechado = periodos.find((p) => p.status === "fechado");
  const proximaCompetencia = ultimoFechado
    ? primeiroDiaDoMes(
        new Date(
          new Date(`${ultimoFechado.competencia.slice(0, 10)}T00:00:00`).getFullYear(),
          new Date(`${ultimoFechado.competencia.slice(0, 10)}T00:00:00`).getMonth() + 1,
          1,
        ),
      )
    : primeiroDiaDoMes(new Date());

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["periodos_fechados"] });
    qc.invalidateQueries({ queryKey: ["periodos_fechados_eventos"] });
  };

  const reabrirMutation = useMutation({
    mutationFn: ({ competencia, motivo }: { competencia: string; motivo: string }) =>
      reabrirPeriodo({ data: { competencia, motivo } }),
    onSuccess: () => {
      toast.success("Período reaberto");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao reabrir período"),
  });

  return (
    <>
      <PageHeader
        title="Fechamento de Período"
        description="Trava mensal: impede novos lançamentos ou alterações datados dentro de um mês já fechado."
        actions={can.isAdmin && <NovoFechamentoDialog competenciaSugerida={proximaCompetencia} />}
      />

      {!can.isAdmin && (
        <Card className="mb-4 p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Apenas administradores podem fechar ou reabrir
          períodos.
        </Card>
      )}

      <Card className="mb-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Competência</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fechado por</TableHead>
              <TableHead>Observações</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhum período fechado ainda.
                </TableCell>
              </TableRow>
            )}
            {periodos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium capitalize">
                  {competenciaLabel(p.competencia)}
                </TableCell>
                <TableCell>
                  {p.status === "fechado" ? (
                    <Badge className="gap-1">
                      <Lock className="h-3.5 w-3.5" /> Fechado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Unlock className="h-3.5 w-3.5" /> Reaberto
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {nomePorId.get(p.fechado_por ?? "") ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.observacoes ?? "—"}
                </TableCell>
                <TableCell>
                  {can.isAdmin && p.status === "fechado" && (
                    <ReabrirDialog
                      competencia={p.competencia}
                      onConfirm={(motivo) =>
                        reabrirMutation.mutate({ competencia: p.competencia, motivo })
                      }
                    />
                  )}
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
              <TableHead>Competência</TableHead>
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
                <TableCell className="capitalize">
                  {competenciaPorPeriodoId.get(e.periodo_id)
                    ? competenciaLabel(competenciaPorPeriodoId.get(e.periodo_id)!)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={e.acao === "fechamento" ? "default" : "outline"}>
                    {e.acao === "fechamento" ? "Fechamento" : "Reabertura"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {nomePorId.get(e.realizado_por ?? "") ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.motivo ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function NovoFechamentoDialog({ competenciaSugerida }: { competenciaSugerida: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [competencia, setCompetencia] = useState(competenciaSugerida.slice(0, 7));
  const [observacoes, setObservacoes] = useState("");

  const fecharMutation = useMutation({
    mutationFn: () =>
      fecharPeriodo({
        data: { competencia: `${competencia}-01`, observacoes: observacoes || null },
      }),
    onSuccess: () => {
      toast.success("Período fechado");
      setOpen(false);
      setObservacoes("");
      qc.invalidateQueries({ queryKey: ["periodos_fechados"] });
      qc.invalidateQueries({ queryKey: ["periodos_fechados_eventos"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Erro ao fechar período"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" /> Fechar período
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar período</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Mês</Label>
            <Input
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Depois de fechado, nenhum lançamento (fatura, baixa, conta a pagar, conciliação etc.)
            poderá ser criado ou alterado com data dentro deste mês, até que o período seja
            reaberto.
          </p>
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

function ReabrirDialog({
  competencia,
  onConfirm,
}: {
  competencia: string;
  onConfirm: (motivo: string) => void;
}) {
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
          <DialogTitle>Reabrir {competenciaLabel(competencia)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Volta a permitir lançamentos com data dentro deste mês. Informe o motivo.
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
