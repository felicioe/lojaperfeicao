import { Fragment, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarParcelamentos,
  listarFaturasAbertasPorIrmao,
  criarParcelamento,
  listarLancamentosDoParcelamento,
  type Parcelamento,
} from "@/lib/backend/tesouraria-parcelamentos";
import { calcularMultaJuros } from "@/lib/backend/tesouraria-faturas";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tesouraria/parcelamentos")({
  head: () => ({ meta: [{ title: "Parcelamentos — Gestão Maçônica" }] }),
  component: Parcelamentos,
});

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
      <PageHeader title="Parcelamentos" description="Renegociação de faturas vencidas em acordos de parcelamento." />

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
  const [calculos, setCalculos] = useState<Record<string, { multa: number; juros: number; total: number }>>({});
  const [salvando, setSalvando] = useState(false);

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const { data: faturasIrmao = [] } = useQuery({
    queryKey: ["faturas_irmao_parcelamento", irmaoId],
    enabled: !!irmaoId,
    queryFn: () => listarFaturasAbertasPorIrmao({ data: { irmaoId } }),
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });

  useEffect(() => {
    setSelecionadas([]);
  }, [irmaoId]);

  useEffect(() => {
    (async () => {
      const faturasSelecionadas = faturasIrmao.filter((f) => selecionadas.includes(f.id));
      const entries = await Promise.all(faturasSelecionadas.map(async (f) => {
        try {
          const r = await calcularMultaJuros({
            data: { valor: f.valor, vencimento: f.data_vencimento, dataReferencia: data },
          });
          return [f.id, r] as const;
        } catch {
          return [f.id, { multa: 0, juros: 0, dias_atraso: 0, total: f.valor }] as const;
        }
      }));
      setCalculos(Object.fromEntries(entries));
    })();
  }, [selecionadas, faturasIrmao, data]);

  const faturasSelecionadas = faturasIrmao.filter((f) => selecionadas.includes(f.id));
  const somaOriginal = faturasSelecionadas.reduce((s, f) => s + Number(f.valor), 0);
  const somaMulta = incluirMultaJuros ? Object.values(calculos).reduce((s, c) => s + Number(c.multa), 0) : 0;
  const somaJuros = incluirMultaJuros ? Object.values(calculos).reduce((s, c) => s + Number(c.juros), 0) : 0;
  const valorParcelado = somaOriginal + somaMulta + somaJuros - Number(entrada || 0);
  const valorParcela = numeroParcelas > 0 ? valorParcelado / numeroParcelas : 0;

  const toggle = (id: string) => setSelecionadas(selecionadas.includes(id) ? selecionadas.filter((i) => i !== id) : [...selecionadas, id]);

  const criar = async () => {
    if (selecionadas.length === 0) return toast.error("Selecione ao menos uma fatura.");
    if (entrada > 0 && !contaFinanceiraId) return toast.error("Selecione a conta que recebeu a entrada.");
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
      <CardHeader><CardTitle className="text-base">Novo acordo de parcelamento</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label>Irmão</Label>
          <select
            value={irmaoId}
            onChange={(e) => setIrmaoId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Selecione…</option>
            {irmaos.map((i) => <option key={i.id} value={i.id}>{i.nome_civil}</option>)}
          </select>
        </div>

        {irmaoId && (
          <div className="md:col-span-4 border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead className="w-10"></TableHead><TableHead>Descrição</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {faturasIrmao.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Nenhuma fatura em aberto para este irmão.</TableCell></TableRow>}
                {faturasIrmao.map((f: any) => (
                  <TableRow key={f.id}>
                    <TableCell><Checkbox checked={selecionadas.includes(f.id)} onCheckedChange={() => toggle(f.id)} /></TableCell>
                    <TableCell>{f.descricao}</TableCell>
                    <TableCell>{fmtDate(f.data_vencimento)}</TableCell>
                    <TableCell className="text-right">{brl(f.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div><Label>Número de parcelas</Label><Input type="number" min={1} value={numeroParcelas} onChange={(e) => setNumeroParcelas(Number(e.target.value))} /></div>
        <div><Label>Entrada (opcional)</Label><Input type="number" step="0.01" min="0" value={entrada} onChange={(e) => setEntrada(Number(e.target.value))} /></div>
        {entrada > 0 && (
          <div>
            <Label>Conta que recebeu a entrada</Label>
            <select
              value={contaFinanceiraId}
              onChange={(e) => setContaFinanceiraId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Selecione…</option>
              {contas.map((c) => <option key={c.id} value={c.id} disabled={!c.plano_conta_id}>{c.nome}{!c.plano_conta_id ? " (sem categoria contábil)" : ""}</option>)}
            </select>
          </div>
        )}
        <div><Label>Data do acordo</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div className="flex items-center gap-2">
          <Switch checked={incluirMultaJuros} onCheckedChange={setIncluirMultaJuros} />
          <Label className="!m-0">Incorporar multa/juros já vencidos</Label>
        </div>
        <div className="md:col-span-4"><Label>Observações</Label><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>

        {selecionadas.length > 0 && (
          <Card className="md:col-span-4 p-4 bg-muted/30 space-y-1 text-sm">
            <div className="flex justify-between"><span>Valor original</span><span>{brl(somaOriginal)}</span></div>
            {incluirMultaJuros && <div className="flex justify-between"><span>Multa + Juros</span><span>{brl(somaMulta + somaJuros)}</span></div>}
            <div className="flex justify-between"><span>Entrada</span><span>-{brl(entrada)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-1"><span>Total a parcelar</span><span>{brl(valorParcelado)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>{numeroParcelas}x de</span><span>{brl(valorParcela)}</span></div>
          </Card>
        )}

        <div className="md:col-span-4">
          <Button onClick={criar} disabled={salvando || selecionadas.length === 0 || valorParcelado < 0}>Criar acordo</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ListaAcordos({ acordos }: { acordos: Parcelamento[] }) {
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead></TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Irmão</TableHead>
            <TableHead className="text-right">Original</TableHead>
            <TableHead className="text-right">Entrada</TableHead>
            <TableHead className="text-right">Parcelado</TableHead>
            <TableHead>Parcelas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {acordos.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum acordo de parcelamento ainda.</TableCell></TableRow>
          )}
          {acordos.map((a) => (
            <Fragment key={a.id}>
              <TableRow>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setExpandido(expandido === a.id ? null : a.id)}>
                    {expandido === a.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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
    </Card>
  );
}

function AcordoDetalhe({ parcelamentoId }: { parcelamentoId: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["parcelamento_lancamentos", parcelamentoId],
    queryFn: () => listarLancamentosDoParcelamento({ data: { parcelamentoId } }),
  });

  return (
    <div className="py-2">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Descrição</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {itens.map((it) => (
            <TableRow key={it.id}>
              <TableCell>{it.descricao}</TableCell>
              <TableCell>{fmtDate(it.data_vencimento)}</TableCell>
              <TableCell className="text-right">{brl(it.valor)}</TableCell>
              <TableCell>
                {it.parcelado ? <Badge variant="outline">Fatura original encerrada</Badge> : it.pago ? <Badge>Paga</Badge> : <Badge variant="secondary">Em aberto</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
