import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarIrmaos } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GRAU_LABEL, SITUACAO_LABEL } from "@/lib/format";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/irmaos/")({
  head: () => ({
    meta: [
      { title: "Irmãos — Gestão Maçônica" },
      { name: "description", content: "Cadastro e gestão dos irmãos da loja." },
    ],
  }),
  component: IrmaosList,
});

function IrmaosList() {
  const [q, setQ] = useState("");
  const can = useCan();
  const { data = [], isLoading } = useQuery({
    queryKey: ["irmaos"],
    queryFn: () => listarIrmaos(),
  });

  const filtered = data.filter((i: any) =>
    !q ||
    i.nome_civil?.toLowerCase().includes(q.toLowerCase()) ||
    i.nome_simbolico?.toLowerCase().includes(q.toLowerCase()) ||
    i.cim?.toLowerCase().includes(q.toLowerCase()),
  );

  const situacaoVariant = (s: string) =>
    ({ ativo: "default", quite: "secondary", irregular: "destructive", adormecido: "outline" } as any)[s] ?? "outline";

  return (
    <>
      <PageHeader
        title="Irmãos"
        description="Cadastro completo com dados civis e maçônicos."
        actions={
          can.canManageIrmaos && (
            <Link to="/irmaos/novo">
              <Button><Plus className="h-4 w-4 mr-1" /> Novo Irmão</Button>
            </Link>
          )
        }
      />
      <Card className="p-4 mb-4">
        <Input
          placeholder="Buscar por nome, nome simbólico ou CIM…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
      </Card>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome civil</TableHead>
              <TableHead>Nome simbólico</TableHead>
              <TableHead>CIM</TableHead>
              <TableHead>Grau</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhum irmão cadastrado.</TableCell></TableRow>
            )}
            {filtered.map((i: any) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.nome_civil}</TableCell>
                <TableCell>{i.nome_simbolico ?? "—"}</TableCell>
                <TableCell>{i.cim ?? "—"}</TableCell>
                <TableCell>{GRAU_LABEL[i.grau]}</TableCell>
                <TableCell><Badge variant={situacaoVariant(i.situacao)}>{SITUACAO_LABEL[i.situacao]}</Badge></TableCell>
                <TableCell className="text-right">
                  <Link to="/irmaos/$id" params={{ id: i.id }}>
                    <Button variant="ghost" size="sm">Abrir</Button>
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
