import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate } from "@/lib/format";
import {
  RecebimentoAvulsoDialog,
  useMovimentosFiltrados,
} from "@/components/app/RecebimentoAvulso";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/tesouraria/tronco")({
  head: () => ({ meta: [{ title: "Tronco de Beneficência — Gestão Maçônica" }] }),
  component: Tronco,
});

function Tronco() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;
  const [open, setOpen] = useState(false);
  // Lançamento de tronco nasce sempre pago=TRUE (registrar_recebimento_avulso) —
  // "não pago" (padrão do hook) deixaria essa tela permanentemente vazia.
  const f = useMovimentosFiltrados({ categoria: "tronco", statusInicial: "todos" });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["movimentos_financeiros"] });
  const total = f.movimentos.reduce((s, m) => s + Number(m.valor), 0);
  const ord = useOrdenacao(f.movimentos, {
    data: (m) => m.data,
    descricao: (m) => m.descricao,
    conta: (m) => m.contas_financeiras?.nome,
    valor: (m) => Number(m.valor),
  });
  const movPag = usePaginacao(ord.itensOrdenados);

  return (
    <>
      <PageHeader
        title="Tronco de Beneficência"
        description="Arrecadações do tronco — mesma tabela de recebimentos, filtrada pela categoria."
        actions={
          <div className="flex gap-2">
            {podeEditar && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-1" /> Registrar Tronco
                  </Button>
                </DialogTrigger>
                <RecebimentoAvulsoDialog
                  contas={contas}
                  categoriaInicial="tronco"
                  onDone={() => {
                    setOpen(false);
                    invalidate();
                  }}
                />
              </Dialog>
            )}
            <Link to="/tesouraria/movimentos">
              <Button variant="outline">Ver todos os movimentos</Button>
            </Link>
          </div>
        }
      />

      <Card className="mb-4 p-4">
        <div className="text-sm text-muted-foreground">Total arrecadado</div>
        <div className="text-2xl font-semibold">{brl(total)}</div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="data" ord={ord}>
                Data
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="descricao" ord={ord}>
                Descrição
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="conta" ord={ord}>
                Conta
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                Valor
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {f.movimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                  Nenhuma arrecadação registrada ainda.
                </TableCell>
              </TableRow>
            )}
            {movPag.itensPagina.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{fmtDate(m.data)}</TableCell>
                <TableCell>{m.descricao}</TableCell>
                <TableCell className="text-muted-foreground">
                  {m.contas_financeiras?.nome ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium">{brl(m.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TabelaPaginacao
          pagina={movPag.pagina}
          totalPaginas={movPag.totalPaginas}
          totalItens={movPag.totalItens}
          tamanhoPagina={movPag.tamanhoPagina}
          setPagina={movPag.setPagina}
        />
      </Card>
    </>
  );
}
