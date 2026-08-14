import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { listarLancamentosParaImpressao } from "@/lib/backend/tesouraria-lancamentos";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { FaturaAgrupadaCard } from "@/components/app/FaturaAgrupadaCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileWarning, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tesouraria/faturas/imprimir")({
  head: () => ({ meta: [{ title: "Faturas agrupadas — Gestão Maçônica" }] }),
  validateSearch: (search) => z.object({ ids: z.string().min(1) }).parse(search),
  component: FaturasImprimirAgrupado,
});

function FaturasImprimirAgrupado() {
  const { ids } = Route.useSearch();
  const idsArray = ids.split(",").filter(Boolean);

  const { data: faturas, isLoading } = useQuery({
    queryKey: ["faturas_para_impressao", idsArray],
    queryFn: () => listarLancamentosParaImpressao({ data: { ids: idsArray } }),
  });

  if (isLoading) return null;

  if (!faturas || faturas.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState icon={FileWarning} title="Nenhuma fatura encontrada" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Faturas agrupadas" />
      <div className="print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> Imprimir / salvar PDF
        </Button>
      </div>
      <FaturaAgrupadaCard faturas={faturas} />
    </div>
  );
}
