import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { useIsDesktop } from "@/lib/use-media-query";
import { listarLancamentosIrmao } from "@/lib/backend/irmaos";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate } from "@/lib/format";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/financeiro")({
  component: PainelFinanceiro,
});

function PainelFinanceiro() {
  const isDesktop = useIsDesktop();
  const meuIrmao = useMeuIrmao();
  const irmaoId = meuIrmao.data?.id ?? null;

  const lancamentos = useQuery({
    queryKey: ["painel", "lancamentos", irmaoId],
    queryFn: () => listarLancamentosIrmao({ data: { irmaoId: irmaoId! } }),
    enabled: !!irmaoId,
  });

  if (meuIrmao.isLoading) return null;
  if (!meuIrmao.data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState icon={Wallet} title="Cadastro ainda não vinculado" />
        </CardContent>
      </Card>
    );
  }

  const itens = lancamentos.data ?? [];
  const emAberto = itens.filter((l) => !l.pago);
  const totalEmAberto = emAberto.reduce((a, l) => a + Number(l.valor), 0);

  return (
    <div className="space-y-4">
      {isDesktop && <PageHeader title="Financeiro" />}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-sm text-muted-foreground">Em aberto</p>
            <p className="text-2xl font-semibold">{brl(totalEmAberto)}</p>
            <p className="text-xs text-muted-foreground">{emAberto.length} lançamento(s)</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Wallet className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {itens.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState icon={Wallet} title="Nenhum lançamento encontrado" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {itens.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.descricao}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(l.data)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold">{brl(l.valor)}</span>
                  <Badge variant={l.pago ? "secondary" : "destructive"}>{l.pago ? "Pago" : "Em aberto"}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
