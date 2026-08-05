import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import {
  listarFaturasAbertas,
  calcularMultaJuros,
  baixarFaturas,
  listarPreviewLoteMensalidades,
  criarFaturaAvulsa,
} from "@/lib/backend/tesouraria-faturas";
import {
  gerarMensalidades,
  estornarLancamento,
  atualizarLancamento,
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
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";

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
    <div className="space-y-2 md:col-span-4">
      <div className="flex items-center justify-between">
        <Label>Rateio entre contas de receita (opcional — vazio usa 100% Mensalidades)</Label>
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
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(abertas);

  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [openBaixa, setOpenBaixa] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["faturas_abertas"] });
    setSelecionadas([]);
  };

  const irmaoSelecionadoId = abertas.find((f) => f.id === selecionadas[0])?.irmao_id;
  const toggleSelecionada = (f: any) => {
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
          {podeEditar && selecionadas.length > 0 && (
            <Card className="mb-4 p-4 flex items-center justify-between">
              <div className="text-sm">
                {selecionadas.length} fatura(s) selecionada(s) — total{" "}
                {brl(faturasSelecionadas.reduce((s, f) => s + Number(f.valor), 0))}
              </div>
              <Dialog open={openBaixa} onOpenChange={setOpenBaixa}>
                <DialogTrigger asChild>
                  <Button>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Baixar selecionadas
                  </Button>
                </DialogTrigger>
                <BaixaDialog
                  faturas={faturasSelecionadas}
                  onDone={() => {
                    setOpenBaixa(false);
                    invalidate();
                  }}
                />
              </Dialog>
            </Card>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  {podeEditar && <TableHead className="w-10"></TableHead>}
                  <TableHead>Irmão</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abertas.length === 0 && (
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
                        {fmtDate(f.competencia_mes)}
                      </TableCell>
                      <TableCell>{fmtDate(f.data_vencimento)}</TableCell>
                      <TableCell className="text-right font-medium">{brl(f.valor)}</TableCell>
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
                          {podeEditar && (
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
                                      {fmtDate(f.competencia_mes)}) e o lançamento contábil
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

function BaixaDialog({ faturas, onDone }: { faturas: any[]; onDone: () => void }) {
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(toISODate(new Date()));
  const [desconto, setDesconto] = useState(0);
  const [observacoes, setObservacoes] = useState("");
  const [calculos, setCalculos] = useState<
    Record<string, { multa: number; juros: number; dias_atraso: number; total: number }>
  >({});
  const [salvando, setSalvando] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });

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
  const totalLiquido = somaOriginal + somaMulta + somaJuros - Number(desconto || 0);

  const confirmar = async () => {
    if (!contaFinanceiraId) return toast.error("Selecione a conta que recebeu o pagamento.");
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
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Baixar {faturas.length} fatura(s)</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
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
        <div>
          <Label>Conta que recebeu</Label>
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
            <Label>Data do pagamento</Label>
            <Input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
        </div>
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
        <div>
          <Label>Observações</Label>
          <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        <div className="text-lg font-semibold flex justify-between border-t pt-3">
          <span>Total líquido</span>
          <span>{brl(totalLiquido)}</span>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={confirmar} disabled={salvando || !contaFinanceiraId || totalLiquido < 0}>
          Confirmar baixa
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditarFaturaDialog({
  fatura,
  onDone,
}: {
  fatura: { id: string; data: string; data_vencimento: string; descricao: string; valor: number };
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(toISODate(new Date(fatura.data)));
  const [dataVencimento, setDataVencimento] = useState(fatura.data_vencimento || "");
  const [descricao, setDescricao] = useState(fatura.descricao);
  const [valor, setValor] = useState(Number(fatura.valor));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!descricao.trim() || !valor) return;
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
          <Label>Competência inicial</Label>
          <Input
            type="month"
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              if (e.target.value > fim) setFim(e.target.value);
            }}
          />
        </div>
        <div>
          <Label>Competência final</Label>
          <Input type="month" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div>
          <Label>Vencimento (opcional){!unicaCompetencia && " — só pra 1 mês"}</Label>
          <Input
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
            : "Gera a mensalidade padrão pra todas as competências do intervalo que ainda não têm fatura (vencimento 9 dias após o início de cada mês). Competência já gerada antes é pulada automaticamente — pode incluir meses já feitos sem duplicar nada."}
        </div>
        {unicaCompetencia && preview.length > 0 && (
          <div className="md:col-span-4 max-h-40 overflow-y-auto border rounded-md">
            <Table>
              <TableBody>
                {preview.map((i: any) => (
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
          <Label>Irmão</Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger>
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
          <Label>Valor</Label>
          <Input
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Competência</Label>
          <Input
            type="month"
            value={competencia.slice(0, 7)}
            onChange={(e) => setCompetencia(e.target.value + "-01")}
          />
        </div>
        <div>
          <Label>Vencimento</Label>
          <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <Label>Descrição (opcional)</Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <RateioBuilder rateio={rateio} setRateio={setRateio} receitas={receitas} />
        <div className="md:col-span-4">
          <Button onClick={salvar} disabled={salvando || !irmaoId || !valor}>
            Criar fatura
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
