import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterLancamento } from "@/lib/backend/tesouraria-lancamentos";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { FaturaCard } from "@/components/app/FaturaCard";
import { BotaoImprimir } from "@/components/app/BotaoImprimir";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/lib/use-media-query";
import { ArrowLeft, FileWarning } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/faturas/$id")({
  head: () => ({ meta: [{ title: "Fatura — Gestão Maçônica" }] }),
  component: PainelFaturaDetalhe,
});

function PainelFaturaDetalhe() {
  const isDesktop = useIsDesktop();
  const { id } = useParams({ from: "/_authenticated/painel/faturas/$id" });
  const {
    data: fatura,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["fatura", id],
    queryFn: () => obterLancamento({ data: { id } }),
  });

  if (isLoading) return null;

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={FileWarning}
            title="Não foi possível carregar a fatura"
            description="Falha ao buscar os dados. Tente novamente."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  if (!fatura) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState icon={FileWarning} title="Fatura não encontrada" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isDesktop && <PageHeader title="Fatura" />}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/painel/financeiro">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <BotaoImprimir faturaId={fatura.id} />
      </div>
      <FaturaCard fatura={fatura} />
    </div>
  );
}
