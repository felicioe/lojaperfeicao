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
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/gestoes/cargos")({
  head: () => ({ meta: [{ title: "Cargos — Gestão Maçônica" }] }),
  component: Cargos,
});

type Cargo = { id: string; org_id: string | null; nome: string; ordem: number; ativo: boolean };

const FORM_VAZIO = { id: null as string | null, nome: "", org_id: "none", ordem: 0 };

function Cargos() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);

  const { data: cargos = [] } = useQuery({
    queryKey: ["cargos_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cargos").select("*").order("ordem");
      if (error) throw error;
      return (data ?? []) as Cargo[];
    },
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orgs").select("id,nome,sigla").order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; sigla: string | null }[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cargos_all"] });

  const salvar = async () => {
    if (!form.nome.trim()) return;
    const payload = { nome: form.nome.trim(), org_id: form.org_id === "none" ? null : form.org_id, ordem: Number(form.ordem) || 0 };
    const { error } = form.id
      ? await supabase.from("cargos").update(payload).eq("id", form.id)
      : await supabase.from("cargos").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Cargo atualizado." : "Cargo criado.");
    setForm(FORM_VAZIO);
    invalidate();
  };

  const alternarAtivo = async (c: Cargo) => {
    const { error } = await supabase.from("cargos").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const nomeOrg = (id: string | null) => orgs.find((o) => o.id === id)?.sigla ?? orgs.find((o) => o.id === id)?.nome ?? null;

  return (
    <>
      <PageHeader title="Cargos" description="Catálogo de cargos administrativos (Venerável, Secretário, Tesoureiro etc.)." />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">{form.id ? "Editar cargo" : "Novo cargo"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div>
              <Label>Corpo (opcional)</Label>
              <Select value={form.org_id} onValueChange={(v) => setForm({ ...form, org_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— genérico (qualquer corpo) —</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.sigla ?? o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Ordem</Label><Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} /></div>
            <div className="md:col-span-4 flex gap-2">
              <Button onClick={salvar} disabled={!form.nome}>{form.id ? "Salvar alterações" : "Adicionar"}</Button>
              {form.id && <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}><X className="h-4 w-4 mr-1" /> Cancelar</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ordem</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Corpo</TableHead>
              <TableHead>Ativo</TableHead>
              {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cargos.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhum cargo cadastrado.</TableCell></TableRow>
            )}
            {cargos.map((c) => (
              <TableRow key={c.id} className={!c.ativo ? "opacity-50" : undefined}>
                <TableCell className="font-mono">{c.ordem}</TableCell>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell className="text-muted-foreground">{nomeOrg(c.org_id) ?? "Genérico"}</TableCell>
                <TableCell><Switch checked={c.ativo} onCheckedChange={() => alternarAtivo(c)} disabled={!can.canManageIrmaos} /></TableCell>
                {can.canManageIrmaos && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setForm({ id: c.id, nome: c.nome, org_id: c.org_id ?? "none", ordem: c.ordem })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
