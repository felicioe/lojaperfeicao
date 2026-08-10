import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Pencil, Printer, Trash2, UserCog } from "lucide-react";
import {
  atribuirIrmaoLancamento,
  atualizarLancamento,
  estornarLancamento,
  marcarLancamentoPago,
  type Lancamento,
} from "@/lib/backend/tesouraria-lancamentos";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import {
  calcularMultaJuros,
  baixarFaturas,
  baixarPagamentoParcial,
} from "@/lib/backend/tesouraria-faturas";
import { baixarContaPagar } from "@/lib/backend/tesouraria-contas-pagar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl, toISODate } from "@/lib/format";

// Ações de manutenção reutilizadas em qualquer tela que liste lançamentos
// (Tesouraria — Visão Geral, Movimento Financeiro): emitir/imprimir,
// editar, baixar (com critério: conta/data/forma, multa/juros, extra) e
// cancelar (estornar). Um só lugar pra manter, em vez de duplicar em cada
// página que lista lançamentos.

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

// Atribuição/correção do irmão vinculado (issue #136) — funciona
// independente do status pago, já que é só metadado de quem pagou. Caso de
// uso principal: lançamento avulso criado a partir do OFX, onde a
// atribuição pode não ter sido feita na hora (ex.: precisou identificar o
// depositante depois) ou precisar de correção.
function AtribuirIrmaoDialog({
  lancamento,
  onDone,
}: {
  lancamento: Lancamento;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [irmaoId, setIrmaoId] = useState(lancamento.irmao_id ?? "");
  const [salvando, setSalvando] = useState(false);

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
    enabled: open,
  });

  const salvar = async () => {
    setSalvando(true);
    try {
      await atribuirIrmaoLancamento({ data: { id: lancamento.id, irmaoId: irmaoId || null } });
      toast.success("Irmão atualizado.");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atribuir irmão.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setIrmaoId(lancamento.irmao_id ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Atribuir irmão">
          <UserCog className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atribuir irmão — "{lancamento.descricao}"</DialogTitle>
        </DialogHeader>
        <div>
          <Label>Irmão</Label>
          <Select
            value={irmaoId || "__nenhum__"}
            onValueChange={(v) => setIrmaoId(v === "__nenhum__" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__nenhum__">Nenhum (ex.: tronco de solidariedade)</SelectItem>
              {irmaos.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome_civil}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={salvar} disabled={salvando}>
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
// baixar_faturas (com cálculo de multa/juros, juros adicional manual e
// outra receita, igual à baixa de faturas); os demais casos (lançamento
// manual, já com conta definida na criação) só perguntam a data e
// reaproveitam marcarLancamentoPago.
function BaixarLancamentoDialog({
  lancamento,
  contas,
  receitas,
  onDone,
}: {
  lancamento: Lancamento;
  contas: { id: string; nome: string; plano_conta_id: string | null }[];
  receitas: { id: string; codigo: string; nome: string }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"integral" | "parcial">("integral");
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(toISODate(new Date()));
  const [desconto, setDesconto] = useState(0);
  const [jurosAdicional, setJurosAdicional] = useState(0);
  const [valorExtra, setValorExtra] = useState(0);
  const [planoContaExtraId, setPlanoContaExtraId] = useState("");
  const [calculo, setCalculo] = useState<{ multa: number; juros: number; dias_atraso: number }>({
    multa: 0,
    juros: 0,
    dias_atraso: 0,
  });
  const [salvando, setSalvando] = useState(false);

  const precisaConta = lancamento.tipo === "saida" || !!lancamento.irmao_id;
  const ehFatura = lancamento.tipo === "entrada" && !!lancamento.irmao_id;
  const saldo = Number(lancamento.valor) - Number(lancamento.valor_pago ?? 0);
  const [valorRecebidoParcial, setValorRecebidoParcial] = useState(saldo);

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

  const total =
    Number(lancamento.valor) +
    calculo.multa +
    calculo.juros +
    Number(jurosAdicional || 0) +
    Number(valorExtra || 0) -
    Number(desconto || 0);

  const confirmar = async () => {
    if (precisaConta && !contaFinanceiraId) {
      return toast.error("Selecione a conta em que o valor entrou/saiu.");
    }
    if (ehFatura && modo === "integral" && Number(valorExtra) > 0 && !planoContaExtraId) {
      return toast.error("Selecione a conta de receita do valor extra.");
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
      } else if (ehFatura && modo === "parcial") {
        await baixarPagamentoParcial({
          data: {
            alocacao: [{ lancamentoId: lancamento.id, valor: Number(valorRecebidoParcial) }],
            contaFinanceiraId,
            formaPagamento: formaPagamento || null,
            dataPagamento,
            observacoes: null,
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
            jurosAdicional: Number(jurosAdicional) || 0,
            valorExtra: Number(valorExtra) || 0,
            planoContaExtraId: Number(valorExtra) > 0 ? planoContaExtraId : null,
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
        {ehFatura && (
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
        )}
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
          {ehFatura && modo === "integral" && (
            <>
              {calculo.dias_atraso > 0 && (
                <div className="text-sm text-destructive">
                  {calculo.dias_atraso} dia(s) de atraso — multa {brl(calculo.multa)} + juros{" "}
                  {brl(calculo.juros)}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
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
                  <Label>Juros adicional (opcional)</Label>
                  <Input
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
                  <Label>Outra receita recebida junto (opcional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorExtra}
                    onChange={(e) => setValorExtra(Number(e.target.value))}
                    placeholder="Ex.: doação"
                  />
                </div>
                <div>
                  <Label>Conta de receita do valor extra</Label>
                  <Select
                    value={planoContaExtraId}
                    onValueChange={setPlanoContaExtraId}
                    disabled={!(Number(valorExtra) > 0)}
                  >
                    <SelectTrigger>
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
              <div className="text-lg font-semibold flex justify-between border-t pt-3">
                <span>Total líquido</span>
                <span>{brl(total)}</span>
              </div>
            </>
          )}
          {ehFatura && modo === "parcial" && (
            <>
              <p className="text-xs text-muted-foreground">
                Sem cálculo automático de multa/juros — só o principal da fatura.
              </p>
              <div>
                <Label>Valor recebido (saldo: {brl(saldo)})</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={saldo}
                  value={valorRecebidoParcial}
                  onChange={(e) =>
                    setValorRecebidoParcial(Math.min(Number(e.target.value) || 0, saldo))
                  }
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={confirmar}
            disabled={
              salvando ||
              (precisaConta && !contaFinanceiraId) ||
              (ehFatura && modo === "integral" && total < 0) ||
              (ehFatura && modo === "integral" && Number(valorExtra) > 0 && !planoContaExtraId) ||
              (ehFatura && modo === "parcial" && !(Number(valorRecebidoParcial) > 0))
            }
          >
            Confirmar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AcoesLancamento({
  lancamento,
  contas,
  receitas,
  onDone,
}: {
  lancamento: Lancamento;
  contas: { id: string; nome: string; plano_conta_id: string | null }[];
  receitas: { id: string; codigo: string; nome: string }[];
  onDone: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Link to="/tesouraria/faturas/$id" params={{ id: lancamento.id }}>
        <Button size="sm" variant="ghost" title="Emitir/imprimir">
          <Printer className="h-4 w-4" />
        </Button>
      </Link>
      {lancamento.tipo === "entrada" && (
        <AtribuirIrmaoDialog lancamento={lancamento} onDone={onDone} />
      )}
      {!lancamento.pago && (
        <>
          {Number(lancamento.valor_pago ?? 0) === 0 && (
            <EditarLancamentoDialog lancamento={lancamento} onDone={onDone} />
          )}
          <BaixarLancamentoDialog
            lancamento={lancamento}
            contas={contas}
            receitas={receitas}
            onDone={onDone}
          />
          {Number(lancamento.valor_pago ?? 0) === 0 && (
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
                    Remove "{lancamento.descricao}" ({brl(lancamento.valor)}) e a contrapartida
                    contábil correspondente, se existir. Só funciona pra lançamentos ainda em aberto
                    e não pode ser desfeito.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await estornarLancamento({ data: { id: lancamento.id } });
                        toast.success("Lançamento cancelado.");
                        onDone();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Erro ao cancelar.");
                      }
                    }}
                  >
                    Cancelar lançamento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      )}
    </div>
  );
}
