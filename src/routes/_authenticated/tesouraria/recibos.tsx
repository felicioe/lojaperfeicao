import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarRecibos, listarReciboItens } from "@/lib/server/tesouraria-recibos";
import { PageHeader } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tesouraria/recibos")({
  head: () => ({ meta: [{ title: "Recibos — Gestão Maçônica" }] }),
  component: Recibos,
});

function Recibos() {
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: recibos = [] } = useQuery({
    queryKey: ["recibos_all"],
    queryFn: () => listarRecibos(),
  });

  return (
    <>
      <PageHeader title="Recibos" description="Recibos emitidos na baixa de faturas (individuais ou agrupados)." />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Irmão</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead className="text-right">Original</TableHead>
              <TableHead className="text-right">Multa+Juros</TableHead>
              <TableHead className="text-right">Desconto</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recibos.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Nenhum recibo emitido ainda.</TableCell></TableRow>
            )}
            {recibos.map((r) => (
              <Fragment key={r.id}>
                <TableRow>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setExpandido(expandido === r.id ? null : r.id)}>
                      {expandido === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell>{fmtDate(r.data)}</TableCell>
                  <TableCell className="font-medium">{r.irmaos?.nome_civil ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.contas_financeiras?.nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.forma_pagamento ?? "—"}</TableCell>
                  <TableCell className="text-right">{brl(r.valor_original)}</TableCell>
                  <TableCell className="text-right">{brl(Number(r.valor_multa) + Number(r.valor_juros))}</TableCell>
                  <TableCell className="text-right">{brl(r.desconto)}</TableCell>
                  <TableCell className="text-right font-semibold">{brl(r.valor_total)}</TableCell>
                </TableRow>
                {expandido === r.id && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-muted/30">
                      <ReciboItensPanel reciboId={r.id} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function ReciboItensPanel({ reciboId }: { reciboId: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["recibo_itens", reciboId],
    queryFn: () => listarReciboItens({ data: { reciboId } }),
  });

  return (
    <div className="py-2">
      <div className="text-sm font-medium mb-2">Faturas incluídas neste recibo</div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Descrição</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Original</TableHead><TableHead className="text-right">Multa</TableHead><TableHead className="text-right">Juros</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((it) => (
            <TableRow key={it.id}>
              <TableCell>{it.lancamentos?.descricao}</TableCell>
              <TableCell>{fmtDate(it.lancamentos?.data_vencimento)}</TableCell>
              <TableCell className="text-right">{brl(it.valor_original)}</TableCell>
              <TableCell className="text-right">{brl(it.valor_multa)}</TableCell>
              <TableCell className="text-right">{brl(it.valor_juros)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
