import { Fragment, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarParcelamentos,
  listarFaturasAbertasPorIrmao,
  criarParcelamento,
  listarLancamentosDoParcelamento,
  type Parcelamento,
  type FaturaAbertaIrmao,
} from "@/lib/backend/tesouraria-parcelamentos";
import { calcularMultaJuros } from "@/lib/backend/tesouraria-faturas";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/tesouraria/parcelamentos")({
  head: () => ({ meta: [{ title: "Parcelamentos — Gestão Maçônica" }] }),
  component: Parcelamentos,
});

// Referência estável: o fallback "= []" do destructuring do useQuery cria um
// array novo a cada render enquanto a query fica desabilitada (irmaoId
// vazio), o que reacendia o useEffect abaixo (que depende de faturasIrmao)
// a cada render — cada rodada chamava setCalculos com um objeto novo,
// gerando um loop de re-render (tela "congelada") sempre que nenhum irmão
// estava selecionado.
const FATURAS_IRMAO_VAZIO: FaturaAbertaIrmao[] = [];

function Parcelamentos() {
  const can = useCan();
  const podeEditar = can.canManageFinancas;
  const qc = useQueryClient();

  const { data: acordos = [] } = useQuery({
    queryKey: ["parcelamentos_all"],
    queryFn: () => listarParcelamentos(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["parcelamentos_all"] });
    qc.invalidateQueries({ queryKey: ["faturas_irmao_parcelamento"] });
  };

  return (
    <>
      <PageHeader
        title="Parcelamentos"
        description="Renegociação de faturas vencidas em acordos de parcelamento."
      />

      {podeEditar && <NovoParcelamentoForm onDone={invalidate} />}

      <ListaAcordos acordos={acordos} />
    </>
  );
}

