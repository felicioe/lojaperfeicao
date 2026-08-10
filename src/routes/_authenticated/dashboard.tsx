import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  listarContasAPagarProximas,
  obterProjecaoFluxo,
  contarMembrosAtivos,
  contarSessoesMes,
  listarAniversariantesMes,
} from "@/lib/backend/dashboard";
import { listarSaldoContas } from "@/lib/backend/tesouraria-contas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/AppShell";
import { brl, fmtDate } from "@/lib/format";
import { CalendarClock, Wallet, TrendingUp, Users, CalendarDays, Cake } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/dashboard")({
  // quem só tem o papel "irmao" (sem admin/tesoureiro/secretario) usa o
  // painel reduzido, não o dashboard administrativo.
  beforeLoad: ({ context }) => {
    const papeis = context.usuario?.papeis ?? [];
    const privilegiado = papeis.some(
      (p) => p === "admin" || p === "tesoureiro" || p === "secretario",
    );
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

  const membrosAtivos = useQuery({
    queryKey: ["dash", "membrosAtivos"],
    queryFn: () => contarMembrosAtivos(),
  });

  const sessoesMes = useQuery({
    queryKey: ["dash", "sessoesMes"],
    queryFn: () => contarSessoesMes(),
  });

  const aniversariantes = useQuery({
    queryKey: ["dash", "aniversariantes"],
    queryFn: () => listarAniversariantesMes(),
  });

  const totalPagar = (contasPagar.data ?? []).reduce((a, r: any) => a + Number(r.valor), 0);
  const saldoAtual = (saldos.data ?? []).reduce((a, r: any) => a + Number(r.saldo_atual ?? 0), 0);
  const projetado = saldoAtual + (projecao.data?.delta ?? 0);
  const proximosAniversariantes = (aniversariantes.data ?? [])
    .slice(0, 2)
    .map((a) => a.nome_civil.split(" ")[0])
    .join(", ");

  const ordContasPagar = useOrdenacao(contasPagar.data ?? [], {
    vencimento: (l) => l.data_vencimento,
    descricao: (l) => l.descricao,
    valor: (l) => Number(l.valor),
    status: (l) => (new Date(l.data_vencimento) < new Date(today) ? 1 : 0),
  });

  return (
    <>
      <PageHeader title="Dashboard" description="Visão geral da loja e dos próximos 30 dias." />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Membros Ativos"
          value={String(membrosAtivos.data ?? "—")}
          tone="primary"
        />
        <MetricCard
          icon={CalendarDays}
          label="Sessões do Mês"
          value={String(sessoesMes.data ?? "—")}
          tone="primary"
        />
        <MetricCard
          icon={CalendarClock}
          label="Pendências Financeiras"
          value={brl(totalPagar)}
          hint={`${contasPagar.data?.length ?? 0} lançamento(s) em 30 dias`}
          tone="warning"
        />
        <MetricCard
          icon={Cake}
          label="Aniversariantes do Mês"
          value={String(aniversariantes.data?.length ?? "—")}
          hint={proximosAniversariantes || undefined}
          tone="gold"
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
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
                <TableHeadOrdenavel campo="vencimento" ord={ordContasPagar}>
                  Vencimento
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="descricao" ord={ordContasPagar}>
                  Descrição
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor" ord={ordContasPagar} className="text-right">
                  Valor
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="status" ord={ordContasPagar}>
                  Status
                </TableHeadOrdenavel>
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
              {ordContasPagar.itensOrdenados.map((l: any) => {
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
  tone: "primary" | "success" | "warning" | "danger" | "gold";
}) {
  const toneClass = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30",
    warning: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30",
    danger: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30",
    gold: "text-gold-foreground bg-gold-muted",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={`shrink-0 rounded-md p-2 ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
