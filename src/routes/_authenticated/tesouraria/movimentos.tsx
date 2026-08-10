import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { AcoesLancamento } from "@/components/app/LancamentoAcoes";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate } from "@/lib/format";
import {
  CATEGORIA_LABEL,
  RecebimentoAvulsoDialog,
  useMovimentosFiltrados,
} from "@/components/app/RecebimentoAvulso";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";

export const Route = createFileRoute("/_authenticated/tesouraria/movimentos")({
  head: () => ({ meta: [{ title: "Movimento Financeiro — Gestão Maçônica" }] }),
  component: Movimentos,
});

function Movimentos() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;
  const [openNovo, setOpenNovo] = useState(false);
  const f = useMovimentosFiltrados();

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });
  const { data: receitas = [] } = useQuery({
    queryKey: ["planos_receita"],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "receita" } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["movimentos_financeiros"] });
  const ord = useOrdenacao(f.movimentos, {
    emissao: (m) => m.data,
    vencimento: (m) => m.data_vencimento,
    descricao: (m) => m.descricao,
    irmao: (m) => m.irmao_nome,
    tipo: (m) => m.tipo,
    valor: (m) => Number(m.valor),
    status: (m) => (m.pago ? 1 : 0),
  });
  const movPag = usePaginacao(ord.itensOrdenados);

  const totalEntradas = f.movimentos
    .filter((m) => m.tipo === "entrada")
    .reduce((s, m) => s + Number(m.valor), 0);
  const totalSaidas = f.movimentos
    .filter((m) => m.tipo === "saida")
    .reduce((s, m) => s + Number(m.valor), 0);

  return (
    <>
      <PageHeader
        title="Movimento Financeiro"
        description="Relatório unificado de entradas, saídas e transferências, com filtros e categorização."
        actions={
          podeEditar && (
            <Dialog open={openNovo} onOpenChange={setOpenNovo}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" /> Recebimento avulso
                </Button>
              </DialogTrigger>
              <RecebimentoAvulsoDialog
                contas={contas}
                onDone={() => {
                  setOpenNovo(false);
                  invalidate();
                }}
              />
            </Dialog>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total entradas</div>
          <div className="text-2xl font-semibold">{brl(totalEntradas)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total saídas</div>
          <div className="text-2xl font-semibold">{brl(totalSaidas)}</div>
        </Card>
      </div>

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-5">
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={f.de} onChange={(e) => f.setDe(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={f.ate} onChange={(e) => f.setAte(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Conta</Label>
          <Select value={f.contaId} onValueChange={f.setContaId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={f.tipo} onValueChange={f.setTipo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
              <SelectItem value="transferencia">Transferência</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Categoria</Label>
          <Select value={f.categoria} onValueChange={f.setCategoria}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="emissao" ord={ord} className="px-2">
                  Emissão
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="vencimento" ord={ord} className="px-2">
                  Vencimento
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="descricao" ord={ord} className="px-2">
                  Descrição
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="irmao" ord={ord} className="px-2">
                  Irmão
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tipo" ord={ord} className="px-2">
                  Tipo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor" ord={ord} className="px-2 text-right">
                  Valor
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="status" ord={ord} className="px-2">
                  Status
                </TableHeadOrdenavel>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.movimentos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    Nenhum movimento encontrado.
                  </TableCell>
                </TableRow>
              )}
              {movPag.itensPagina.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="px-2">{fmtDate(m.data)}</TableCell>
                  <TableCell className="px-2">
                    {m.data_vencimento ? fmtDate(m.data_vencimento) : "—"}
                  </TableCell>
                  <TableCell className="px-2">{m.descricao}</TableCell>
                  <TableCell className="px-2 text-muted-foreground">
                    {m.irmao_nome ?? "—"}
                  </TableCell>
                  <TableCell className="px-2">
                    <Badge
                      variant={
                        m.tipo === "entrada"
                          ? "default"
                          : m.tipo === "saida"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {m.tipo === "entrada"
                        ? "Entrada"
                        : m.tipo === "saida"
                          ? "Saída"
                          : m.tipo === "transferencia"
                            ? "Transferência"
                            : m.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 text-right font-medium">{brl(m.valor)}</TableCell>
                  <TableCell className="px-2">
                    {m.pago ? (
                      <Badge variant="secondary">Pago</Badge>
                    ) : (
                      <Badge variant="outline">Aberto</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {podeEditar && (
                      <AcoesLancamento
                        lancamento={m}
                        contas={contas}
                        receitas={receitas}
                        onDone={invalidate}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
