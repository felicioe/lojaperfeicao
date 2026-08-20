import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { listarContasFinanceiras, listarTodasChavesPix } from "@/lib/backend/tesouraria-contas";
import {
  listarFaturasAbertas,
  calcularMultaJuros,
  baixarFaturas,
  baixarPagamentoParcial,
  listarPreviewLoteMensalidades,
  criarFaturaAvulsa,
  criarFaturasAvulsasIntervalo,
} from "@/lib/backend/tesouraria-faturas";
import { AlocacaoParcialTable } from "@/components/app/AlocacaoParcial";
import { sugerirAlocacao, somaAlocacao } from "@/lib/alocacao-parcial";
import {
  gerarMensalidades,
  estornarLancamento,
  atualizarLancamento,
  definirFormaCobranca,
} from "@/lib/backend/tesouraria-lancamentos";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, fmtMesAno, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import type { FaturaAberta } from "@/lib/backend/tesouraria-faturas";

export const Route = createFileRoute("/_authenticated/tesouraria/faturas/")({
  head: () => ({ meta: [{ title: "Faturas — Gestão Maçônica" }] }),
  component: Faturas,
});

type Rateio = { conta_id: string; percentual: number };

function RateioBuilder({
  rateio,
  setRateio,
  receitas,
}: {
  rateio: Rateio[];
  setRateio: (r: Rateio[]) => void;
  receitas: { id: string; codigo: string; nome: string }[];
}) {
  const total = rateio.reduce((s, r) => s + Number(r.percentual || 0), 0);
  const add = () => setRateio([...rateio, { conta_id: "", percentual: 0 }]);
  const update = (i: number, patch: Partial<Rateio>) =>
    setRateio(rateio.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRateio(rateio.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2 md:col-span-4" role="group" aria-labelledby="rateio-label">
      <div className="flex items-center justify-between">
        <Label id="rateio-label">
          Rateio entre contas de receita (opcional — vazio usa 100% Mensalidades)
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Linha
        </Button>
      </div>
      {rateio.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={r.conta_id} onValueChange={(v) => update(i, { conta_id: v })}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue placeholder="Conta de receita…" />
            </SelectTrigger>
            <SelectContent>
              {receitas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.codigo} — {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step="0.01"
            className="h-8 w-24"
            value={r.percentual}
            onChange={(e) => update(i, { percentual: Number(e.target.value) })}
            placeholder="%"
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {rateio.length > 0 && (
        <div
          className={`text-xs ${Math.abs(total - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}
        >
          Soma: {total.toFixed(2)}% {Math.abs(total - 100) > 0.01 && "— precisa somar 100%"}
        </div>
      )}
    </div>
  );
}

function Faturas() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;

  const { data: receitas = [] } = useQuery({
    queryKey: ["planos_receita"],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "receita" } }),
  });

  const { data: abertas = [] } = useQuery({
    queryKey: ["faturas_abertas"],
    queryFn: () => listarFaturasAbertas(),
  });
  const { data: irmaosFiltro = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });
  const [irmaoFiltroId, setIrmaoFiltroId] = useState("todos");
  const abertasFiltradas =
    irmaoFiltroId === "todos" ? abertas : abertas.filter((f) => f.irmao_id === irmaoFiltroId);
  const ord = useOrdenacao(abertasFiltradas, {
    irmao: (f) => f.irmaos?.nome_civil,
    descricao: (f) => f.descricao,
    competencia: (f) => f.competencia_mes,
    vencimento: (f) => f.data_vencimento,
    valor: (f) => Number(f.valor) - Number(f.valor_pago),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [openBaixa, setOpenBaixa] = useState(false);

  // Troca de filtro de Irmão precisa limpar a seleção — senão uma fatura
  // selecionada antes fica escondida (fora do filtro atual) mas continua
  // valendo pra "Baixar selecionadas", podendo confirmar baixa em algo
  // que não está mais visível na tela.
  useEffect(() => {
    setSelecionadas([]);
  }, [irmaoFiltroId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["faturas_abertas"] });
    setSelecionadas([]);
  };

  const irmaoSelecionadoId = abertas.find((f) => f.id === selecionadas[0])?.irmao_id;
  const toggleSelecionada = (f: FaturaAberta) => {
    if (selecionadas.includes(f.id)) {
      setSelecionadas(selecionadas.filter((id) => id !== f.id));
      return;
    }
    if (irmaoSelecionadoId && f.irmao_id !== irmaoSelecionadoId) {
      toast.info("A baixa agrupada precisa ser de faturas do mesmo irmão — seleção reiniciada.");
      setSelecionadas([f.id]);
      return;
    }
    setSelecionadas([...selecionadas, f.id]);
  };
  const faturasSelecionadas = abertas.filter((f) => selecionadas.includes(f.id));

  return (
    <>
      <PageHeader
        title="Faturas"
        description="Emissão de mensalidades individual e em lote, com rateio contábil."
      />

      <Tabs defaultValue="lote">
        <TabsList className="mb-4">
          <TabsTrigger value="lote">Emissão em lote</TabsTrigger>
          <TabsTrigger value="individual">Emissão individual</TabsTrigger>
          <TabsTrigger value="abertas">Em aberto</TabsTrigger>
        </TabsList>

        <TabsContent value="lote" className="space-y-4">
          {podeEditar ? <LoteForm receitas={receitas} onDone={invalidate} /> : <SemPermissao />}
        </TabsContent>

        <TabsContent value="individual">
          {podeEditar ? (
            <IndividualForm receitas={receitas} onDone={invalidate} />
          ) : (
            <SemPermissao />
          )}
        </TabsContent>

        <TabsContent value="abertas">
          <Card className="mb-4 p-4 max-w-xs">
            <Label className="text-xs" htmlFor="fatura-irmao">
              Irmão
            </Label>
            <Select value={irmaoFiltroId} onValueChange={setIrmaoFiltroId}>
              <SelectTrigger id="fatura-irmao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {irmaosFiltro.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.nome_civil}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>
          {podeEditar && selecionadas.length > 0 && (
            <Card className="mb-4 p-4 flex items-center justify-between">
              <div className="text-sm">
                {selecionadas.length} fatura(s) selecionada(s) — total{" "}
                {brl(faturasSelecionadas.reduce((s, f) => s + Number(f.valor), 0))}
              </div>
              <div className="flex gap-2">
                {selecionadas.length >= 2 && (
                  <Link
                    to="/tesouraria/faturas/imprimir"
                    search={{ ids: selecionadas.join(",") }}
                    target="_blank"
                  >
                    <Button variant="outline">
                      <Printer className="h-4 w-4 mr-1" /> Imprimir agrupada
                    </Button>
                  </Link>
                )}
                <Dialog open={openBaixa} onOpenChange={setOpenBaixa}>
                  <DialogTrigger asChild>
                    <Button>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Baixar selecionadas
                    </Button>
                  </DialogTrigger>
                  <BaixaDialog
                    open={openBaixa}
                    faturas={faturasSelecionadas}
                    receitas={receitas}
                    onDone={() => {
                      setOpenBaixa(false);
                      invalidate();
                    }}
                  />
                </Dialog>
              </div>
            </Card>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  {podeEditar && <TableHead className="w-10"></TableHead>}
                  <TableHeadOrdenavel campo="irmao" ord={ord}>
                    Irmão
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="descricao" ord={ord}>
                    Descrição
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="competencia" ord={ord}>
                    Competência
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="vencimento" ord={ord}>
                    Vencimento
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                    Valor
                  </TableHeadOrdenavel>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abertasFiltradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      Nenhuma fatura em aberto.
                    </TableCell>
                  </TableRow>
                )}
                {itensPagina.map((f) => {
                  const fone = (f.irmaos?.celular || f.irmaos?.telefone || "").replace(/\D/g, "");
                  const msg = `Olá, ${f.irmaos?.nome_civil}! Sua fatura "${f.descricao}" no valor de ${brl(f.valor)} vence em ${fmtDate(f.data_vencimento)}.`;
                  return (
                    <TableRow key={f.id}>
                      {podeEditar && (
                        <TableCell>
                          <Checkbox
                            checked={selecionadas.includes(f.id)}
                            onCheckedChange={() => toggleSelecionada(f)}
                          />
                        </TableCell>
                      )}
                      <TableCell>{f.irmaos?.nome_civil ?? "—"}</TableCell>
                      <TableCell>{f.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {fmtMesAno(f.competencia_mes)}
                      </TableCell>
                      <TableCell>{fmtDate(f.data_vencimento)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(f.valor - f.valor_pago)}
                        {f.valor_pago > 0 && (
                          <div className="text-xs font-normal text-muted-foreground">
                            de {brl(f.valor)} — parcial
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {fone && (
                            <a
                              href={`https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button size="sm" variant="ghost" title="Enviar por WhatsApp">
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                          <Link to="/tesouraria/faturas/$id" params={{ id: f.id }}>
                            <Button size="sm" variant="ghost" title="Imprimir/salvar PDF">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </Link>
                          {podeEditar && f.valor_pago > 0 && (
                            <Badge variant="secondary" className="self-center">
                              Parcial
                            </Badge>
                          )}
                          {podeEditar && f.valor_pago === 0 && (
                            <>
                              <EditarFaturaDialog fatura={f} onDone={invalidate} />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" title="Estornar">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Estornar esta fatura?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Remove a fatura de {f.irmaos?.nome_civil} ({brl(f.valor)},{" "}
                                      {fmtMesAno(f.competencia_mes)}) e o lançamento contábil
                                      correspondente. Essa ação não pode ser desfeita — só funciona
                                      pra faturas ainda em aberto.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={async () => {
                                        try {
                                          await estornarLancamento({ data: { id: f.id } });
                                          toast.success("Fatura estornada.");
                                          invalidate();
                                        } catch (err) {
                                          toast.error(
                                            err instanceof Error
                                              ? err.message
                                              : "Erro ao estornar.",
                                          );
                                        }
                                      }}
                                    >
                                      Estornar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
        </TabsContent>
      </Tabs>
    </>
  );
}

function BaixaDialog({
  open,
  faturas,
  receitas,
  onDone,
}: {
  open: boolean;
  faturas: FaturaAberta[];
  receitas: { id: string; codigo: string; nome: string }[];
  onDone: () => void;
}) {
  const [modo, setModo] = useState<"integral" | "parcial">("integral");
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(toISODate(new Date()));
  const [desconto, setDesconto] = useState(0);
  const [jurosAdicional, setJurosAdicional] = useState(0);
  const [valorExtra, setValorExtra] = useState(0);
  const [planoContaExtraId, setPlanoContaExtraId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [calculos, setCalculos] = useState<
    Record<string, { multa: number; juros: number; dias_atraso: number; total: number }>
  >({});
  const [salvando, setSalvando] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });

  const faturasParaAlocar = faturas.map((f) => ({
    id: f.id,
    descricao: f.descricao,
    saldo: Number(f.valor) - Number(f.valor_pago ?? 0),
    dataVencimento: f.data_vencimento,
  }));
  const somaSaldos = faturasParaAlocar.reduce((s, f) => s + f.saldo, 0);
  const [valorRecebidoParcial, setValorRecebidoParcial] = useState(somaSaldos);
  const [alocacao, setAlocacao] = useState<Record<string, number>>({});

  useEffect(() => {
    // O diálogo não desmonta entre aberturas (fica dentro de <Dialog> sempre
    // renderizado) — sem isso, mudar a seleção de faturas com o diálogo
    // fechado deixava o valor recebido parcial preso na soma da primeira
    // abertura, mesmo com o teto do campo já ajustado corretamente.
    if (open) {
      setModo("integral");
      setContaFinanceiraId("");
      setFormaPagamento("");
      setDataPagamento(toISODate(new Date()));
      setDesconto(0);
      setJurosAdicional(0);
      setValorExtra(0);
      setPlanoContaExtraId("");
      setObservacoes("");
      setValorRecebidoParcial(somaSaldos);
      setAlocacao({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (modo !== "parcial") return;
    setAlocacao(sugerirAlocacao(faturasParaAlocar, valorRecebidoParcial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, valorRecebidoParcial]);

  const totalAlocado = somaAlocacao(alocacao);

  const confirmarParcial = async () => {
    if (!contaFinanceiraId) return toast.error("Selecione a conta que recebeu o pagamento.");
    const itens = Object.entries(alocacao)
      .filter(([, v]) => v > 0)
      .map(([lancamentoId, valor]) => ({ lancamentoId, valor }));
    if (itens.length === 0) return toast.error("Informe o valor a aplicar em ao menos uma fatura.");
    if (Math.abs(totalAlocado - valorRecebidoParcial) > 0.01) {
      return toast.error("A soma aplicada nas faturas precisa bater com o valor recebido.");
    }
    setSalvando(true);
    try {
      await baixarPagamentoParcial({
        data: {
          alocacao: itens,
          contaFinanceiraId,
          formaPagamento: formaPagamento || null,
          dataPagamento,
          observacoes: observacoes || null,
        },
      });
      toast.success("Pagamento parcial registrado, recibo emitido e lançamento contábil postado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar pagamento.");
    } finally {
      setSalvando(false);
    }
  };

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        faturas.map(async (f) => {
          try {
            const calculo = await calcularMultaJuros({
              data: {
                valor: f.valor,
                vencimento: f.data_vencimento,
                dataReferencia: dataPagamento,
              },
            });
            return [f.id, calculo] as const;
          } catch {
            return [f.id, { multa: 0, juros: 0, dias_atraso: 0, total: f.valor }] as const;
          }
        }),
      );
      setCalculos(Object.fromEntries(entries));
    })();
  }, [faturas, dataPagamento]);

  const somaOriginal = faturas.reduce((s, f) => s + Number(f.valor), 0);
  const somaMulta = Object.values(calculos).reduce((s, c) => s + Number(c.multa), 0);
  const somaJuros = Object.values(calculos).reduce((s, c) => s + Number(c.juros), 0);
  const totalLiquido =
    somaOriginal +
    somaMulta +
    somaJuros +
    Number(jurosAdicional || 0) +
    Number(valorExtra || 0) -
    Number(desconto || 0);

  const confirmar = async () => {
    if (!contaFinanceiraId) return toast.error("Selecione a conta que recebeu o pagamento.");
    if (Number(valorExtra) > 0 && !planoContaExtraId) {
      return toast.error("Selecione a conta de receita do valor extra.");
    }
    setSalvando(true);
    try {
      await baixarFaturas({
        data: {
          lancamentoIds: faturas.map((f) => f.id),
          contaFinanceiraId,
          formaPagamento: formaPagamento || null,
          dataPagamento,
          desconto: Number(desconto) || 0,
          observacoes: observacoes || null,
          jurosAdicional: Number(jurosAdicional) || 0,
          valorExtra: Number(valorExtra) || 0,
          planoContaExtraId: Number(valorExtra) > 0 ? planoContaExtraId : null,
        },
      });
      toast.success("Baixa registrada, recibo emitido e lançamento contábil postado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <DialogContent className={modo === "parcial" ? "max-w-2xl" : "max-w-lg"}>
      <DialogHeader>
        <DialogTitle>Baixar {faturas.length} fatura(s)</DialogTitle>
      </DialogHeader>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={modo === "integral" ? "default" : "outline"}
          onClick={() => setModo("integral")}
        >
          Baixa integral
        </Button>
        <Button
          type="button"
          size="sm"
          variant={modo === "parcial" ? "default" : "outline"}
          onClick={() => setModo("parcial")}
        >
          Pagamento parcial
        </Button>
      </div>
      <div className="grid gap-3">
        {modo === "integral" ? (
          <>
            <div className="border rounded-md divide-y">
              {faturas.map((f) => {
                const c = calculos[f.id];
                return (
                  <div key={f.id} className="p-2 text-sm flex justify-between">
                    <span>
                      {f.descricao}{" "}
                      {c?.dias_atraso > 0 && (
                        <span className="text-destructive">({c.dias_atraso}d atraso)</span>
                      )}
                    </span>
                    <span>
                      {brl(f.valor)}
                      {c && (c.multa > 0 || c.juros > 0) ? ` + ${brl(c.multa + c.juros)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>Multa: {brl(somaMulta)}</div>
              <div>Juros: {brl(somaJuros)}</div>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Sem cálculo automático de multa/juros — só o principal da fatura. A sugestão abaixo
              quita as mais antigas primeiro; ajuste os valores por fatura se precisar.
            </p>
            <div>
              <Label htmlFor="fatura-valor-recebido">Valor recebido</Label>
              <Input
                id="fatura-valor-recebido"
                type="number"
                step="0.01"
                min="0"
                max={somaSaldos}
                value={valorRecebidoParcial}
                onChange={(e) =>
                  setValorRecebidoParcial(Math.min(Number(e.target.value) || 0, somaSaldos))
                }
              />
            </div>
            <AlocacaoParcialTable
              faturas={faturasParaAlocar}
              alocacao={alocacao}
              onChange={(id, valor) => setAlocacao((a) => ({ ...a, [id]: valor }))}
            />
            <div
              className={`text-sm flex justify-between ${Math.abs(totalAlocado - valorRecebidoParcial) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}
            >
              <span>Alocado</span>
              <span>
                {brl(totalAlocado)} de {brl(valorRecebidoParcial)}
              </span>
            </div>
          </>
        )}
        <div>
          <Label htmlFor="fatura-pag-conta">Conta que recebeu</Label>
          <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
            <SelectTrigger id="fatura-pag-conta">
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="fatura-pag-forma">Forma de pagamento</Label>
            <Input
              id="fatura-pag-forma"
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              placeholder="PIX, dinheiro…"
            />
          </div>
          <div>
            <Label htmlFor="fatura-pag-data">Data do pagamento</Label>
            <Input
              id="fatura-pag-data"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
        </div>
        {modo === "integral" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fatura-pag-desconto">Desconto (opcional)</Label>
                <Input
                  id="fatura-pag-desconto"
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="fatura-pag-juros">Juros adicional (opcional)</Label>
                <Input
                  id="fatura-pag-juros"
                  type="number"
                  step="0.01"
                  min="0"
                  value={jurosAdicional}
                  onChange={(e) => setJurosAdicional(Number(e.target.value))}
                  placeholder="Além do calculado automaticamente"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fatura-pag-valor-extra">
                  Outra receita recebida junto (opcional)
                </Label>
                <Input
                  id="fatura-pag-valor-extra"
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorExtra}
                  onChange={(e) => setValorExtra(Number(e.target.value))}
                  placeholder="Ex.: doação"
                />
              </div>
              <div>
                <Label htmlFor="fatura-pag-conta-extra">Conta de receita do valor extra</Label>
                <Select
                  value={planoContaExtraId}
                  onValueChange={setPlanoContaExtraId}
                  disabled={!(Number(valorExtra) > 0)}
                >
                  <SelectTrigger id="fatura-pag-conta-extra">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {receitas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.codigo} — {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}
        <div>
          <Label htmlFor="fatura-pag-observacoes">Observações</Label>
          <Input
            id="fatura-pag-observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </div>
        {modo === "integral" && (
          <div className="text-lg font-semibold flex justify-between border-t pt-3">
            <span>Total líquido</span>
            <span>{brl(totalLiquido)}</span>
          </div>
        )}
      </div>
      <DialogFooter>
        {modo === "integral" ? (
          <Button
            onClick={confirmar}
            disabled={
              salvando ||
              !contaFinanceiraId ||
              totalLiquido < 0 ||
              (Number(valorExtra) > 0 && !planoContaExtraId)
            }
          >
            Confirmar baixa
          </Button>
        ) : (
          <Button
            onClick={confirmarParcial}
            disabled={
              salvando ||
              !contaFinanceiraId ||
              totalAlocado <= 0 ||
              Math.abs(totalAlocado - valorRecebidoParcial) > 0.01
            }
          >
            Confirmar pagamento parcial
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function EditarFaturaDialog({
  fatura,
  onDone,
}: {
  fatura: {
    id: string;
    data: string;
    data_vencimento: string;
    descricao: string;
    valor: number;
    forma_cobranca: "pix" | "boleto" | null;
    pix_chave_id: string | null;
  };
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(toISODate(new Date(fatura.data)));
  const [dataVencimento, setDataVencimento] = useState(fatura.data_vencimento || "");
  const [descricao, setDescricao] = useState(fatura.descricao);
  const [valor, setValor] = useState(Number(fatura.valor));
  const [formaCobranca, setFormaCobranca] = useState(fatura.forma_cobranca ?? "nenhuma");
  const [pixChaveId, setPixChaveId] = useState(fatura.pix_chave_id ?? "");
  const [salvando, setSalvando] = useState(false);

  const { data: chavesPix = [] } = useQuery({
    queryKey: ["chaves_pix_todas"],
    queryFn: () => listarTodasChavesPix(),
    enabled: open,
  });

  const salvar = async () => {
    if (!descricao.trim() || !valor) return;
    if (formaCobranca !== "nenhuma" && !pixChaveId) {
      return toast.error("Selecione a chave PIX que vai gerar o QR code.");
    }
    setSalvando(true);
    try {
      await atualizarLancamento({
        data: {
          id: fatura.id,
          data,
          dataVencimento: dataVencimento || null,
          descricao,
          valor: Number(valor),
        },
      });
      await definirFormaCobranca({
        data: {
          id: fatura.id,
          formaCobranca: formaCobranca === "nenhuma" ? null : formaCobranca,
          pixChaveId: formaCobranca === "nenhuma" ? null : pixChaveId,
        },
      });
      toast.success("Fatura atualizada.");
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
          setData(toISODate(new Date(fatura.data)));
          setDataVencimento(fatura.data_vencimento || "");
          setDescricao(fatura.descricao);
          setValor(Number(fatura.valor));
          setFormaCobranca(fatura.forma_cobranca ?? "nenhuma");
          setPixChaveId(fatura.pix_chave_id ?? "");
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
          <DialogTitle>Editar fatura</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="fatura-item-descricao">Descrição</Label>
            <Input
              id="fatura-item-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fatura-item-data">Data</Label>
              <Input
                id="fatura-item-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fatura-item-vencimento">Vencimento</Label>
              <Input
                id="fatura-item-vencimento"
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="fatura-item-valor">Valor</Label>
            <Input
              id="fatura-item-valor"
              type="number"
              step="0.01"
              min="0.01"
              value={valor}
              onChange={(e) => setValor(Number(e.target.value))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fatura-item-forma-cobranca">Forma de cobrança</Label>
              <Select
                value={formaCobranca}
                onValueChange={(v) => setFormaCobranca(v as typeof formaCobranca)}
              >
                <SelectTrigger id="fatura-item-forma-cobranca">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Não informar</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto (layout com QR PIX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fatura-item-pix">Chave PIX</Label>
              <Select
                value={pixChaveId}
                onValueChange={setPixChaveId}
                disabled={formaCobranca === "nenhuma"}
              >
                <SelectTrigger id="fatura-item-pix">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {chavesPix.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.conta_nome} — {c.chave}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

function SemPermissao() {
  return (
    <Card className="p-6 text-center text-muted-foreground">
      Apenas administradores e tesoureiros podem emitir faturas.
    </Card>
  );
}

// Uma única emissão em lote, que cobre tanto "gerar o mês corrente" (início =
// fim) quanto "gerar um intervalo retroativo" (fim > início) — antes eram
// dois cartões/seletores separados, unificados a pedido do usuário.
// gerarMensalidades já é idempotente por competência, então o loop mês a mês
// pode incluir competências já geradas antes sem duplicar nada.
function LoteForm({
  receitas,
  onDone,
}: {
  receitas: { id: string; codigo: string; nome: string }[];
  onDone: () => void;
}) {
  const mesAtual = toISODate(new Date()).slice(0, 7);
  const [inicio, setInicio] = useState(mesAtual);
  const [fim, setFim] = useState(mesAtual);
  const [vencimento, setVencimento] = useState("");
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<{ mes: string; total: number }[] | null>(null);

  const unicaCompetencia = inicio === fim;

  const { data: preview = [] } = useQuery({
    queryKey: ["preview_lote", inicio],
    queryFn: () => listarPreviewLoteMensalidades({ data: { competencia: inicio + "-01" } }),
    enabled: unicaCompetencia,
  });

  const competencias = (): string[] => {
    const lista: string[] = [];
    let [ano, mes] = inicio.split("-").map(Number);
    const [anoFim, mesFim] = fim.split("-").map(Number);
    while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
      lista.push(`${ano}-${String(mes).padStart(2, "0")}`);
      mes++;
      if (mes > 12) {
        mes = 1;
        ano++;
      }
    }
    return lista;
  };

  const gerar = async () => {
    if (
      rateio.length > 0 &&
      Math.abs(rateio.reduce((s, r) => s + Number(r.percentual || 0), 0) - 100) > 0.01
    ) {
      return toast.error("O rateio precisa somar 100%.");
    }
    const meses = competencias();
    if (meses.length === 0) return toast.error("Intervalo inválido.");
    if (meses.length > 36) return toast.error("Intervalo grande demais (máximo 36 meses).");
    setGerando(true);
    setProgresso([]);
    try {
      const resultados: { mes: string; total: number }[] = [];
      for (const mes of meses) {
        const total = await gerarMensalidades({
          data: {
            competencia: `${mes}-01`,
            dataVencimento: unicaCompetencia ? vencimento || null : null,
            rateio: rateio.length > 0 ? rateio : null,
          },
        });
        resultados.push({ mes, total });
        setProgresso([...resultados]);
      }
      const somaTotal = resultados.reduce((s, r) => s + r.total, 0);
      toast.success(
        meses.length > 1
          ? `${somaTotal} fatura(s) geradas em ${meses.length} competência(s).`
          : `${somaTotal} fatura(s) gerada(s).`,
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gerar mensalidades</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor="gerar-competencia-inicial">Competência inicial</Label>
          <Input
            id="gerar-competencia-inicial"
            type="month"
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              if (e.target.value > fim) setFim(e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="gerar-competencia-final">Competência final</Label>
          <Input
            id="gerar-competencia-final"
            type="month"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="gerar-vencimento">
            Vencimento (opcional){!unicaCompetencia && " — só pra 1 mês"}
          </Label>
          <Input
            id="gerar-vencimento"
            type="date"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
            disabled={!unicaCompetencia}
          />
        </div>
        <RateioBuilder rateio={rateio} setRateio={setRateio} receitas={receitas} />

        <div className="md:col-span-4 text-sm text-muted-foreground">
          {unicaCompetencia
            ? `${preview.length} irmão(s) serão cobrados nesta emissão (situação ativa/quite/irregular, com mensalidade > 0, ainda sem fatura para esta competência).`
            : "Gera a mensalidade padrão pra todas as competências do intervalo que ainda não têm fatura (vencimento no dia 07 do mês seguinte a cada competência). Competência já gerada antes é pulada automaticamente — pode incluir meses já feitos sem duplicar nada."}
        </div>
        {unicaCompetencia && preview.length > 0 && (
          <div className="md:col-span-4 max-h-40 overflow-y-auto border rounded-md">
            <Table>
              <TableBody>
                {preview.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.nome_civil}</TableCell>
                    <TableCell className="text-right">{brl(i.valor_mensalidade)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!unicaCompetencia && progresso && progresso.length > 0 && (
          <div className="md:col-span-4 max-h-40 overflow-y-auto border rounded-md">
            <Table>
              <TableBody>
                {progresso.map((p) => (
                  <TableRow key={p.mes}>
                    <TableCell>{fmtDate(`${p.mes}-01`).slice(3)}</TableCell>
                    <TableCell className="text-right">{p.total} fatura(s)</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="md:col-span-4">
          <Button onClick={gerar} disabled={gerando || (unicaCompetencia && preview.length === 0)}>
            {gerando
              ? "Gerando…"
              : unicaCompetencia
                ? `Gerar ${preview.length > 0 ? `(${preview.length})` : ""}`
                : "Gerar intervalo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IndividualForm({
  receitas,
  onDone,
}: {
  receitas: { id: string; codigo: string; nome: string }[];
  onDone: () => void;
}) {
  const [irmaoId, setIrmaoId] = useState("");
  const [valor, setValor] = useState(0);
  const [competencia, setCompetencia] = useState(toISODate(new Date()).slice(0, 7) + "-01");
  const [competenciaFinal, setCompetenciaFinal] = useState(
    toISODate(new Date()).slice(0, 7) + "-01",
  );
  const [vencimento, setVencimento] = useState(toISODate(new Date()));
  const [descricao, setDescricao] = useState("");
  const [rateio, setRateio] = useState<Rateio[]>([]);
  const [salvando, setSalvando] = useState(false);

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const salvar = async () => {
    if (!irmaoId || !valor) return;
    if (
      rateio.length > 0 &&
      Math.abs(rateio.reduce((s, r) => s + Number(r.percentual || 0), 0) - 100) > 0.01
    ) {
      return toast.error("O rateio precisa somar 100%.");
    }
    setSalvando(true);
    try {
      if (competenciaFinal !== competencia) {
        const resultado = await criarFaturasAvulsasIntervalo({
          data: {
            irmaoId,
            valor: Number(valor),
            competenciaInicial: competencia,
            competenciaFinal,
            primeiroVencimento: vencimento,
            descricao: descricao || null,
            rateio: rateio.length > 0 ? rateio : null,
          },
        });
        toast.success(
          `${resultado.ids.length} fatura(s) criada(s).${resultado.ignoradas ? ` ${resultado.ignoradas} competência(s) já existente(s) foram ignoradas.` : ""}`,
        );
      } else {
        await criarFaturaAvulsa({
          data: {
            irmaoId,
            valor: Number(valor),
            competenciaMes: competencia,
            dataVencimento: vencimento,
            descricao: descricao || null,
            rateio: rateio.length > 0 ? rateio : null,
          },
        });
        toast.success("Fatura criada e provisão contábil lançada.");
      }
      setValor(0);
      setDescricao("");
      setRateio([]);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nova fatura avulsa</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label htmlFor="avulsa-irmao">Irmão</Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger id="avulsa-irmao">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {irmaos.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome_civil}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="avulsa-valor">Valor</Label>
          <Input
            id="avulsa-valor"
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="avulsa-competencia">Competência inicial</Label>
          <Input
            id="avulsa-competencia"
            type="month"
            value={competencia.slice(0, 7)}
            onChange={(e) => {
              const novaCompetencia = e.target.value + "-01";
              setCompetencia(novaCompetencia);
              if (novaCompetencia > competenciaFinal) setCompetenciaFinal(novaCompetencia);
            }}
          />
        </div>
        <div>
          <Label htmlFor="avulsa-competencia-final">Competência final</Label>
          <Input
            id="avulsa-competencia-final"
            type="month"
            value={competenciaFinal.slice(0, 7)}
            min={competencia.slice(0, 7)}
            onChange={(e) => setCompetenciaFinal(e.target.value + "-01")}
          />
        </div>
        <div>
          <Label htmlFor="avulsa-vencimento">
            {competencia === competenciaFinal ? "Vencimento" : "Vencimento da primeira fatura"}
          </Label>
          <Input
            id="avulsa-vencimento"
            type="date"
            value={vencimento}
            onChange={(e) => setVencimento(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="avulsa-descricao">Descrição (opcional)</Label>
          <Input
            id="avulsa-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        {competencia !== competenciaFinal && (
          <p className="text-sm text-muted-foreground md:col-span-4">
            Será criada uma fatura por competência. Os vencimentos avançam um mês por fatura,
            mantendo o dia informado; competências já existentes serão ignoradas.
          </p>
        )}
        <RateioBuilder rateio={rateio} setRateio={setRateio} receitas={receitas} />
        <div className="md:col-span-4">
          <Button onClick={salvar} disabled={salvando || !irmaoId || !valor}>
            {salvando
              ? "Criando…"
              : competencia === competenciaFinal
                ? "Criar fatura"
                : "Criar faturas do período"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
