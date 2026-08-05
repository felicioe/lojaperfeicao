import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarSessoes, criarSessao } from "@/lib/backend/sessoes";
import { listarOrgs, listarOrgsGraus } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TIPO_SESSAO_LABEL, fmtDate, toISODate } from "@/lib/format";
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
  const [nova, setNova] = useState<{
    data: string;
    tipo: "ordinaria" | "magna" | "branca" | "administrativa";
    orgId: string;
    grau: string;
  }>({ data: toISODate(new Date()), tipo: "ordinaria", orgId: "", grau: "" });
  const [criando, setCriando] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["sessoes"],
    queryFn: () => listarSessoes(),
  });

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  const { data: graus = [] } = useQuery({
    queryKey: ["orgs_graus", nova.orgId],
    queryFn: () => listarOrgsGraus({ data: { orgId: nova.orgId } }),
    enabled: !!nova.orgId,
  });

  const criar = async () => {
    const grau = Number(nova.grau);
    if (!nova.orgId || !grau) return toast.error("Selecione o corpo e o grau.");
    setCriando(true);
    try {
      await criarSessao({ data: { data: nova.data, tipo: nova.tipo, orgId: nova.orgId, grau } });
      toast.success("Sessão criada.");
      qc.invalidateQueries({ queryKey: ["sessoes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setCriando(false);
    }
  };

  return (
    <>
      <PageHeader title="Sessões" description="Registro de sessões e frequência." />
      {can.isSecretario && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Nova sessão</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={nova.data}
                onChange={(e) => setNova({ ...nova, data: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={nova.tipo}
                onValueChange={(v) => setNova({ ...nova, tipo: v as typeof nova.tipo })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_SESSAO_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Corpo</Label>
              <Select
                value={nova.orgId}
                onValueChange={(v) => setNova({ ...nova, orgId: v, grau: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grau</Label>
              {graus.length > 0 ? (
                <Select value={nova.grau} onValueChange={(v) => setNova({ ...nova, grau: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Grau…" />
                  </SelectTrigger>
                  <SelectContent>
                    {graus.map((g) => (
                      <SelectItem key={g.id} value={String(g.grau)}>
                        {g.grau} — {g.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  min={1}
                  disabled={!nova.orgId}
                  value={nova.grau}
                  onChange={(e) => setNova({ ...nova, grau: e.target.value })}
                />
              )}
            </div>
            <div className="flex items-end md:col-span-4">
              <Button onClick={criar} disabled={criando} className="w-full md:w-auto">
                Criar sessão
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Corpo</TableHead>
              <TableHead>Grau</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhuma sessão registrada.
                </TableCell>
              </TableRow>
            )}
            {data.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{fmtDate(s.data)}</TableCell>
                <TableCell>{TIPO_SESSAO_LABEL[s.tipo]}</TableCell>
                <TableCell>{s.org_nome ?? "—"}</TableCell>
                <TableCell>
                  {s.grau}
                  {s.nome_grau ? ` — ${s.nome_grau}` : ""}
                </TableCell>
                <TableCell className="text-right">
                  <Link to="/sessoes/$id" params={{ id: s.id }}>
                    <Button variant="ghost" size="sm">
                      Presença
                    </Button>
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
