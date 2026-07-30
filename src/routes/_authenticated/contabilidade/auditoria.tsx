import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { brl, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/contabilidade/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria Contábil — Gestão Maçônica" }] }),
  component: AuditoriaContabil,
});

type Desbalanceado = {
  lancamento_id: string;
  data: string;
  descricao: string;
  origem_tipo: string | null;
  origem_id: string | null;
  total_debito: number;
  total_credito: number;
  diferenca: number;
};

type SaldoConta = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  total_debito: number;
  total_credito: number;
  saldo_devedor: number;
};

function AuditoriaContabil() {
  const { data: desbalanceados = [], isLoading: loadingDesbalanceados } = useQuery({
    queryKey: ["v_auditoria_contabil_desbalanceados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_auditoria_contabil_desbalanceados").select("*");
      if (error) throw error;
      return (data ?? []) as Desbalanceado[];
    },
  });

  const { data: saldos = [] } = useQuery({
    queryKey: ["v_saldo_plano_contas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_saldo_plano_contas").select("*").order("codigo");
      if (error) throw error;
      return (data ?? []) as SaldoConta[];
    },
  });

  const totalDebito = saldos.reduce((s, c) => s + Number(c.total_debito), 0);
  const totalCredito = saldos.reduce((s, c) => s + Number(c.total_credito), 0);
  const consistente = !loadingDesbalanceados && desbalanceados.length === 0;

  return (
    <>
      <PageHeader
        title="Auditoria Contábil"
        description="Verifica se todos os lançamentos em partida dobrada estão balanceados (débito = crédito)."
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total debitado</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalDebito)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total creditado</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totalCredito)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Consistência</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold">
            {consistente ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> OK
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-destructive" /> {desbalanceados.length} lançamento(s)
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {!consistente && (
        <Card className="mb-6 border-destructive">
          <CardHeader><CardTitle className="text-base">Lançamentos desbalanceados</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Débito</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {desbalanceados.map((d) => (
                  <TableRow key={d.lancamento_id}>
                    <TableCell>{fmtDate(d.data)}</TableCell>
                    <TableCell>{d.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">{d.origem_tipo ?? "—"}</TableCell>
                    <TableCell className="text-right">{brl(d.total_debito)}</TableCell>
                    <TableCell className="text-right">{brl(d.total_credito)}</TableCell>
                    <TableCell className="text-right text-destructive font-medium">{brl(d.diferenca)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Saldo por conta analítica</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Débito</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
                <TableHead className="text-right">Saldo devedor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {saldos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.codigo}</TableCell>
                  <TableCell>{c.nome}</TableCell>
                  <TableCell><Badge variant="outline">{c.tipo}</Badge></TableCell>
                  <TableCell className="text-right">{brl(c.total_debito)}</TableCell>
                  <TableCell className="text-right">{brl(c.total_credito)}</TableCell>
                  <TableCell className="text-right">{brl(c.saldo_devedor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
