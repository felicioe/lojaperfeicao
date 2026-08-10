import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarRecibos, listarReciboItens } from "@/lib/backend/tesouraria-recibos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

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
  const ord = useOrdenacao(recibos, {
    data: (r) => r.data,
    irmao: (r) => r.irmaos?.nome_civil,
    conta: (r) => r.contas_financeiras?.nome,
    forma: (r) => r.forma_pagamento,
    original: (r) => Number(r.valor_original),
    multaJuros: (r) => Number(r.valor_multa) + Number(r.valor_juros),
    desconto: (r) => Number(r.desconto),
    total: (r) => Number(r.valor_total),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  return (
    <>
      <PageHeader
        title="Recibos"
        description="Recibos emitidos na baixa de faturas (individuais ou agrupados)."
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHeadOrdenavel campo="data" ord={ord}>
                Data
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="irmao" ord={ord}>
                Irmão
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="conta" ord={ord}>
                Conta
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="forma" ord={ord}>
                Forma
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="original" ord={ord} className="text-right">
                Original
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="multaJuros" ord={ord} className="text-right">
                Multa+Juros
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="desconto" ord={ord} className="text-right">
                Desconto
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="total" ord={ord} className="text-right">
                Total
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recibos.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                  Nenhum recibo emitido ainda.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((r) => (
              <Fragment key={r.id}>
                <TableRow>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                    >
                      {expandido === r.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>{fmtDate(r.data)}</TableCell>
                  <TableCell className="font-medium">{r.irmaos?.nome_civil ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.contas_financeiras?.nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.forma_pagamento ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{brl(r.valor_original)}</TableCell>
                  <TableCell className="text-right">
                    {brl(Number(r.valor_multa) + Number(r.valor_juros))}
                  </TableCell>
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
        <TabelaPaginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalItens={totalItens}
          tamanhoPagina={tamanhoPagina}
          setPagina={setPagina}
        />
      </Card>
    </>
  );
}

function ReciboItensPanel({ reciboId }: { reciboId: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["recibo_itens", reciboId],
    queryFn: () => listarReciboItens({ data: { reciboId } }),
  });
  const ord = useOrdenacao(itens, {
    descricao: (it) => it.lancamentos?.descricao,
    vencimento: (it) => it.lancamentos?.data_vencimento,
    original: (it) => Number(it.valor_original),
    multa: (it) => Number(it.valor_multa),
    juros: (it) => Number(it.valor_juros),
  });

  return (
    <div className="py-2">
      <div className="text-sm font-medium mb-2">Faturas incluídas neste recibo</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeadOrdenavel campo="descricao" ord={ord}>
              Descrição
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="vencimento" ord={ord}>
              Vencimento
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="original" ord={ord} className="text-right">
              Original
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="multa" ord={ord} className="text-right">
              Multa
            </TableHeadOrdenavel>
            <TableHeadOrdenavel campo="juros" ord={ord} className="text-right">
              Juros
            </TableHeadOrdenavel>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ord.itensOrdenados.map((it) => (
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
