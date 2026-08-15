import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { listarLancamentos } from "@/lib/backend/tesouraria-lancamentos";
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
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["movimentos_financeiros"] });
    qc.invalidateQueries({ queryKey: ["movimentos_financeiros_totais"] });
  };
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

  // Total entradas/saídas precisa ignorar o filtro de Status (senão, com
  // o padrão "Não pago", os cards mostrariam só o que ainda está em
  // aberto como se fosse o total movimentado — mesmo problema já
  // corrigido nos cards de Cobranças SGCAB). Busca à parte, com os
  // mesmos filtros de data/conta/tipo/categoria/irmão mas sem status.
  const { data: movimentosParaTotais = [] } = useQuery({
    queryKey: [
      "movimentos_financeiros_totais",
      f.de,
      f.ate,
      f.contaId,
      f.tipo,
      f.categoria,
      f.irmaoId,
    ],
    queryFn: () =>
      listarLancamentos({
        data: {
          de: f.de || null,
          ate: f.ate || null,
          contaId: f.contaId !== "todas" ? f.contaId : null,
          tipo: f.tipo !== "todos" ? (f.tipo as "entrada" | "saida" | "transferencia") : null,
          categoria: f.categoria !== "todas" ? f.categoria : null,
          irmaoId: f.irmaoId !== "todos" ? f.irmaoId : null,
          pago: null,
          limite: 500,
        },
      }),
  });
  const totalEntradas = movimentosParaTotais
    .filter((m) => m.tipo === "entrada")
    .reduce((s, m) => s + Number(m.valor), 0);
  const totalSaidas = movimentosParaTotais
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

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4 lg:grid-cols-7">
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
        <div>
          <Label className="text-xs">Irmão</Label>
          <Select value={f.irmaoId} onValueChange={f.setIrmaoId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {irmaos.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome_civil}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={f.status}
            onValueChange={(v) =>
              f.setStatus(v as "todos" | "pago" | "nao_pago" | "vencido" | "a_vencer")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nao_pago">Não pago</SelectItem>
              <SelectItem value="vencido">Vencidos</SelectItem>
              <SelectItem value="a_vencer">A vencer</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="sm:hidden">
          <div className="sr-only" aria-live="polite">
            {f.isError
              ? "Erro ao carregar os movimentos."
              : `${movPag.itensPagina.length} movimentos carregados.`}
          </div>
          {f.isError && (
            <p className="px-4 py-6 text-center text-destructive">
              Erro ao carregar os movimentos. Tente novamente.
            </p>
          )}
          {!f.isError && f.movimentos.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground">
              Nenhum movimento encontrado.
            </p>
          )}
          <ul className="divide-y" aria-label="Movimentos financeiros">
            {movPag.itensPagina.map((m) => (
              <li key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-medium leading-snug">{m.descricao}</p>
                    {m.irmao_nome && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {m.irmao_nome}
                      </p>
                    )}
                  </div>
                  <p
                    className={`shrink-0 text-right text-base font-semibold tabular-nums ${
                      m.tipo === "entrada"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : m.tipo === "saida"
                          ? "text-destructive"
                          : "text-foreground"
                    }`}
                  >
                    {brl(m.valor)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
                  <span>{fmtDate(m.data)}</span>
                  {m.data_vencimento && <span>· vence {fmtDate(m.data_vencimento)}</span>}
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
                  {m.pago ? (
                    <Badge variant="secondary">Pago</Badge>
                  ) : (
                    <Badge variant="outline">Aberto</Badge>
                  )}
                </div>
                {podeEditar && (
                  <div className="-mr-2 mt-2 flex justify-end [&_button]:h-8 [&_button]:w-8 [&_button]:p-0">
                    <AcoesLancamento
                      lancamento={m}
                      contas={contas}
                      receitas={receitas}
                      onDone={invalidate}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="hidden overflow-x-auto sm:block">
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
              {f.isError && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-destructive">
                    Erro ao carregar os movimentos. Tente novamente.
                  </TableCell>
                </TableRow>
              )}
              {!f.isError && f.movimentos.length === 0 && (
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
