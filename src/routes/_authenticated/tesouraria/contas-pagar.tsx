import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarContasPagarAbertas,
  listarContasPagarPagas,
  criarContaPagar,
  baixarContaPagar,
  confirmarValorEfetivoContaPagar,
  editarContaPagar,
  excluirContaPagar,
  type ContaPagar,
} from "@/lib/backend/tesouraria-contas-pagar";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { FornecedorSelect } from "@/components/app/FornecedorSelect";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/tesouraria/contas-pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar — Gestão Maçônica" }] }),
  component: ContasPagar,
});

function ContasPagar() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;
  const [openNova, setOpenNova] = useState(false);

  const { data: abertas = [], isLoading } = useQuery({
    queryKey: ["contas_pagar_abertas"],
    queryFn: () => listarContasPagarAbertas(),
  });

  const { data: pagas = [] } = useQuery({
    queryKey: ["contas_pagar_pagas"],
    queryFn: () => listarContasPagarPagas(),
  });

  const hoje = toISODate(new Date());
  const ordAbertas = useOrdenacao(abertas, {
    vencimento: (l) => l.data_vencimento,
    descricao: (l) => l.descricao,
    categoria: (l) => l.plano_contas?.nome,
    fornecedor: (l) => l.terceiros?.nome,
    valor: (l) => Number(l.valor) - Number(l.valor_pago),
    status: (l) => (l.data_vencimento && l.data_vencimento < hoje ? 1 : 0),
  });
  const ordPagas = useOrdenacao(pagas, {
    pagamento: (l) => l.data_pagamento,
    descricao: (l) => l.descricao,
    categoria: (l) => l.plano_contas?.nome,
    conta: (l) => l.contas_financeiras?.nome,
    forma: (l) => l.forma_pagamento,
    valor: (l) => Number(l.valor),
  });
  const abertasPag = usePaginacao(ordAbertas.itensOrdenados);
  const pagasPag = usePaginacao(ordPagas.itensOrdenados);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["contas_pagar_abertas"] });
    qc.invalidateQueries({ queryKey: ["contas_pagar_pagas"] });
  };

  const totalAberto = abertas.reduce((s, l) => s + Number(l.valor) - Number(l.valor_pago), 0);

  return (
    <>
      <PageHeader
        title="Contas a Pagar"
        description="Despesas provisionadas com baixa em conta bancária e postagem contábil automática."
        actions={
          podeEditar && (
            <Dialog open={openNova} onOpenChange={setOpenNova}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" /> Nova conta a pagar
                </Button>
              </DialogTrigger>
              <NovaContaPagarDialog
                onDone={() => {
                  setOpenNova(false);
                  invalidate();
                }}
              />
            </Dialog>
          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="text-sm text-muted-foreground">Total em aberto</div>
        <div className="text-2xl font-semibold">{brl(totalAberto)}</div>
      </Card>

      <Tabs defaultValue="abertas">
        <TabsList className="mb-4">
          <TabsTrigger value="abertas">Em aberto</TabsTrigger>
          <TabsTrigger value="pagas">Pagas</TabsTrigger>
        </TabsList>

        <TabsContent value="abertas">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="vencimento" ord={ordAbertas}>
                    Vencimento
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="descricao" ord={ordAbertas}>
                    Descrição
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="categoria"
                    ord={ordAbertas}
                    className="hidden sm:table-cell"
                  >
                    Categoria
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="fornecedor"
                    ord={ordAbertas}
                    className="hidden sm:table-cell"
                  >
                    Fornecedor
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="valor" ord={ordAbertas} className="text-right">
                    Valor
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="status"
                    ord={ordAbertas}
                    className="hidden sm:table-cell"
                  >
                    Status
                  </TableHeadOrdenavel>
                  {podeEditar && <TableHead className="text-right"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!isLoading && abertas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                      Nenhuma conta em aberto.
                    </TableCell>
                  </TableRow>
                )}
                {abertasPag.itensPagina.map((l) => {
                  const vencida = l.data_vencimento && l.data_vencimento < hoje;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        {fmtDate(l.data_vencimento)}
                        {vencida && (
                          <div className="sm:hidden">
                            <Badge variant="destructive" className="mt-1">
                              Vencida
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {l.descricao}
                        {l.recorrente_id && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Origem: despesa recorrente
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground sm:hidden">
                          {[l.plano_contas?.nome, l.terceiros?.nome].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {l.plano_contas?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {l.terceiros?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(Number(l.valor) - Number(l.valor_pago))}
                        {l.recorrente_id && !l.valor_efetivo_confirmado && (
                          <div className="text-xs font-normal text-muted-foreground">
                            Valor previsto
                          </div>
                        )}
                        {l.recorrente_id &&
                          l.valor_efetivo_confirmado &&
                          l.valor_previsto != null &&
                          Number(l.valor_previsto) !== Number(l.valor) && (
                            <div className="text-xs font-normal text-muted-foreground">
                              previsto: {brl(l.valor_previsto)}
                            </div>
                          )}
                        {l.valor_pago > 0 && (
                          <div className="text-xs font-normal text-muted-foreground">
                            de {brl(l.valor)} — parcial
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {l.recorrente_id && !l.valor_efetivo_confirmado ? (
                          <Badge variant="secondary">Aguardando valor efetivo</Badge>
                        ) : vencida ? (
                          <Badge variant="destructive">Vencida</Badge>
                        ) : (
                          <Badge variant="outline">Aberta</Badge>
                        )}
                      </TableCell>
                      {podeEditar && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {l.recorrente_id && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="px-2 sm:px-3">
                                    <Pencil className="h-4 w-4 sm:mr-1" />
                                    <span className="hidden sm:inline">
                                      {l.valor_efetivo_confirmado
                                        ? "Corrigir valor"
                                        : "Informar valor"}
                                    </span>
                                  </Button>
                                </DialogTrigger>
                                <ValorEfetivoDialog lancamento={l} onDone={invalidate} />
                              </Dialog>
                            )}
                            {!l.recorrente_id && Number(l.valor_pago) === 0 && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="px-2 sm:px-3">
                                    <Pencil className="h-4 w-4 sm:mr-1" />
                                    <span className="hidden sm:inline">Editar</span>
                                  </Button>
                                </DialogTrigger>
                                <EditarContaPagarDialog lancamento={l} onDone={invalidate} />
                              </Dialog>
                            )}
                            {!l.recorrente_id && Number(l.valor_pago) === 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="px-2 text-destructive hover:text-destructive sm:px-3"
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Excluir a conta “${l.descricao}”? Esta ação não pode ser desfeita.`,
                                    )
                                  )
                                    return;
                                  try {
                                    await excluirContaPagar({ data: { id: l.id } });
                                    toast.success("Conta a pagar excluída.");
                                    invalidate();
                                  } catch (erro) {
                                    toast.error(
                                      erro instanceof Error
                                        ? erro.message
                                        : "Não foi possível excluir.",
                                    );
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 sm:mr-1" />
                                <span className="hidden sm:inline">Excluir</span>
                              </Button>
                            )}
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="px-2 sm:px-3"
                                  disabled={!!l.recorrente_id && !l.valor_efetivo_confirmado}
                                >
                                  <CheckCircle2 className="h-4 w-4 sm:mr-1" />
                                  <span className="hidden sm:inline">Baixar</span>
                                </Button>
                              </DialogTrigger>
                              <BaixarContaPagarDialog lancamento={l} onDone={invalidate} />
                            </Dialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TabelaPaginacao
              pagina={abertasPag.pagina}
              totalPaginas={abertasPag.totalPaginas}
              totalItens={abertasPag.totalItens}
              tamanhoPagina={abertasPag.tamanhoPagina}
              setPagina={abertasPag.setPagina}
            />
          </Card>
        </TabsContent>

        <TabsContent value="pagas">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="pagamento" ord={ordPagas}>
                    Pagamento
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="descricao" ord={ordPagas}>
                    Descrição
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="categoria"
                    ord={ordPagas}
                    className="hidden sm:table-cell"
                  >
                    Categoria
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="conta" ord={ordPagas} className="hidden sm:table-cell">
                    Conta
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="forma" ord={ordPagas} className="hidden lg:table-cell">
                    Forma
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="valor" ord={ordPagas} className="text-right">
                    Valor
                  </TableHeadOrdenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      Nenhuma conta paga ainda.
                    </TableCell>
                  </TableRow>
                )}
                {pagasPag.itensPagina.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{fmtDate(l.data_pagamento)}</TableCell>
                    <TableCell>
                      {l.descricao}
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {[l.plano_contas?.nome, l.contas_financeiras?.nome]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {l.plano_contas?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {l.contas_financeiras?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {l.forma_pagamento ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{brl(l.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TabelaPaginacao
              pagina={pagasPag.pagina}
              totalPaginas={pagasPag.totalPaginas}
              totalItens={pagasPag.totalItens}
              tamanhoPagina={pagasPag.tamanhoPagina}
              setPagina={pagasPag.setPagina}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function NovaContaPagarDialog({ onDone }: { onDone: () => void }) {
  const [d, setD] = useState({
    descricao: "",
    valor: 0,
    plano_conta_id: "",
    terceiro_id: "none",
    data: toISODate(new Date()),
    data_vencimento: toISODate(new Date()),
    observacoes: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos_despesa"],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "despesa" } }),
  });

  const salvar = async () => {
    if (!d.descricao.trim() || !(Number(d.valor) > 0) || !d.plano_conta_id) return;
    setSaving(true);
    try {
      await criarContaPagar({
        data: {
          descricao: d.descricao.trim(),
          valor: Number(d.valor),
          planoContaId: d.plano_conta_id,
          data: d.data,
          dataVencimento: d.data_vencimento,
          terceiroId: d.terceiro_id === "none" ? null : d.terceiro_id,
          observacoes: d.observacoes || null,
        },
      });
      toast.success("Conta a pagar registrada e provisão contábil lançada.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Nova conta a pagar</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="conta-pagar-descricao">Descrição</Label>
          <Input
            id="conta-pagar-descricao"
            value={d.descricao}
            onChange={(e) => setD({ ...d, descricao: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="conta-pagar-valor">Valor</Label>
          <Input
            id="conta-pagar-valor"
            type="number"
            step="0.01"
            min="0"
            value={d.valor}
            onChange={(e) => setD({ ...d, valor: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="conta-pagar-categoria">Categoria</Label>
          <Select value={d.plano_conta_id} onValueChange={(v) => setD({ ...d, plano_conta_id: v })}>
            <SelectTrigger id="conta-pagar-categoria">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {planos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="conta-pagar-fornecedor">Fornecedor (opcional)</Label>
          <FornecedorSelect
            triggerId="conta-pagar-fornecedor"
            value={d.terceiro_id}
            onValueChange={(v) => setD({ ...d, terceiro_id: v })}
          />
        </div>
        <div>
          <Label htmlFor="conta-pagar-emissao">Emissão</Label>
          <Input
            id="conta-pagar-emissao"
            type="date"
            value={d.data}
            onChange={(e) => setD({ ...d, data: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="conta-pagar-vencimento">Vencimento</Label>
          <Input
            id="conta-pagar-vencimento"
            type="date"
            value={d.data_vencimento}
            onChange={(e) => setD({ ...d, data_vencimento: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="conta-pagar-observacoes">Observações</Label>
          <Textarea
            id="conta-pagar-observacoes"
            value={d.observacoes}
            onChange={(e) => setD({ ...d, observacoes: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={salvar}
          disabled={saving || !d.descricao || !(Number(d.valor) > 0) || !d.plano_conta_id}
        >
          Registrar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditarContaPagarDialog({
  lancamento,
  onDone,
}: {
  lancamento: ContaPagar;
  onDone: () => void;
}) {
  const [d, setD] = useState({
    descricao: lancamento.descricao,
    valor: Number(lancamento.valor),
    plano_conta_id: lancamento.plano_conta_id,
    terceiro_id: lancamento.terceiro_id ?? "none",
    data: lancamento.data,
    data_vencimento: lancamento.data_vencimento ?? lancamento.data,
    observacoes: lancamento.observacoes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const { data: planos = [] } = useQuery({
    queryKey: ["planos_despesa"],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "despesa" } }),
  });
  const salvar = async () => {
    if (!d.descricao.trim() || !(d.valor > 0) || !d.plano_conta_id) return;
    setSaving(true);
    try {
      await editarContaPagar({
        data: {
          id: lancamento.id,
          descricao: d.descricao.trim(),
          valor: d.valor,
          planoContaId: d.plano_conta_id,
          data: d.data,
          dataVencimento: d.data_vencimento,
          terceiroId: d.terceiro_id === "none" ? null : d.terceiro_id,
          observacoes: d.observacoes || null,
        },
      });
      toast.success("Conta a pagar atualizada.");
      onDone();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível editar.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Editar conta a pagar</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="contas-pagar-descricao">Descrição</Label>
          <Input
            id="contas-pagar-descricao"
            value={d.descricao}
            onChange={(e) => setD({ ...d, descricao: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="contas-pagar-valor">Valor</Label>
          <Input
            id="contas-pagar-valor"
            type="number"
            min="0.01"
            step="0.01"
            value={d.valor}
            onChange={(e) => setD({ ...d, valor: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="contas-pagar-categoria">Categoria</Label>
          <Select value={d.plano_conta_id} onValueChange={(v) => setD({ ...d, plano_conta_id: v })}>
            <SelectTrigger id="contas-pagar-categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {planos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="contas-pagar-fornecedor">Fornecedor</Label>
          <FornecedorSelect
            triggerId="contas-pagar-fornecedor"
            value={d.terceiro_id}
            onValueChange={(v) => setD({ ...d, terceiro_id: v })}
          />
        </div>
        <div>
          <Label htmlFor="contas-pagar-emissao">Emissão</Label>
          <Input
            id="contas-pagar-emissao"
            type="date"
            value={d.data}
            onChange={(e) => setD({ ...d, data: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="contas-pagar-vencimento">Vencimento</Label>
          <Input
            id="contas-pagar-vencimento"
            type="date"
            value={d.data_vencimento}
            onChange={(e) => setD({ ...d, data_vencimento: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="contas-pagar-observacoes">Observações</Label>
          <Textarea
            id="contas-pagar-observacoes"
            value={d.observacoes}
            onChange={(e) => setD({ ...d, observacoes: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={salvar}
          disabled={saving || !d.descricao || !(d.valor > 0) || !d.plano_conta_id}
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function BaixarContaPagarDialog({
  lancamento,
  onDone,
}: {
  lancamento: ContaPagar;
  onDone: () => void;
}) {
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(toISODate(new Date()));
  const [saving, setSaving] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });

  const baixar = async () => {
    if (!contaFinanceiraId) return toast.error("Selecione a conta que pagou.");
    setSaving(true);
    try {
      await baixarContaPagar({
        data: {
          lancamentoId: lancamento.id,
          contaFinanceiraId,
          formaPagamento: formaPagamento || null,
          dataPagamento,
        },
      });
      toast.success("Baixa registrada e lançamento contábil postado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Baixar: {lancamento.descricao}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm text-muted-foreground">
          Valor: <span className="font-medium text-foreground">{brl(lancamento.valor)}</span>
        </div>
        <div>
          <Label htmlFor="conta-pagar-conta-financeira">Conta que pagou</Label>
          <Select value={contaFinanceiraId} onValueChange={setContaFinanceiraId}>
            <SelectTrigger id="conta-pagar-conta-financeira">
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
        <div>
          <Label htmlFor="conta-pagar-forma-pagamento">Forma de pagamento</Label>
          <Input
            id="conta-pagar-forma-pagamento"
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
            placeholder="PIX, boleto, débito…"
          />
        </div>
        <div>
          <Label htmlFor="conta-pagar-data-pagamento">Data do pagamento</Label>
          <Input
            id="conta-pagar-data-pagamento"
            type="date"
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={baixar} disabled={saving || !contaFinanceiraId}>
          Confirmar baixa
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ValorEfetivoDialog({
  lancamento,
  onDone,
}: {
  lancamento: ContaPagar;
  onDone: () => void;
}) {
  const [valor, setValor] = useState(Number(lancamento.valor));
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!(valor > 0)) return;
    setSalvando(true);
    try {
      await confirmarValorEfetivoContaPagar({
        data: { lancamentoId: lancamento.id, valorEfetivo: valor },
      });
      toast.success("Valor efetivo confirmado. A conta já pode ser paga.");
      onDone();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível confirmar o valor.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Confirmar valor efetivo</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium">{lancamento.descricao}</div>
          <div className="text-sm text-muted-foreground">
            Previsão original: {brl(lancamento.valor_previsto ?? lancamento.valor)}
          </div>
        </div>
        <div>
          <Label htmlFor={`valor-efetivo-${lancamento.id}`}>Valor efetivo para pagamento</Label>
          <Input
            id={`valor-efetivo-${lancamento.id}`}
            type="number"
            min="0.01"
            step="0.01"
            autoFocus
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={salvando || !(valor > 0)}>
          {salvando ? "Salvando…" : "Confirmar valor"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
