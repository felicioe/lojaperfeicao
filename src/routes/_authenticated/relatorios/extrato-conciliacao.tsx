import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { relatorioExtratoConciliacao } from "@/lib/backend/relatorios";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { desfazerConciliacao, desfazerLancamentoOfx } from "@/lib/backend/tesouraria-conciliacao";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { DesfazerConciliacaoDialog } from "@/components/app/DesfazerConciliacaoDialog";
import { AtribuirIrmaoDialog } from "@/components/app/LancamentoAcoes";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/relatorios/extrato-conciliacao")({
  head: () => ({ meta: [{ title: "Extrato da Conciliação — Gestão Maçônica" }] }),
  component: ExtratoConciliacao,
});

const COLUNAS: ColunaRelatorio[] = [
  { chave: "data", titulo: "Data" },
  { chave: "descricao", titulo: "Descrição (OFX)" },
  { chave: "valor", titulo: "Valor" },
  { chave: "status", titulo: "Status" },
  { chave: "vinculados", titulo: "Lançamento(s) vinculado(s)" },
];

function ExtratoConciliacao() {
  const can = useCan();
  const qc = useQueryClient();
  const [contaId, setContaId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [irmaoId, setIrmaoId] = useState("todos");

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const { data: todosItens = [] } = useQuery({
    queryKey: ["relatorio_extrato_conciliacao", contaId, de, ate],
    enabled: !!contaId,
    queryFn: () =>
      relatorioExtratoConciliacao({
        data: { contaId, de: de || null, ate: ate || null },
      }),
  });
  const itens = todosItens.filter(
    (i) => irmaoId === "todos" || i.lancamentos_vinculados.some((l) => l.irmao_id === irmaoId),
  );

  const desfazerMutation = useMutation({
    mutationFn: (vars: { conciliacaoId: string; motivo: string }) =>
      desfazerConciliacao({ data: vars }),
    onSuccess: () => {
      toast.success("Conciliação desfeita — linhas voltaram a pendente/em aberto.");
      qc.invalidateQueries({ queryKey: ["relatorio_extrato_conciliacao"] });
    },
    onError: (err: Error) => toast.error(err.message ?? "Erro ao desfazer conciliação."),
  });

  const desfazerLegadoMutation = useMutation({
    mutationFn: (vars: { ofxId: string; motivo: string }) => desfazerLancamentoOfx({ data: vars }),
    onSuccess: () => {
      toast.success("Conciliação desfeita — linha voltou a pendente/em aberto.");
      qc.invalidateQueries({ queryKey: ["relatorio_extrato_conciliacao"] });
    },
    onError: (err: Error) => toast.error(err.message ?? "Erro ao desfazer conciliação."),
  });

  const totalConciliado = itens
    .filter((i) => i.conciliado)
    .reduce((s, i) => s + Number(i.valor), 0);
  const totalPendente = itens.filter((i) => !i.conciliado).reduce((s, i) => s + Number(i.valor), 0);
  const qtdConciliado = itens.filter((i) => i.conciliado).length;
  const qtdPendente = itens.filter((i) => !i.conciliado).length;

  const linhasExportacao = itens.map((i) => ({
    data: fmtDate(i.data),
    descricao: i.descricao ?? "—",
    valor: Number(i.valor),
    status: i.conciliado ? "Conciliado" : "Pendente",
    vinculados: i.lancamentos_vinculados.map((l) => l.descricao).join("; ") || "—",
  }));

  const ord = useOrdenacao(itens, {
    data: (i) => i.data,
    descricao: (i) => i.descricao,
    valor: (i) => Number(i.valor),
    status: (i) => (i.conciliado ? 1 : 0),
  });
  const pag = usePaginacao(ord.itensOrdenados);

  return (
    <>
      <PageHeader
        title="Relatório de Extrato da Conciliação"
        description="Linhas do extrato OFX importado e os lançamentos com que foram conciliadas, ou pendências."
        actions={
          contaId && (
            <ExportarRelatorio
              titulo="Extrato da Conciliação"
              colunas={COLUNAS}
              linhas={linhasExportacao}
            />
          )
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-3">
        <div>
          <Label className="text-xs">Conta bancária</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Irmão</Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
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
      </Card>

      {!contaId && (
        <Card className="p-6 text-center text-muted-foreground">
          Selecione uma conta bancária para ver o extrato.
        </Card>
      )}

      {contaId && (
        <>
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Conciliado</div>
              <div className="text-2xl font-semibold">{brl(totalConciliado)}</div>
              <div className="text-xs text-muted-foreground">{qtdConciliado} linha(s)</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Pendente</div>
              <div className="text-2xl font-semibold">{brl(totalPendente)}</div>
              <div className="text-xs text-muted-foreground">{qtdPendente} linha(s)</div>
            </Card>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeadOrdenavel campo="data" ord={ord}>
                      Data
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="descricao" ord={ord}>
                      Descrição (OFX)
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                      Valor
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="status" ord={ord}>
                      Status
                    </TableHeadOrdenavel>
                    <TableHead>Lançamento(s) vinculado(s)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        Nenhuma linha de extrato encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                  {pag.itensPagina.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{fmtDate(i.data)}</TableCell>
                      <TableCell>{i.descricao ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{brl(i.valor)}</TableCell>
                      <TableCell>
                        {i.conciliado ? (
                          <Badge variant="secondary">Conciliado</Badge>
                        ) : (
                          <Badge variant="outline">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {i.lancamentos_vinculados.length > 0 ? (
                          <div className="grid gap-1">
                            {i.lancamentos_vinculados.map((l) => (
                              <div key={l.id} className="flex items-center gap-1">
                                <span>
                                  {l.descricao}
                                  {l.tipo === "entrada" && (
                                    <span className="text-xs">
                                      {" — "}
                                      {l.irmao_nome ?? "sem irmão vinculado"}
                                    </span>
                                  )}
                                </span>
                                {l.tipo === "entrada" && can.canManageFinancas && (
                                  <AtribuirIrmaoDialog
                                    lancamento={l}
                                    onDone={() =>
                                      qc.invalidateQueries({
                                        queryKey: ["relatorio_extrato_conciliacao"],
                                      })
                                    }
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {can.canManageFinancas &&
                          i.conciliado &&
                          (i.conciliacao_id ? (
                            <DesfazerConciliacaoDialog
                              onConfirm={(motivo) =>
                                desfazerMutation.mutate({
                                  conciliacaoId: i.conciliacao_id!,
                                  motivo,
                                })
                              }
                            />
                          ) : (
                            <DesfazerConciliacaoDialog
                              onConfirm={(motivo) =>
                                desfazerLegadoMutation.mutate({ ofxId: i.id, motivo })
                              }
                            />
                          ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TabelaPaginacao
              pagina={pag.pagina}
              totalPaginas={pag.totalPaginas}
              totalItens={pag.totalItens}
              tamanhoPagina={pag.tamanhoPagina}
              setPagina={pag.setPagina}
            />
          </Card>
        </>
      )}
    </>
  );
}
