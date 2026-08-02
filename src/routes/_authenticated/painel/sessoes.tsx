import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarSessoes } from "@/lib/backend/sessoes";
import { useIsDesktop } from "@/lib/use-media-query";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, TIPO_SESSAO_LABEL, GRAU_LABEL } from "@/lib/format";
import { CalendarDays } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/sessoes")({
  component: PainelSessoes,
});

function PainelSessoes() {
  const isDesktop = useIsDesktop();
  const sessoes = useQuery({ queryKey: ["painel", "sessoes"], queryFn: () => listarSessoes() });
  const hoje = new Date().toISOString().slice(0, 10);
  const itens = [...(sessoes.data ?? [])].sort((a, b) => b.data.localeCompare(a.data));

  if (itens.length === 0) {
    return (
      <>
        {isDesktop && <PageHeader title="Sessões" />}
        <Card>
          <CardContent className="pt-6">
            <EmptyState icon={CalendarDays} title="Nenhuma sessão cadastrada" />
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-2">
      {isDesktop && <PageHeader title="Sessões" />}
      {itens.map((s) => {
        const futura = s.data >= hoje;
        return (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{fmtDate(s.data)}</p>
                <p className="text-xs text-muted-foreground">
                  {TIPO_SESSAO_LABEL[s.tipo] ?? s.tipo} · {GRAU_LABEL[s.grau] ?? s.grau}
                </p>
              </div>
              <Badge variant={futura ? "secondary" : "outline"}>{futura ? "A realizar" : "Realizada"}</Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
