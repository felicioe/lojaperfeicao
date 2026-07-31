import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarSessoes, criarSessao } from "@/lib/backend/sessoes";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GRAU_LABEL, TIPO_SESSAO_LABEL, fmtDate, toISODate } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/sessoes/")({
  head: () => ({ meta: [{ title: "Sessões — Gestão Maçônica" }] }),
  component: SessoesList,
});

function SessoesList() {
  const qc = useQueryClient();
  const can = useCan();
  const [nova, setNova] = useState<{ data: string; tipo: "ordinaria" | "magna" | "branca" | "administrativa"; grau: "aprendiz" | "companheiro" | "mestre" }>({ data: toISODate(new Date()), tipo: "ordinaria", grau: "aprendiz" });

  const { data = [] } = useQuery({
    queryKey: ["sessoes"],
    queryFn: () => listarSessoes(),
  });

  const criar = async () => {
    try {
      await criarSessao({ data: nova });
      toast.success("Sessão criada.");
      qc.invalidateQueries({ queryKey: ["sessoes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    }
  };

  return (
    <>
      <PageHeader title="Sessões" description="Registro de sessões e frequência." />
      {can.isSecretario && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">Nova sessão</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div><Label>Data</Label><Input type="date" value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={nova.tipo} onValueChange={(v) => setNova({ ...nova, tipo: v as typeof nova.tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_SESSAO_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grau</Label>
              <Select value={nova.grau} onValueChange={(v) => setNova({ ...nova, grau: v as typeof nova.grau })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GRAU_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end"><Button onClick={criar} className="w-full">Criar</Button></div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Grau</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhuma sessão registrada.</TableCell></TableRow>
            )}
            {data.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell>{fmtDate(s.data)}</TableCell>
                <TableCell>{TIPO_SESSAO_LABEL[s.tipo]}</TableCell>
                <TableCell>{GRAU_LABEL[s.grau]}</TableCell>
                <TableCell className="text-right">
                  <Link to="/sessoes/$id" params={{ id: s.id }}>
                    <Button variant="ghost" size="sm">Presença</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
