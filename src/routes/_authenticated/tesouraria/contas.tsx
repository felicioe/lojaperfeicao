import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarSaldoContas, criarContaFinanceira } from "@/lib/backend/tesouraria-contas";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tesouraria/contas")({
  head: () => ({ meta: [{ title: "Contas — Gestão Maçônica" }] }),
  component: Contas,
});

function Contas() {
  const qc = useQueryClient();
  const [nova, setNova] = useState<{ nome: string; tipo: "caixa" | "banco" | "outro"; saldo_inicial: number; banco: string }>({ nome: "", tipo: "caixa", saldo_inicial: 0, banco: "" });

  const saldos = useQuery({
    queryKey: ["saldos"],
    queryFn: () => listarSaldoContas(),
  });

  const criar = async () => {
    try {
      await criarContaFinanceira({ data: { ...nova, banco: nova.banco || null } });
      toast.success("Conta criada.");
      setNova({ nome: "", tipo: "caixa", saldo_inicial: 0, banco: "" });
      qc.invalidateQueries({ queryKey: ["saldos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    }
  };

  return (
    <>
      <PageHeader title="Contas financeiras" description="Caixa, contas bancárias e saldos." />
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Nova conta</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div><Label>Nome</Label><Input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} /></div>
          <div>
            <Label>Tipo</Label>
            <Select value={nova.tipo} onValueChange={(v) => setNova({ ...nova, tipo: v as typeof nova.tipo })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caixa">Caixa</SelectItem>
                <SelectItem value="banco">Banco</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Banco</Label><Input value={nova.banco} onChange={(e) => setNova({ ...nova, banco: e.target.value })} /></div>
          <div><Label>Saldo inicial</Label><Input type="number" step="0.01" value={nova.saldo_inicial} onChange={(e) => setNova({ ...nova, saldo_inicial: Number(e.target.value) })} /></div>
          <div className="flex items-end"><Button onClick={criar} disabled={!nova.nome}>Adicionar</Button></div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Saldo inicial</TableHead>
              <TableHead className="text-right">Saldo atual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(saldos.data ?? []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell>{c.tipo}</TableCell>
                <TableCell className="text-right">{brl(c.saldo_inicial)}</TableCell>
                <TableCell className="text-right font-medium">{brl(c.saldo_atual)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