function NovoParcelamentoForm({ onDone }: { onDone: () => void }) {
  const [irmaoId, setIrmaoId] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [numeroParcelas, setNumeroParcelas] = useState(2);
  const [entrada, setEntrada] = useState(0);
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [incluirMultaJuros, setIncluirMultaJuros] = useState(true);
  const [data, setData] = useState(toISODate(new Date()));
  const [observacoes, setObservacoes] = useState("");
  const [calculos, setCalculos] = useState<
    Record<string, { multa: number; juros: number; total: number }>
  >({});
  const [salvando, setSalvando] = useState(false);

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const { data: faturasIrmao = FATURAS_IRMAO_VAZIO } = useQuery({
    queryKey: ["faturas_irmao_parcelamento", irmaoId],
    enabled: !!irmaoId,
    queryFn: () => listarFaturasAbertasPorIrmao({ data: { irmaoId } }),
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });

  const ordFaturasIrmao = useOrdenacao(faturasIrmao, {
    descricao: (f) => f.descricao,
    vencimento: (f) => f.data_vencimento,
    valor: (f) => Number(f.valor),
  });

  useEffect(() => {
    setSelecionadas([]);
  }, [irmaoId]);

  useEffect(() => {
    (async () => {
      const faturasSelecionadas = faturasIrmao.filter((f) => selecionadas.includes(f.id));
      const entries = await Promise.all(
        faturasSelecionadas.map(async (f) => {
          try {
            const r = await calcularMultaJuros({
              data: { valor: f.valor, vencimento: f.data_vencimento, dataReferencia: data },
            });
            return [f.id, r] as const;
          } catch {
            return [f.id, { multa: 0, juros: 0, dias_atraso: 0, total: f.valor }] as const;
          }
        }),
      );
      setCalculos(Object.fromEntries(entries));
    })();
  }, [selecionadas, faturasIrmao, data]);

  const faturasSelecionadas = faturasIrmao.filter((f) => selecionadas.includes(f.id));
  const somaOriginal = faturasSelecionadas.reduce((s, f) => s + Number(f.valor), 0);
  const somaMulta = incluirMultaJuros
    ? Object.values(calculos).reduce((s, c) => s + Number(c.multa), 0)
    : 0;
  const somaJuros = incluirMultaJuros
    ? Object.values(calculos).reduce((s, c) => s + Number(c.juros), 0)
    : 0;
  const valorParcelado = somaOriginal + somaMulta + somaJuros - Number(entrada || 0);
  const valorParcela = numeroParcelas > 0 ? valorParcelado / numeroParcelas : 0;

  const toggle = (id: string) =>
    setSelecionadas(
      selecionadas.includes(id) ? selecionadas.filter((i) => i !== id) : [...selecionadas, id],
    );

  const criar = async () => {
    if (selecionadas.length === 0) return toast.error("Selecione ao menos uma fatura.");
    if (entrada > 0 && !contaFinanceiraId)
      return toast.error("Selecione a conta que recebeu a entrada.");
    setSalvando(true);
    try {
      await criarParcelamento({
        data: {
          lancamentoIds: selecionadas,
          numeroParcelas,
          entrada: Number(entrada) || 0,
          contaFinanceiraId: entrada > 0 ? contaFinanceiraId : null,
          data,
          incluirMultaJuros,
          observacoes: observacoes || null,
        },
      });
      toast.success("Acordo de parcelamento criado.");
      setSelecionadas([]);
      setEntrada(0);
      setObservacoes("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar acordo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Novo acordo de parcelamento</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label>Irmão</Label>
          <select
            value={irmaoId}
            onChange={(e) => setIrmaoId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Selecione…</option>
            {irmaos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome_civil}
              </option>
            ))}
          </select>
        </div>

        {irmaoId && (
          <div className="md:col-span-4 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHeadOrdenavel campo="descricao" ord={ordFaturasIrmao}>
                    Descrição
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="vencimento" ord={ordFaturasIrmao}>
                    Vencimento
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="valor" ord={ordFaturasIrmao} className="text-right">
                    Valor
                  </TableHeadOrdenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturasIrmao.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      Nenhuma fatura em aberto para este irmão.
                    </TableCell>
                  </TableRow>
                )}
                {ordFaturasIrmao.itensOrdenados.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <Checkbox
                        checked={selecionadas.includes(f.id)}
                        onCheckedChange={() => toggle(f.id)}
                      />
                    </TableCell>
                    <TableCell>{f.descricao}</TableCell>
                    <TableCell>{fmtDate(f.data_vencimento)}</TableCell>
                    <TableCell className="text-right">{brl(f.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div>
          <Label>Número de parcelas</Label>
          <Input
            type="number"
            min={1}
            value={numeroParcelas}
            onChange={(e) => setNumeroParcelas(Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Entrada (opcional)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={entrada}
            onChange={(e) => setEntrada(Number(e.target.value))}
          />
        </div>
        {entrada > 0 && (
          <div>
            <Label>Conta que recebeu a entrada</Label>
            <select
              value={contaFinanceiraId}
              onChange={(e) => setContaFinanceiraId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Selecione…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.plano_conta_id}>
                  {c.nome}
                  {!c.plano_conta_id ? " (sem categoria contábil)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label>Data do acordo</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={incluirMultaJuros} onCheckedChange={setIncluirMultaJuros} />
          <Label className="!m-0">Incorporar multa/juros já vencidos</Label>
        </div>
        <div className="md:col-span-4">
          <Label>Observações</Label>
          <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>

        {selecionadas.length > 0 && (
          <Card className="md:col-span-4 p-4 bg-muted/30 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Valor original</span>
              <span>{brl(somaOriginal)}</span>
            </div>
            {incluirMultaJuros && (
              <div className="flex justify-between">
                <span>Multa + Juros</span>
                <span>{brl(somaMulta + somaJuros)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Entrada</span>
              <span>-{brl(entrada)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>Total a parcelar</span>
              <span>{brl(valorParcelado)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{numeroParcelas}x de</span>
              <span>{brl(valorParcela)}</span>
            </div>
          </Card>
        )}

        <div className="md:col-span-4">
          <Button
            onClick={criar}
            disabled={salvando || selecionadas.length === 0 || valorParcelado < 0}
          >
            Criar acordo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ListaAcordos({ acordos }: { acordos: Parcelamento[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);
  const ord = useOrdenacao(acordos, {
    data: (a) => a.data,
    irmao: (a) => a.irmaos?.nome_civil,
    original: (a) => Number(a.valor_original),
    entrada: (a) => Number(a.entrada),
    parcelado: (a) => Number(a.valor_parcelado),
    parcelas: (a) => a.numero_parcelas,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  return (
    <Card>
      <div className="sm:hidden">
        {acordos.length === 0 && (
          <p className="py-6 text-center text-muted-foreground">
            Nenhum acordo de parcelamento ainda.
          </p>
        )}
        <ul className="divide-y" aria-label="Acordos de parcelamento">
          {itensPagina.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 p-4 text-left"
                onClick={() => setExpandido(expandido === a.id ? null : a.id)}
                aria-expanded={expandido === a.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-medium leading-snug">
                    {a.irmaos?.nome_civil ?? "—"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {fmtDate(a.data)} · {a.numero_parcelas}x de{" "}
                    {brl(Number(a.valor_parcelado) / a.numero_parcelas)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Original {brl(a.valor_original)}
                    {Number(a.entrada) > 0 && <> · Entrada {brl(a.entrada)}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-right text-base font-semibold tabular-nums">
                    {brl(a.valor_parcelado)}
                  </p>
                  {expandido === a.id ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
              {expandido === a.id && (
                <div className="border-t bg-muted/30 px-4 pb-4">
                  <AcordoDetalhe parcelamentoId={a.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden sm:block">
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
              <TableHeadOrdenavel campo="original" ord={ord} className="text-right">
                Original
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="entrada" ord={ord} className="text-right">
                Entrada
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="parcelado" ord={ord} className="text-right">
                Parcelado
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="parcelas" ord={ord}>
                Parcelas
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {acordos.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  Nenhum acordo de parcelamento ainda.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((a) => (
              <Fragment key={a.id}>
                <TableRow>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandido(expandido === a.id ? null : a.id)}
                    >
                      {expandido === a.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>{fmtDate(a.data)}</TableCell>
                  <TableCell className="font-medium">{a.irmaos?.nome_civil ?? "—"}</TableCell>
                  <TableCell className="text-right">{brl(a.valor_original)}</TableCell>
                  <TableCell className="text-right">{brl(a.entrada)}</TableCell>
                  <TableCell className="text-right">{brl(a.valor_parcelado)}</TableCell>
                  <TableCell>{a.numero_parcelas}x</TableCell>
                </TableRow>
                {expandido === a.id && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/30">
                      <AcordoDetalhe parcelamentoId={a.id} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      <TabelaPaginacao
        pagina={pagina}
        totalPaginas={totalPaginas}
        totalItens={totalItens}
        tamanhoPagina={tamanhoPagina}
        setPagina={setPagina}
      />
    </Card>
  );
}

function AcordoDetalhe({ parcelamentoId }: { parcelamentoId: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["parcelamento_lancamentos", parcelamentoId],
    queryFn: () => listarLancamentosDoParcelamento({ data: { parcelamentoId } }),
  });
  const ord = useOrdenacao(itens, {
    descricao: (it) => it.descricao,
    vencimento: (it) => it.data_vencimento,
    valor: (it) => Number(it.valor),
    status: (it) => (it.parcelado ? 2 : it.pago ? 1 : 0),
  });

  return (
    <div className="py-2">
      <ul className="divide-y sm:hidden" aria-label="Lançamentos do acordo">
        {ord.itensOrdenados.map((it) => (
          <li key={it.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium leading-snug">{it.descricao}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Vence {fmtDate(it.data_vencimento)}
              </p>
              <div className="mt-1">
                {it.parcelado ? (
                  <Badge variant="outline">Fatura original encerrada</Badge>
                ) : it.pago ? (
                  <Badge>Paga</Badge>
                ) : (
                  <Badge variant="secondary">Em aberto</Badge>
                )}
              </div>
            </div>
            <p className="shrink-0 text-right text-sm font-semibold tabular-nums">
              {brl(it.valor)}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="descricao" ord={ord}>
                Descrição
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="vencimento" ord={ord}>
                Vencimento
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                Valor
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="status" ord={ord}>
                Status
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ord.itensOrdenados.map((it) => (
              <TableRow key={it.id}>
                <TableCell>{it.descricao}</TableCell>
                <TableCell>{fmtDate(it.data_vencimento)}</TableCell>
                <TableCell className="text-right">{brl(it.valor)}</TableCell>
                <TableCell>
                  {it.parcelado ? (
                    <Badge variant="outline">Fatura original encerrada</Badge>
                  ) : it.pago ? (
                    <Badge>Paga</Badge>
                  ) : (
                    <Badge variant="secondary">Em aberto</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
