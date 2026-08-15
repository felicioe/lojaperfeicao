import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarRecibos,
  listarReciboItens,
  listarRecibosAvulsos,
  listarConciliacoesParaRecibo,
  criarReciboAvulso,
} from "@/lib/backend/tesouraria-recibos";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { listarTerceiros } from "@/lib/backend/terceiros";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { toISODate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tesouraria/recibos")({
  head: () => ({ meta: [{ title: "Recibos — Gestão Maçônica" }] }),
  component: Recibos,
});

function Recibos() {
  const [expandido, setExpandido] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: recibos = [] } = useQuery({
    queryKey: ["recibos_all"],
    queryFn: () => listarRecibos(),
  });
  const ord = useOrdenacao(recibos, {
    data: (r) => r.data,
    irmao: (r) => r.irmaos?.nome_civil,
    conta: (r) => r.contas_financeiras?.nome,
    forma: (r) => r.forma_pagamento,
    original: (r) => Number(r.valor_original),
    multaJuros: (r) => Number(r.valor_multa) + Number(r.valor_juros),
    desconto: (r) => Number(r.desconto),
    total: (r) => Number(r.valor_total),
  });
  const { data: avulsos = [] } = useQuery({
    queryKey: ["recibos_avulsos"],
    queryFn: listarRecibosAvulsos,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  return (
    <>
      <PageHeader
        title="Recibos"
        description="Recibos de recebimento e pagamento, avulsos ou originados de baixas."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                Emitir recibo avulso
              </Button>
            </DialogTrigger>
            <NovoReciboAvulso
              onDone={() => qc.invalidateQueries({ queryKey: ["recibos_avulsos"] })}
            />
          </Dialog>
        }
      />
      {avulsos.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="sm:hidden">
            <ul className="divide-y" aria-label="Recibos avulsos">
              {avulsos.map((r) => (
                <li key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-base font-medium leading-snug">
                        {r.pessoa_nome}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.descricao}</p>
                    </div>
                    <p className="shrink-0 text-right text-base font-semibold tabular-nums">
                      {brl(r.valor)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
                    <span>Nº {r.numero}</span>
                    <span>{fmtDate(r.data)}</span>
                    <Badge variant={r.tipo === "recebimento" ? "default" : "secondary"}>
                      {r.tipo === "recebimento" ? "Recebimento" : "Pagamento"}
                    </Badge>
                  </div>
                  <div className="-mr-2 mt-2 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => imprimirRecibo(r)}>
                      <Printer className="h-4 w-4" /> Imprimir
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Favorecido / pagador</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {avulsos.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.numero}</TableCell>
                    <TableCell>{fmtDate(r.data)}</TableCell>
                    <TableCell>{r.tipo === "recebimento" ? "Recebimento" : "Pagamento"}</TableCell>
                    <TableCell>{r.pessoa_nome}</TableCell>
                    <TableCell>{r.descricao}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(r.valor)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => imprimirRecibo(r)}>
                        <Printer className="h-4 w-4" /> Imprimir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <Card>
        <div className="sm:hidden">
          {recibos.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">Nenhum recibo emitido ainda.</p>
          )}
          <ul className="divide-y" aria-label="Recibos">
            {itensPagina.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 p-4 text-left"
                  onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                  aria-expanded={expandido === r.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-medium leading-snug">
                      {r.irmaos?.nome_civil ?? "—"}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {fmtDate(r.data)}
                      {r.contas_financeiras?.nome && ` · ${r.contas_financeiras.nome}`}
                      {r.forma_pagamento && ` · ${r.forma_pagamento}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="text-right text-base font-semibold tabular-nums">
                      {brl(r.valor_total)}
                    </p>
                    {expandido === r.id ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
                {expandido === r.id && (
                  <div className="border-t bg-muted/30 px-4 pb-4">
                    <ReciboItensPanel reciboId={r.id} />
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
                <TableHeadOrdenavel campo="conta" ord={ord}>
                  Conta
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="forma" ord={ord}>
                  Forma
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="original" ord={ord} className="text-right">
                  Original
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="multaJuros" ord={ord} className="text-right">
                  Multa+Juros
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="desconto" ord={ord} className="text-right">
                  Desconto
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="total" ord={ord} className="text-right">
                  Total
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recibos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                    Nenhum recibo emitido ainda.
                  </TableCell>
                </TableRow>
              )}
              {itensPagina.map((r) => (
                <Fragment key={r.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandido(expandido === r.id ? null : r.id)}
                      >
                        {expandido === r.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>{fmtDate(r.data)}</TableCell>
                    <TableCell className="font-medium">{r.irmaos?.nome_civil ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.contas_financeiras?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.forma_pagamento ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{brl(r.valor_original)}</TableCell>
                    <TableCell className="text-right">
                      {brl(Number(r.valor_multa) + Number(r.valor_juros))}
                    </TableCell>
                    <TableCell className="text-right">{brl(r.desconto)}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(r.valor_total)}</TableCell>
                  </TableRow>
                  {expandido === r.id && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/30">
                        <ReciboItensPanel reciboId={r.id} />
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
    </>
  );
}

function ReciboItensPanel({ reciboId }: { reciboId: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["recibo_itens", reciboId],
    queryFn: () => listarReciboItens({ data: { reciboId } }),
  });
  const ord = useOrdenacao(itens, {
    descricao: (it) => it.lancamentos?.descricao,
    vencimento: (it) => it.lancamentos?.data_vencimento,
    original: (it) => Number(it.valor_original),
    multa: (it) => Number(it.valor_multa),
    juros: (it) => Number(it.valor_juros),
  });

  return (
    <div className="py-2">
      <div className="text-sm font-medium mb-2">Faturas incluídas neste recibo</div>
      <ul className="divide-y sm:hidden" aria-label="Faturas incluídas neste recibo">
        {ord.itensOrdenados.map((it) => (
          <li key={it.id} className="py-2.5 text-sm first:pt-0 last:pb-0">
            <p className="font-medium leading-snug">{it.lancamentos?.descricao}</p>
            <p className="mt-0.5 text-muted-foreground">
              Vence {fmtDate(it.lancamentos?.data_vencimento)}
            </p>
            <p className="mt-1 text-muted-foreground">
              Original {brl(it.valor_original)}
              {Number(it.valor_multa) > 0 && <> · Multa {brl(it.valor_multa)}</>}
              {Number(it.valor_juros) > 0 && <> · Juros {brl(it.valor_juros)}</>}
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
              <TableHeadOrdenavel campo="original" ord={ord} className="text-right">
                Original
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="multa" ord={ord} className="text-right">
                Multa
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="juros" ord={ord} className="text-right">
                Juros
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ord.itensOrdenados.map((it) => (
              <TableRow key={it.id}>
                <TableCell>{it.lancamentos?.descricao}</TableCell>
                <TableCell>{fmtDate(it.lancamentos?.data_vencimento)}</TableCell>
                <TableCell className="text-right">{brl(it.valor_original)}</TableCell>
                <TableCell className="text-right">{brl(it.valor_multa)}</TableCell>
                <TableCell className="text-right">{brl(it.valor_juros)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function valorPorExtenso(valor: number) {
  const inteiros = Math.floor(valor);
  const centavos = Math.round((valor - inteiros) * 100);
  return `${inteiros.toLocaleString("pt-BR")} ${inteiros === 1 ? "real" : "reais"}${centavos ? ` e ${centavos} centavos` : ""}`;
}

function imprimirRecibo(r: {
  numero: number;
  tipo: string;
  data: string;
  valor: number;
  descricao: string;
  pessoa_nome: string;
  forma_pagamento: string | null;
  observacoes: string | null;
}) {
  const janela = window.open("", "_blank", "width=900,height=700");
  if (!janela) return toast.error("Permita pop-ups para imprimir o recibo.");
  janela.document.write(
    `<!doctype html><html><head><title>Recibo ${r.numero}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:36px;max-width:820px;margin:auto}.head{display:grid;grid-template-columns:150px 1fr 100px;align-items:center;border-bottom:2px solid #9b7b32;padding-bottom:16px}.logos img{width:60px;height:60px;object-fit:contain}.right{width:80px}.center{text-align:center;font-size:13px;font-weight:bold}.title{text-align:center;margin:36px 0 24px}.valor{border:1px solid #777;padding:10px 16px;float:right;font-size:20px}.texto{font-size:17px;line-height:1.8;clear:both;padding-top:25px}.assinatura{margin-top:80px;text-align:center}.linha{border-top:1px solid #333;width:360px;margin:auto;padding-top:8px}@media print{button{display:none}}</style></head><body><div class="head"><div class="logos"><img src="/institucional/logo-capitulo-ayres-gevaerd.png"><img src="/institucional/logo-loja-perfeicao-adonhiram.png"></div><div class="center">LOJA DE PERFEIÇÃO ADONHIRAM<br>SUBLIME CAPÍTULO ADONHIRAMITA AYRES GEVAERD<br><br>ASSOCIACAO CAPITULAR ADONHIRAMITA AO VALE DE ITAJAI<br>CNPJ 26.649.083/0001-38</div><img class="right" src="/institucional/logo-sgcab.png"></div><h1 class="title">RECIBO Nº ${r.numero}</h1><div class="valor">${brl(r.valor)}</div><p class="texto">${r.tipo === "recebimento" ? "Recebemos de" : "Pagamos a"} <strong>${r.pessoa_nome}</strong> a importância de <strong>${valorPorExtenso(Number(r.valor))}</strong>, referente a ${r.descricao}.${r.forma_pagamento ? `<br>Forma de pagamento: ${r.forma_pagamento}.` : ""}</p>${r.observacoes ? `<p>${r.observacoes}</p>` : ""}<p>Camboriú, ${fmtDate(r.data)}.</p><div class="assinatura"><div class="linha">ASSOCIACAO CAPITULAR ADONHIRAMITA AO VALE DE ITAJAI</div></div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`,
  );
  janela.document.close();
}

function NovoReciboAvulso({ onDone }: { onDone: () => void }) {
  const [d, setD] = useState({
    tipo: "recebimento" as "recebimento" | "pagamento",
    status: "efetivo" as "previsto" | "efetivo",
    data: toISODate(new Date()),
    valor: 0,
    descricao: "",
    pessoaTipo: "irmao",
    pessoaId: "",
    planoContaId: "",
    contaFinanceiraId: "",
    formaPagamento: "",
    observacoes: "",
    conciliacaoId: "",
  });
  const [saving, setSaving] = useState(false);
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: listarIrmaosNomes,
  });
  const { data: terceiros = [] } = useQuery({ queryKey: ["terceiros"], queryFn: listarTerceiros });
  const { data: planos = [] } = useQuery({
    queryKey: ["planos_recibo", d.tipo],
    queryFn: () =>
      listarPlanoContasPorTipo({
        data: { tipo: d.tipo === "recebimento" ? "receita" : "despesa" },
      }),
  });
  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: listarContasFinanceiras,
  });
  const { data: conciliacoes = [] } = useQuery({
    queryKey: ["conciliacoes_para_recibo"],
    queryFn: listarConciliacoesParaRecibo,
  });
  const salvar = async () => {
    if (!d.pessoaId || !d.planoContaId || !d.descricao.trim() || !(d.valor > 0))
      return toast.error("Preencha os campos obrigatórios.");
    setSaving(true);
    try {
      await criarReciboAvulso({
        data: {
          tipo: d.tipo,
          status: d.status,
          data: d.data,
          valor: d.valor,
          descricao: d.descricao.trim(),
          irmaoId: d.pessoaTipo === "irmao" ? d.pessoaId : null,
          terceiroId: d.pessoaTipo === "terceiro" ? d.pessoaId : null,
          planoContaId: d.planoContaId,
          contaFinanceiraId: d.status === "efetivo" ? d.contaFinanceiraId || null : null,
          formaPagamento: d.formaPagamento || null,
          observacoes: d.observacoes || null,
          conciliacaoId: d.conciliacaoId || null,
        },
      });
      toast.success("Recibo avulso emitido.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao emitir recibo.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Emitir recibo avulso</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Usar movimentação já conciliada (opcional)</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={d.conciliacaoId}
            onChange={(e) => {
              const c = conciliacoes.find((item) => item.id === e.target.value);
              setD({
                ...d,
                conciliacaoId: e.target.value,
                status: "efetivo",
                data: c?.data ?? d.data,
                valor: c ? Math.abs(Number(c.valor)) : d.valor,
                descricao: c?.descricao ?? d.descricao,
              });
            }}
          >
            <option value="">Criar recibo independente</option>
            {conciliacoes.map((c) => (
              <option key={c.id} value={c.id}>
                {fmtDate(c.data)} — {brl(Math.abs(Number(c.valor)))} — {c.descricao}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            A conciliação será apenas referenciada; nenhum novo movimento de caixa será criado.
          </p>
        </div>
        <div>
          <Label>Tipo</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={d.tipo}
            onChange={(e) =>
              setD({ ...d, tipo: e.target.value as typeof d.tipo, planoContaId: "" })
            }
          >
            <option value="recebimento">Recebimento</option>
            <option value="pagamento">Pagamento</option>
          </select>
        </div>
        <div>
          <Label>Situação</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={d.status}
            onChange={(e) => setD({ ...d, status: e.target.value as typeof d.status })}
          >
            <option value="efetivo">Efetivo — movimenta caixa</option>
            <option value="previsto">Data futura — sem movimentar caixa</option>
          </select>
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
          <Label>Valor</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={d.valor}
            onChange={(e) => setD({ ...d, valor: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Vincular a</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={d.pessoaTipo}
            onChange={(e) => setD({ ...d, pessoaTipo: e.target.value, pessoaId: "" })}
          >
            <option value="irmao">Irmão</option>
            <option value="terceiro">Terceiro</option>
          </select>
        </div>
        <div>
          <Label>Nome</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={d.pessoaId}
            onChange={(e) => setD({ ...d, pessoaId: e.target.value })}
          >
            <option value="">Selecione…</option>
            {(d.pessoaTipo === "irmao"
              ? irmaos.map((i) => ({ id: i.id, nome: i.nome_civil }))
              : terceiros.map((t) => ({ id: t.id, nome: t.nome }))
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Categoria contábil</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            value={d.planoContaId}
            onChange={(e) => setD({ ...d, planoContaId: e.target.value })}
          >
            <option value="">Selecione…</option>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nome}
              </option>
            ))}
          </select>
        </div>
        {d.status === "efetivo" && (
          <div>
            <Label>Conta financeira</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={d.contaFinanceiraId}
              onChange={(e) => setD({ ...d, contaFinanceiraId: e.target.value })}
            >
              <option value="">Selecione…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <Label>Referente a</Label>
          <Input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
        </div>
        <div>
          <Label>Forma de pagamento</Label>
          <Input
            value={d.formaPagamento}
            onChange={(e) => setD({ ...d, formaPagamento: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Observações</Label>
          <Textarea
            value={d.observacoes}
            onChange={(e) => setD({ ...d, observacoes: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving}>
          {saving ? "Emitindo…" : "Emitir recibo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
