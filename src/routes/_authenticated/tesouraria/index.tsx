import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarPlanoContas, listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import {
  listarLancamentos,
  criarLancamentoManual,
  criarTransferencia,
  gerarMensalidades as gerarMensalidadesFn,
} from "@/lib/backend/tesouraria-lancamentos";
import { AcoesLancamento } from "@/components/app/LancamentoAcoes";
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
  DialogClose,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/lib/auth-hooks";
import { Plus, Repeat } from "lucide-react";
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
  const [openConfirmGerar, setOpenConfirmGerar] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const agora = new Date();
  const mesAtual = `${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;

  const contas = useQuery({
    queryKey: ["contas"],
    queryFn: () => listarContasFinanceiras(),
  });
  const planos = useQuery({
    queryKey: ["planos"],
    queryFn: async () => (await listarPlanoContas()).filter((p) => p.ativo),
  });
  const receitas = useQuery({
    queryKey: ["planos_receita"],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "receita" } }),
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
    setIsGenerating(true);
    const hoje = new Date();
    const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
    const mesAno = hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    try {
      const total = await gerarMensalidadesFn({ data: { competencia: comp } });
      toast.success(`${total} mensalidade(s) geradas para ${mesAno}.`);
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar mensalidades.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <AlertDialog open={openConfirmGerar} onOpenChange={setOpenConfirmGerar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar mensalidades — {mesAtual}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá gerar mensalidades para todos os irmãos ativos referentes a{" "}
              <strong>{mesAtual}</strong>. Mensalidades já existentes para este período não serão
              duplicadas. A operação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isGenerating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={gerarMensalidades} disabled={isGenerating}>
              {isGenerating ? "Gerando…" : "Gerar mensalidades"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageHeader
        title="Tesouraria"
        description="Movimento financeiro, transferências e mensalidades."
        actions={
          can.canManageFinancas && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpenConfirmGerar(true)}>
                <Repeat className="h-4 w-4 mr-1" /> Gerar mensalidades do mês
              </Button>
              <Dialog open={openTransf} onOpenChange={setOpenTransf}>
                <DialogTrigger asChild>
                  <Button variant="outline">Transferência</Button>
                </DialogTrigger>
                <TransferenciaDialog
                  key={String(openTransf)}
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden sm:table-cell">Emissão</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead aria-label="Ações"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancamentos.isLoading &&
                  [0, 1, 2, 3, 4].map((i) => (
                    <TableRow key={i}>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-4 w-16 ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-14 rounded-full" />
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                {lancamentos.isError && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-6 text-destructive">
                      Erro ao carregar lançamentos.{" "}
                      <button className="underline" onClick={() => lancamentos.refetch()}>
                        Tentar novamente
                      </button>
                    </TableCell>
                  </TableRow>
                )}
                {!lancamentos.isLoading &&
                  !lancamentos.isError &&
                  (lancamentos.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                        Nenhum lançamento.
                      </TableCell>
                    </TableRow>
                  )}
                {itensPagina.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="hidden sm:table-cell">{fmtDate(l.data)}</TableCell>
                    <TableCell>{l.data_vencimento ? fmtDate(l.data_vencimento) : "—"}</TableCell>
                    <TableCell>{l.descricao}</TableCell>
                    <TableCell>
                      {l.contas_financeiras?.nome ?? "—"}
                      {l.destino?.nome && (
                        <span className="text-muted-foreground"> → {l.destino.nome}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {l.plano_contas?.nome ?? "—"}
                    </TableCell>
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
                        {l.tipo === "entrada" ? "Entrada" : l.tipo === "saida" ? "Saída" : l.tipo}
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
                        <AcoesLancamento
                          lancamento={l}
                          contas={contas.data ?? []}
                          receitas={receitas.data ?? []}
                          onDone={invalidateLancamentos}
                        />
                      )}
                    </TableCell>
                  </TableRow>
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
          <Label htmlFor="lanc-tipo">Tipo</Label>
          <Select value={d.tipo} onValueChange={(v) => setD({ ...d, tipo: v })}>
            <SelectTrigger id="lanc-tipo">
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
          {!Number(d.valor) && (
            <p className="mt-1 text-xs text-destructive">O valor não pode ser zero.</p>
          )}
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
          <Label htmlFor="lanc-conta">Conta</Label>
          <Select value={d.conta_id} onValueChange={(v) => setD({ ...d, conta_id: v })}>
            <SelectTrigger id="lanc-conta">
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
          <Label htmlFor="lanc-categoria">Categoria (plano de contas)</Label>
          <Select value={d.plano_conta_id} onValueChange={(v) => setD({ ...d, plano_conta_id: v })}>
            <SelectTrigger id="lanc-categoria">
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
          <Checkbox
            id="pago"
            checked={d.pago}
            onCheckedChange={(v) => setD({ ...d, pago: v === true })}
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
        <DialogClose asChild>
          <Button variant="outline" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button onClick={save} disabled={saving || !d.descricao || !d.conta_id || !Number(d.valor)}>
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
          <Label htmlFor="transf-origem">Conta de origem</Label>
          <Select
            value={d.conta_id}
            onValueChange={(v) => {
              const destino = d.conta_destino_id === v
                ? contas.find((c: any) => c.id !== v)?.id ?? ""
                : d.conta_destino_id;
              setD({ ...d, conta_id: v, conta_destino_id: destino });
            }}
          >
            <SelectTrigger id="transf-origem">
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
          <Label htmlFor="transf-destino">Conta de destino</Label>
          <Select
            value={d.conta_destino_id}
            onValueChange={(v) => setD({ ...d, conta_destino_id: v })}
          >
            <SelectTrigger id="transf-destino">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contas.filter((c: any) => c.id !== d.conta_id).map((c: any) => (
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
        <DialogClose asChild>
          <Button variant="outline" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button onClick={save} disabled={saving || !Number(d.valor)}>
          Transferir
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
