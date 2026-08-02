import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { useIsDesktop } from "@/lib/use-media-query";
import { listarFrequenciaIrmao } from "@/lib/backend/irmaos";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, TIPO_SESSAO_LABEL } from "@/lib/format";
import { CalendarCheck2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/frequencia")({
  component: PainelFrequencia,
});

function presencaStatus(
  presente: boolean | null,
  justificado: boolean,
): { label: string; variant: "secondary" | "outline" | "destructive" } {
  if (presente === null) return { label: "Não registrada", variant: "outline" };
  if (presente) return { label: "Presente", variant: "secondary" };
  if (justificado) return { label: "Justificado", variant: "outline" };
  return { label: "Ausente", variant: "destructive" };
}

function PainelFrequencia() {
  const isDesktop = useIsDesktop();
  const meuIrmao = useMeuIrmao();
  const irmaoId = meuIrmao.data?.id ?? null;

  const frequencia = useQuery({
    queryKey: ["painel", "frequencia", irmaoId],
    queryFn: () => listarFrequenciaIrmao({ data: { irmaoId: irmaoId! } }),
    enabled: !!irmaoId,
  });

  if (meuIrmao.isLoading) return null;
  if (!meuIrmao.data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState icon={CalendarCheck2} title="Cadastro ainda não vinculado" />
        </CardContent>
      </Card>
    );
  }

  const itens = frequencia.data ?? [];
  const presencas = itens.filter((f) => f.presente).length;
  const percentual = itens.length > 0 ? Math.round((presencas / itens.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {isDesktop && <PageHeader title="Frequência" />}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-sm text-muted-foreground">Frequência</p>
            <p className="text-2xl font-semibold">{percentual}%</p>
            <p className="text-xs text-muted-foreground">
              {presencas} de {itens.length} sessão(ões)
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            <CalendarCheck2 className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {itens.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState icon={CalendarCheck2} title="Nenhuma sessão registrada ainda" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {itens.map((f) => {
            const status = presencaStatus(f.presente, f.justificado);
            return (
              <Card key={f.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{fmtDate(f.data)}</p>
                    <p className="text-xs text-muted-foreground">{TIPO_SESSAO_LABEL[f.tipo] ?? f.tipo}</p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
