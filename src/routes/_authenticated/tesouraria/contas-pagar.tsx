import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarContasPagarAbertas,
  listarContasPagarPagas,
  criarContaPagar,
  baixarContaPagar,
  type ContaPagar,
} from "@/lib/backend/tesouraria-contas-pagar";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { listarFornecedores } from "@/lib/backend/terceiros";
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
import { CheckCircle2, Plus } from "lucide-react";
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
                  <TableHeadOrdenavel campo="categoria" ord={ordAbertas}>
                    Categoria
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="fornecedor" ord={ordAbertas}>
                    Fornecedor
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="valor" ord={ordAbertas} className="text-right">
                    Valor
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="status" ord={ordAbertas}>
                    Status
                  </TableHeadOrdenavel>
                  {podeEditar && <TableHead className="text-right">Ações</TableHead>}
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
                      <TableCell>{fmtDate(l.data_vencimento)}</TableCell>
                      <TableCell>{l.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {l.plano_contas?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {l.terceiros?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(Number(l.valor) - Number(l.valor_pago))}
                        {l.valor_pago > 0 && (
                          <div className="text-xs font-normal text-muted-foreground">
                            de {brl(l.valor)} — parcial
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {vencida ? (
                          <Badge variant="destructive">Vencida</Badge>
                        ) : (
                          <Badge variant="outline">Aberta</Badge>
                        )}
                      </TableCell>
                      {podeEditar && (
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Baixar
                              </Button>
                            </DialogTrigger>
                            <BaixarContaPagarDialog lancamento={l} onDone={invalidate} />
                          </Dialog>
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
                  <TableHeadOrdenavel campo="categoria" ord={ordPagas}>
                    Categoria
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="conta" ord={ordPagas}>
                    Conta
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="forma" ord={ordPagas}>
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
                    <TableCell>{l.descricao}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.plano_contas?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.contas_financeiras?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
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

  const { data: terceiros = [] } = useQuery({
    queryKey: ["terceiros_fornecedores"],
    queryFn: () => listarFornecedores(),
  });

  const salvar = async () => {
    if (!d.descricao.trim() || !d.valor || !d.plano_conta_id) return;
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
          <Label>Descrição</Label>
          <Input value={d.descricao} onChange={(e) => setD({ ...d, descricao: e.target.value })} />
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
        <div>
          <Label>Categoria</Label>
          <Select value={d.plano_conta_id} onValueChange={(v) => setD({ ...d, plano_conta_id: v })}>
            <SelectTrigger>
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
          <Label>Fornecedor (opcional)</Label>
          <Select value={d.terceiro_id} onValueChange={(v) => setD({ ...d, terceiro_id: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— nenhum —</SelectItem>
              {terceiros.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Emissão</Label>
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
        <div className="md:col-span-2">
          <Label>Observações</Label>
          <Textarea
            value={d.observacoes}
            onChange={(e) => setD({ ...d, observacoes: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving || !d.descricao || !d.valor || !d.plano_conta_id}>
          Registrar
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
          <Label>Conta que pagou</Label>
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
        <div>
          <Label>Forma de pagamento</Label>
          <Input
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
            placeholder="PIX, boleto, débito…"
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
      <DialogFooter>
        <Button onClick={baixar} disabled={saving || !contaFinanceiraId}>
          Confirmar baixa
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
