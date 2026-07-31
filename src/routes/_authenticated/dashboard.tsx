import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarContasAPagarProximas, obterProjecaoFluxo } from "@/lib/backend/dashboard";
import { listarSaldoContas } from "@/lib/backend/tesouraria-contas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/AppShell";
import { brl, fmtDate } from "@/lib/format";
import { CalendarClock, Wallet, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  // quem só tem o papel "irmao" (sem admin/tesoureiro/secretario) usa o
  // painel reduzido, não o dashboard administrativo.
  beforeLoad: ({ context }) => {
    const papeis = context.usuario?.papeis ?? [];
    const privilegiado = papeis.some((p) => p === "admin" || p === "tesoureiro" || p === "secretario");
    if (papeis.includes("irmao") && !privilegiado) {
      throw redirect({ to: "/painel" });
    }
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Gestão Maçônica" },
      { name: "description", content: "Visão geral: contas a pagar, saldo de caixa e projeção." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const today = new Date().toISOString().slice(0, 10);
  const in30Iso = in30.toISOString().slice(0, 10);

  const contasPagar = useQuery({
    queryKey: ["dash", "contasPagar", today, in30Iso],
    queryFn: () => listarContasAPagarProximas({ data: { de: today, ate: in30Iso } }),
  });

  const saldos = useQuery({
    queryKey: ["dash", "saldos"],
    queryFn: () => listarSaldoContas(),
  });

  const projecao = useQuery({
    queryKey: ["dash", "projecao", today, in30Iso],
    queryFn: () => obterProjecaoFluxo({ data: { de: today, ate: in30Iso } }),
  });

  const totalPagar = (contasPagar.data ?? []).reduce((a, r: any) => a + Number(r.valor), 0);
  const saldoAtual = (saldos.data ?? []).reduce((a, r: any) => a + Number(r.saldo_atual ?? 0), 0);
  const projetado = saldoAtual + (projecao.data?.delta ?? 0);

  return (
    <>
      <PageHeader title="Dashboard" description="Visão geral financeira dos próximos 30 dias." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={CalendarClock}
          label="Contas a Pagar (30 dias)"
          value={brl(totalPagar)}
          hint={`${contasPagar.data?.length ?? 0} lançamento(s)`}
          tone="warning"
        />
        <MetricCard
          icon={Wallet}
          label="Saldo de Caixa (hoje)"
          value={brl(saldoAtual)}
          hint={`${saldos.data?.length ?? 0} conta(s)`}
          tone="primary"
        />
        <MetricCard
          icon={TrendingUp}
          label="Saldo Projetado (30 dias)"
          value={brl(projetado)}
          hint={`${(projecao.data?.delta ?? 0) >= 0 ? "+" : ""}${brl(projecao.data?.delta ?? 0)} previstos`}
          tone={projetado >= 0 ? "success" : "danger"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas a pagar nos próximos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(contasPagar.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhuma conta a pagar nos próximos 30 dias.
                  </TableCell>
                </TableRow>
              )}
              {(contasPagar.data ?? []).map((l: any) => {
                const overdue = new Date(l.data_vencimento) < new Date(today);
                return (
                  <TableRow key={l.id}>
                    <TableCell>{fmtDate(l.data_vencimento)}</TableCell>
                    <TableCell>{l.descricao}</TableCell>
                    <TableCell className="text-right font-medium">{brl(l.valor)}</TableCell>
                    <TableCell>
                      <Badge variant={overdue ? "destructive" : "secondary"}>
                        {overdue ? "Vencida" : "A vencer"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone: "primary" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30",
    warning: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30",
    danger: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={`p-2 rounded-md ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
