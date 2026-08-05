import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarPlanoContas } from "@/lib/backend/plano-contas";
import { calcularMultaJuros, baixarFaturas } from "@/lib/backend/tesouraria-faturas";
import { baixarContaPagar } from "@/lib/backend/tesouraria-contas-pagar";
import {
  listarLancamentos,
  marcarLancamentoPago,
  atualizarLancamento,
  estornarLancamento,
  criarLancamentoManual,
  criarTransferencia,
  gerarMensalidades as gerarMensalidadesFn,
  type Lancamento,
} from "@/lib/backend/tesouraria-lancamentos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/lib/auth-hooks";
import { Plus, CheckCircle2, Pencil, Printer, Repeat, Trash2 } from "lucide-react";
import { usePaginacao } from "@/lib/use-paginacao";

export const Route = createFileRoute("/_authenticated/tesouraria/")({
  head: () => ({ meta: [{ title: "Tesouraria — Gestão Maçônica" }] }),
  component: Tesouraria,
});

function Tesouraria() {
  const qc = useQueryClient();
  const can = useCan();
  const [openLanc, setOpenLanc] = useState(false);
  const [openTransf, setOpenTransf] = useState(false);

  const contas = useQuery({
    queryKey: ["contas"],
    queryFn: () => listarContasFinanceiras(),
  });
  const planos = useQuery({
    queryKey: ["planos"],
    queryFn: async () => (await listarPlanoContas()).filter((p) => p.ativo),
  });
  const lancamentos = useQuery({
    queryKey: ["lancamentos"],
    queryFn: () => listarLancamentos({ data: { limite: 500 } }),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    lancamentos.data ?? [],
  );

  const invalidateLancamentos = () => qc.invalidateQueries({ queryKey: ["lancamentos"] });

  const gerarMensalidades = async () => {
    const hoje = new Date();
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
    try {
      const total = await gerarMensalidadesFn({ data: { competencia: comp } });
      toast.success(`${total} mensalidade(s) geradas para ${comp.slice(0, 7)}.`);
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar mensalidades.");
    }
  };

  return (
    <>
      <PageHeader
        title="Tesouraria"
        description="Movimento financeiro, transferências e mensalidades."
        actions={
          can.canManageFinancas && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={gerarMensalidades}>
                <Repeat className="h-4 w-4 mr-1" /> Gerar mensalidades do mês
              </Button>
              <Dialog open={openTransf} onOpenChange={setOpenTransf}>
                <DialogTrigger asChild>
                  <Button variant="outline">Transferência</Button>
                </DialogTrigger>
                <TransferenciaDialog
                  contas={contas.data ?? []}
                  onDone={() => {
                    setOpenTransf(false);
                    qc.invalidateQueries({ queryKey: ["lancamentos"] });
                  }}
                />
              </Dialog>
              <Dialog open={openLanc} onOpenChange={setOpenLanc}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-1" /> Novo lançamento
                  </Button>
                </DialogTrigger>
                <LancamentoDialog
                  contas={contas.data ?? []}
                  planos={planos.data ?? []}
                  onDone={() => {
                    setOpenLanc(false);
                    qc.invalidateQueries({ queryKey: ["lancamentos"] });
                  }}
                />
              </Dialog>
            </div>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lancamentos.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    Nenhum lançamento.
                  </TableCell>
                </TableRow>
              )}
              {itensPagina.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{fmtDate(l.data)}</TableCell>
                  <TableCell>{l.descricao}</TableCell>
                  <TableCell>
                    {l.contas_financeiras?.nome ?? "—"}
                    {l.destino?.nome && (
                      <span className="text-muted-foreground"> → {l.destino.nome}</span>
                    )}
                  </TableCell>
                  <TableCell>{l.plano_contas?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        l.tipo === "entrada"
                          ? "default"
                          : l.tipo === "saida"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {l.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{brl(l.valor)}</TableCell>
                  <TableCell>
                    {l.pago ? (
                      <Badge variant="secondary">Pago</Badge>
                    ) : (
                      <Badge variant="outline">Aberto</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {can.canManageFinancas && (
                      <div className="flex justify-end gap-1">
                        <Link to="/tesouraria/faturas/$id" params={{ id: l.id }}>
                          <Button size="sm" variant="ghost" title="Emitir/imprimir">
                            <Printer className="h-4 w-4" />
                          </Button>
                        </Link>
                        {!l.pago && (
                          <>
                            <EditarLancamentoDialog lancamento={l} onDone={invalidateLancamentos} />
                            <BaixarLancamentoDialog
                              lancamento={l}
                              contas={contas.data ?? []}
                              onDone={invalidateLancamentos}
                            />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" title="Cancelar">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Cancelar este lançamento?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove "{l.descricao}" ({brl(l.valor)}) e a contrapartida
                                    contábil correspondente, se existir. Só funciona pra lançamentos
                                    ainda em aberto e não pode ser desfeito.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={async () => {
                                      try {
                                        await estornarLancamento({ data: { id: l.id } });
                                        toast.success("Lançamento cancelado.");
                                        invalidateLancamentos();
                                      } catch (err) {
                                        toast.error(
                                          err instanceof Error ? err.message : "Erro ao cancelar.",
                                        );
                                      }
                                    }}
                                  >
                                    Cancelar lançamento
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
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
        </CardContent>
      </Card>
    </>
  );
}

function LancamentoDialog({ contas, planos, onDone }: any) {
  const [d, setD] = useState({
    data: toISODate(new Date()),
    data_vencimento: toISODate(new Date()),
    descricao: "",
    valor: 0,
    tipo: "saida",
    conta_id: contas[0]?.id ?? "",
    plano_conta_id: "",
    pago: true,
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await criarLancamentoManual({
        data: {
          data: d.data,
          data_vencimento: d.data_vencimento || null,
          descricao: d.descricao,
          valor: Number(d.valor),
          tipo: d.tipo as "entrada" | "saida",
          conta_id: d.conta_id,
          plano_conta_id: d.plano_conta_id || null,
          pago: d.pago,
          data_pagamento: d.pago ? d.data : null,
          observacoes: d.observacoes || null,
        },
      });
      toast.success("Lançamento salvo.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Novo lançamento</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Tipo</Label>
          <Select value={d.tipo} onValueChange={(v) => setD({ ...d, tipo: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Valor</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={d.valor}
            onChange={(e) => setD({ ...d, valor: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição</Label>
          <Input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
        </div>
        <div>
          <Label>Data</Label>
          <Input
            type="date"
            value={d.data}
            onChange={(e) => setD({ ...d, data: e.target.value })}
          />
        </div>
        <div>
          <Label>Vencimento</Label>
          <Input
            type="date"
            value={d.data_vencimento}
            onChange={(e) => setD({ ...d, data_vencimento: e.target.value })}
          />
        </div>
        <div>
          <Label>Conta</Label>
          <Select value={d.conta_id} onValueChange={(v) => setD({ ...d, conta_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Categoria (plano de contas)</Label>
          <Select value={d.plano_conta_id} onValueChange={(v) => setD({ ...d, plano_conta_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              {planos.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex items-center gap-2">
          <input
            id="pago"
            type="checkbox"
            checked={d.pago}
            onChange={(e) => setD({ ...d, pago: e.target.checked })}
          />
          <Label htmlFor="pago" className="cursor-pointer">
            Já pago/recebido
          </Label>
        </div>
        <div className="md:col-span-2">
          <Label>Observações</Label>
          <Textarea
            value={d.observacoes}
            onChange={(e) => setD({ ...d, observacoes: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving || !d.descricao || !d.conta_id}>
          Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TransferenciaDialog({ contas, onDone }: any) {
  const [d, setD] = useState({
    data: toISODate(new Date()),
    descricao: "Transferência",
    valor: 0,
    conta_id: contas[0]?.id ?? "",
    conta_destino_id: contas[1]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (d.conta_id === d.conta_destino_id) return toast.error("Contas devem ser diferentes.");
    setSaving(true);
    try {
      await criarTransferencia({
        data: {
          contaOrigemId: d.conta_id,
          contaDestinoId: d.conta_destino_id,
          valor: Number(d.valor),
          data: d.data,
          descricao: d.descricao,
        },
      });
      toast.success("Transferência registrada e lançamento contábil postado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao transferir.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Transferência entre contas</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Conta de origem</Label>
          <Select value={d.conta_id} onValueChange={(v) => setD({ ...d, conta_id: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Conta de destino</Label>
          <Select
            value={d.conta_destino_id}
            onValueChange={(v) => setD({ ...d, conta_destino_id: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Valor</Label>
          <Input
            type="number"
            step="0.01"
            value={d.valor}
            onChange={(e) => setD({ ...d, valor: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Data</Label>
          <Input
            type="date"
            value={d.data}
            onChange={(e) => setD({ ...d, data: e.target.value })}
          />
        </div>
        <div>
          <Label>Descrição</Label>
          <Input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving || !d.valor}>
          Transferir
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditarLancamentoDialog({
  lancamento,
  onDone,
}: {
  lancamento: Lancamento;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(lancamento.data.slice(0, 10));
  const [dataVencimento, setDataVencimento] = useState(lancamento.data_vencimento ?? "");
  const [descricao, setDescricao] = useState(lancamento.descricao);
  const [valor, setValor] = useState(Number(lancamento.valor));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!descricao.trim() || !valor) return;
    setSalvando(true);
    try {
      await atualizarLancamento({
        data: {
          id: lancamento.id,
          data,
          dataVencimento: dataVencimento || null,
          descricao,
          valor: Number(valor),
        },
      });
      toast.success("Lançamento atualizado.");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao editar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setData(lancamento.data.slice(0, 10));
          setDataVencimento(lancamento.data_vencimento ?? "");
          setDescricao(lancamento.descricao);
          setValor(Number(lancamento.valor));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar lançamento</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={(e) => setValor(Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={salvando || !descricao.trim() || !valor}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Baixa com critério — antes um único botão marcava "pago" na hora, sem
// perguntar onde o dinheiro entrou/saiu nem calcular multa/juros. Agora
// escolhe a rota certa conforme o tipo do lançamento: saída usa
// baixar_conta_pagar (sem multa/juros); entrada vinculada a um irmão usa
// baixar_faturas (com cálculo de multa/juros, igual à baixa de faturas);
// os demais casos (lançamento manual, já com conta definida na criação)
// só perguntam a data e reaproveitam marcarLancamentoPago.
function BaixarLancamentoDialog({
  lancamento,
  contas,
  onDone,
}: {
  lancamento: Lancamento;
  contas: { id: string; nome: string; plano_conta_id: string | null }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(toISODate(new Date()));
  const [desconto, setDesconto] = useState(0);
  const [calculo, setCalculo] = useState<{ multa: number; juros: number; dias_atraso: number }>({
    multa: 0,
    juros: 0,
    dias_atraso: 0,
  });
  const [salvando, setSalvando] = useState(false);

  const precisaConta = lancamento.tipo === "saida" || !!lancamento.irmao_id;
  const ehFatura = lancamento.tipo === "entrada" && !!lancamento.irmao_id;

  useEffect(() => {
    if (!open || !ehFatura || !lancamento.data_vencimento) return;
    calcularMultaJuros({
      data: {
        valor: Number(lancamento.valor),
        vencimento: lancamento.data_vencimento,
        dataReferencia: dataPagamento,
      },
    })
      .then(setCalculo)
      .catch(() => setCalculo({ multa: 0, juros: 0, dias_atraso: 0 }));
  }, [open, ehFatura, lancamento.data_vencimento, lancamento.valor, dataPagamento]);

  const total = Number(lancamento.valor) + calculo.multa + calculo.juros - Number(desconto || 0);

  const confirmar = async () => {
    if (precisaConta && !contaFinanceiraId) {
      return toast.error("Selecione a conta em que o valor entrou/saiu.");
    }
    setSalvando(true);
    try {
      if (lancamento.tipo === "saida") {
        await baixarContaPagar({
          data: {
            lancamentoId: lancamento.id,
            contaFinanceiraId,
            formaPagamento: formaPagamento || null,
            dataPagamento,
          },
        });
      } else if (ehFatura) {
        await baixarFaturas({
          data: {
            lancamentoIds: [lancamento.id],
            contaFinanceiraId,
            formaPagamento: formaPagamento || null,
            dataPagamento,
            desconto: Number(desconto) || 0,
            observacoes: null,
          },
        });
      } else {
        await marcarLancamentoPago({ data: { id: lancamento.id, dataPagamento } });
      }
      toast.success("Baixa registrada.");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Baixar">
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Baixar "{lancamento.descricao}"</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {precisaConta && (
            <div>
              <Label>Conta que {lancamento.tipo === "saida" ? "pagou" : "recebeu"}</Label>
              <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={!c.plano_conta_id}>
                      {c.nome}
                      {!c.plano_conta_id ? " (sem categoria contábil vinculada)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma de pagamento</Label>
              <Input
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                placeholder="PIX, dinheiro…"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
          </div>
          {ehFatura && (
            <>
              {calculo.dias_atraso > 0 && (
                <div className="text-sm text-destructive">
                  {calculo.dias_atraso} dia(s) de atraso — multa {brl(calculo.multa)} + juros{" "}
                  {brl(calculo.juros)}
                </div>
              )}
              <div>
                <Label>Desconto (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(Number(e.target.value))}
                />
              </div>
              <div className="text-lg font-semibold flex justify-between border-t pt-3">
                <span>Total líquido</span>
                <span>{brl(total)}</span>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={confirmar}
            disabled={salvando || (precisaConta && !contaFinanceiraId) || (ehFatura && total < 0)}
          >
            Confirmar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
