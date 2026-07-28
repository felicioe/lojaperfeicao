import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tesouraria/plano-contas")({
  head: () => ({ meta: [{ title: "Plano de Contas — Gestão Maçônica" }] }),
  component: PlanoContas,
});

function PlanoContas() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ codigo: "", nome: "", tipo: "despesa" });
  const { data = [] } = useQuery({
    queryKey: ["plano_contas_all"],
    queryFn: async () => (await supabase.from("plano_contas").select("*").order("codigo")).data ?? [],
  });
  const add = async () => {
    const { error } = await supabase.from("plano_contas").insert(novo);
    if (error) return toast.error(error.message);
    toast.success("Adicionado.");
    setNovo({ codigo: "", nome: "", tipo: "despesa" });
    qc.invalidateQueries({ queryKey: ["plano_contas_all"] });
  };
  return (
    <>
      <PageHeader title="Plano de Contas" description="Categorias de receitas e despesas." />
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Nova categoria</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><Label>Código</Label><Input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} placeholder="4.1.04" /></div>
          <div className="md:col-span-2"><Label>Nome</Label><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></div>
          <div>
            <Label>Tipo</Label>
            <Select value={novo.tipo} onValueChange={(v) => setNovo({ ...novo, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="despesa">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4"><Button onClick={add} disabled={!novo.codigo || !novo.nome}>Adicionar</Button></div>
        </CardContent>
      </Card>
      <Card>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Tipo</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.codigo}</TableCell>
                <TableCell>{p.nome}</TableCell>
                <TableCell><Badge variant={p.tipo === "receita" ? "default" : "destructive"}>{p.tipo}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
