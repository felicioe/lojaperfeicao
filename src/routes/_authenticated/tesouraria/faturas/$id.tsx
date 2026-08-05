import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterLancamento } from "@/lib/backend/tesouraria-lancamentos";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/format";
import { FileWarning, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tesouraria/faturas/$id")({
  head: () => ({ meta: [{ title: "Fatura — Gestão Maçônica" }] }),
  component: FaturaDetalhe,
});

function FaturaDetalhe() {
  const { id } = useParams({ from: "/_authenticated/tesouraria/faturas/$id" });
  const { data: fatura, isLoading } = useQuery({
    queryKey: ["fatura", id],
    queryFn: () => obterLancamento({ data: { id } }),
  });

  if (isLoading) return null;

  if (!fatura) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState icon={FileWarning} title="Fatura não encontrada" />
        </CardContent>
      </Card>
    );
  }

  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());

  return (
    <div className="space-y-4">
      <PageHeader title="Fatura" />
      <div className="print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> Imprimir / salvar PDF
        </Button>
      </div>
      <Card className="mx-auto max-w-2xl print:border-none print:shadow-none">
        <CardContent className="space-y-6 p-8">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Fatura de mensalidade</h2>
              <p className="text-sm text-muted-foreground">Emitida em {hoje}</p>
            </div>
            <span
              className={
                "rounded-full px-3 py-1 text-xs font-medium " +
                (fatura.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")
              }
            >
              {fatura.pago ? "Pago" : "Em aberto"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Irmão</div>
              <div className="font-medium">{fatura.irmao_nome ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">CIM</div>
              <div className="font-medium">{fatura.irmao_cim ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Descrição</div>
              <div className="font-medium">{fatura.descricao}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Competência</div>
              <div className="font-medium">
                {fatura.competencia_mes ? fmtDate(fatura.competencia_mes) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Data de emissão</div>
              <div className="font-medium">{fmtDate(fatura.data)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Vencimento</div>
              <div className="font-medium">
                {fatura.data_vencimento ? fmtDate(fatura.data_vencimento) : "—"}
              </div>
            </div>
            {fatura.pago && (
              <div>
                <div className="text-muted-foreground">Data de pagamento</div>
                <div className="font-medium">
                  {fatura.data_pagamento ? fmtDate(fatura.data_pagamento) : "—"}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">Valor total</span>
            <span className="text-2xl font-semibold">{brl(fatura.valor)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
