import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterMeuIrmao, listarLancamentosIrmao, listarFrequenciaIrmao } from "@/lib/backend/irmaos";
import { listarSessoes } from "@/lib/backend/sessoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate, GRAU_LABEL, SITUACAO_LABEL, TIPO_SESSAO_LABEL } from "@/lib/format";
import { UserRound, Wallet, CalendarCheck2, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Meu Painel — Gestão Maçônica" },
      { name: "description", content: "Meus dados, situação financeira, sessões e frequência." },
    ],
  }),
  component: Painel,
});

function Painel() {
  const meuIrmao = useQuery({
    queryKey: ["painel", "meuIrmao"],
    queryFn: () => obterMeuIrmao(),
  });

  const irmaoId = meuIrmao.data?.id ?? null;

  const lancamentos = useQuery({
    queryKey: ["painel", "lancamentos", irmaoId],
    queryFn: () => listarLancamentosIrmao({ data: { irmaoId: irmaoId! } }),
    enabled: !!irmaoId,
  });

  const frequencia = useQuery({
    queryKey: ["painel", "frequencia", irmaoId],
    queryFn: () => listarFrequenciaIrmao({ data: { irmaoId: irmaoId! } }),
    enabled: !!irmaoId,
  });

  const sessoes = useQuery({
    queryKey: ["painel", "sessoes"],
    queryFn: () => listarSessoes(),
  });

  if (meuIrmao.isLoading) return null;

  if (!meuIrmao.data) {
    return (
      <>
        <PageHeader title="Meu Painel" description="Suas informações pessoais, financeiras e de frequência." />
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={UserRound}
              title="Cadastro ainda não vinculado"
              description="Seu login ainda não está associado a um cadastro de irmão. Fale com a secretaria da loja para vincular seu usuário."
            />
          </CardContent>
        </Card>
      </>
    );
  }

  const irmao = meuIrmao.data;
  const hoje = new Date().toISOString().slice(0, 10);

  const emAberto = (lancamentos.data ?? []).filter((l) => !l.pago);
  const totalEmAberto = emAberto.reduce((a, l) => a + Number(l.valor), 0);

  const proximasSessoes = (sessoes.data ?? [])
    .filter((s) => s.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 5);

  const totalSessoesFreq = frequencia.data?.length ?? 0;
  const presencas = (frequencia.data ?? []).filter((f) => f.presente).length;
  const percentualFrequencia = totalSessoesFreq > 0 ? Math.round((presencas / totalSessoesFreq) * 100) : 0;

  return (
    <>
      <PageHeader title="Meu Painel" description={`Bem-vindo(a), ${irmao.nome_civil}.`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={UserRound}
          label="Situação"
          value={SITUACAO_LABEL[irmao.situacao] ?? irmao.situacao}
          hint={`${GRAU_LABEL[irmao.grau] ?? irmao.grau}${irmao.nome_simbolico ? ` · ${irmao.nome_simbolico}` : ""}`}
          tone={irmao.situacao === "ativo" || irmao.situacao === "quite" ? "success" : "danger"}
        />
        <MetricCard
          icon={Wallet}
          label="Mensalidades em aberto"
          value={brl(totalEmAberto)}
          hint={`${emAberto.length} lançamento(s)`}
          tone={emAberto.length > 0 ? "warning" : "success"}
        />
        <MetricCard
          icon={CalendarCheck2}
          label="Minha frequência"
          value={`${percentualFrequencia}%`}
          hint={`${presencas} de ${totalSessoesFreq} sessão(ões)`}
          tone={percentualFrequencia >= 75 ? "success" : "warning"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meus dados</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <InfoRow label="Nome civil" value={irmao.nome_civil} />
            <InfoRow label="Nome simbólico" value={irmao.nome_simbolico} />
            <InfoRow label="CIM" value={irmao.cim} />
            <InfoRow label="Grau" value={GRAU_LABEL[irmao.grau] ?? irmao.grau} />
            <InfoRow label="Potência" value={irmao.potencia} />
            <InfoRow label="Loja de origem" value={irmao.loja_origem} />
            <InfoRow label="E-mail" value={irmao.email} />
            <InfoRow label="Telefone" value={irmao.telefone ?? irmao.celular} />
            <InfoRow label="Data de iniciação" value={fmtDate(irmao.data_iniciacao)} />
            <InfoRow label="Data de elevação" value={fmtDate(irmao.data_elevacao)} />
            <InfoRow label="Data de exaltação" value={fmtDate(irmao.data_exaltacao)} />
            <InfoRow label="Mensalidade" value={brl(irmao.valor_mensalidade)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Próximas sessões
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proximasSessoes.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nenhuma sessão agendada" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Grau</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proximasSessoes.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{fmtDate(s.data)}</TableCell>
                      <TableCell>{TIPO_SESSAO_LABEL[s.tipo] ?? s.tipo}</TableCell>
                      <TableCell>{GRAU_LABEL[s.grau] ?? s.grau}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Minha situação financeira</CardTitle>
          </CardHeader>
          <CardContent>
            {(lancamentos.data ?? []).length === 0 ? (
              <EmptyState icon={Wallet} title="Nenhum lançamento encontrado" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lancamentos.data ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{fmtDate(l.data)}</TableCell>
                      <TableCell>{l.descricao}</TableCell>
                      <TableCell className="text-right font-medium">{brl(l.valor)}</TableCell>
                      <TableCell>
                        <Badge variant={l.pago ? "secondary" : "destructive"}>
                          {l.pago ? "Pago" : "Em aberto"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-muted-foreground" /> Minha frequência
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(frequencia.data ?? []).length === 0 ? (
              <EmptyState icon={CalendarCheck2} title="Nenhuma sessão registrada ainda" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Presença</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(frequencia.data ?? []).map((f) => {
                    const status = presencaStatus(f.presente, f.justificado);
                    return (
                      <TableRow key={f.id}>
                        <TableCell>{fmtDate(f.data)}</TableCell>
                        <TableCell>{TIPO_SESSAO_LABEL[f.tipo] ?? f.tipo}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function presencaStatus(
  presente: boolean | null,
  justificado: boolean,
): { label: string; variant: "secondary" | "outline" | "destructive" } {
  if (presente === null) return { label: "Não registrada", variant: "outline" };
  if (presente) return { label: "Presente", variant: "secondary" };
  if (justificado) return { label: "Justificado", variant: "outline" };
  return { label: "Ausente", variant: "destructive" };
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value || "—"}</div>
    </div>
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
