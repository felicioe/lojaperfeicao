import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import {
  obterResumoTronco,
  registrarSaidaTronco,
  salvarSaldoInicialTronco,
} from "@/lib/backend/tesouraria-tronco";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { PageHeader } from "@/components/app/AppShell";
import { CabecalhoInstitucional } from "@/components/app/CabecalhoInstitucional";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Landmark, Pencil, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { toISODate } from "@/lib/format";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate } from "@/lib/format";
import { RecebimentoAvulsoDialog } from "@/components/app/RecebimentoAvulso";
import { useMovimentosFiltrados } from "@/components/app/movimentos-filtros";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/tesouraria/tronco")({
  head: () => ({ meta: [{ title: "Tronco de Beneficência — Gestão Maçônica" }] }),
  component: Tronco,
});

const COLUNAS_TRONCO: ColunaRelatorio[] = [
  { chave: "data", titulo: "Data" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "valor", titulo: "Valor" },
];

function Tronco() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;
  const [open, setOpen] = useState(false);
  const [saidaAberta, setSaidaAberta] = useState(false);
  const [saldoAberto, setSaldoAberto] = useState(false);
  // Lançamento de tronco nasce sempre pago=TRUE (registrar_recebimento_avulso) —
  // "não pago" (padrão do hook) deixaria essa tela permanentemente vazia.
  const f = useMovimentosFiltrados({ categoria: "tronco", statusInicial: "todos" });

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });
  const { data: resumo = { saldoInicial: 0, entradas: 0, saidas: 0, saldoAtual: 0 } } = useQuery({
    queryKey: ["tronco_resumo"],
    queryFn: () => obterResumoTronco(),
  });

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["movimentos_financeiros"] }),
      qc.invalidateQueries({ queryKey: ["tronco_resumo"] }),
      qc.invalidateQueries({ queryKey: ["saldos"] }),
    ]);
  };
  const ord = useOrdenacao(f.movimentos, {
    data: (m) => m.data,
    descricao: (m) => m.descricao,
    valor: (m) => Number(m.valor),
  });
  const movPag = usePaginacao(ord.itensOrdenados);
  const linhasExportacao = f.movimentos.map((movimento) => ({
    data: fmtDate(movimento.data),
    descricao: movimento.descricao,
    tipo: movimento.tipo === "saida" ? "Saída" : "Entrada PIX",
    valor: movimento.tipo === "saida" ? -Number(movimento.valor) : Number(movimento.valor),
  }));

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Tronco de Beneficência"
          description="Arrecadações do tronco — mesma tabela de recebimentos, filtrada pela categoria."
          actions={
            <div className="flex flex-wrap gap-2 print:hidden">
              <ExportarRelatorio
                titulo="Relatório do Tronco de Beneficência"
                colunas={COLUNAS_TRONCO}
                linhas={linhasExportacao}
                permitirImpressao
                permitirWhatsapp
                resumoCompartilhamento={`Saldo atual: ${brl(resumo.saldoAtual)} · Entradas: ${brl(resumo.entradas)} · Saídas: ${brl(resumo.saidas)}`}
              />
              {podeEditar && (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-1" /> Registrar Tronco
                    </Button>
                  </DialogTrigger>
                  <RecebimentoAvulsoDialog
                    contas={contas}
                    categoriaInicial="tronco"
                    onDone={() => {
                      setOpen(false);
                      invalidate();
                    }}
                  />
                </Dialog>
              )}
              {podeEditar && (
                <Dialog open={saidaAberta} onOpenChange={setSaidaAberta}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <ArrowDown className="mr-1.5 h-4 w-4" /> Registrar saída
                    </Button>
                  </DialogTrigger>
                  <SaidaTroncoDialog
                    contas={contas}
                    onDone={async () => {
                      setSaidaAberta(false);
                      await invalidate();
                    }}
                  />
                </Dialog>
              )}
              <Link to="/tesouraria/movimentos">
                <Button variant="outline">Ver todos os movimentos</Button>
              </Link>
            </div>
          }
        />
      </div>

      <div className="hidden print:block">
        <CabecalhoInstitucional compacto />
        <div className="mb-5 text-center">
          <h1 className="text-xl font-semibold">Relatório do Tronco de Beneficência</h1>
          <p className="text-sm text-muted-foreground">
            Controle gerencial e confidencial · Emitido em {new Date().toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="mb-4 grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <ResumoItem icon={Landmark} label="Saldo inicial" valor={resumo.saldoInicial}>
          {podeEditar && (
            <Dialog open={saldoAberto} onOpenChange={setSaldoAberto}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs">
                  <Pencil className="mr-1 h-3 w-3" /> Informar saldo
                </Button>
              </DialogTrigger>
              <SaldoInicialDialog
                valorAtual={resumo.saldoInicial}
                onDone={async () => {
                  setSaldoAberto(false);
                  await invalidate();
                }}
              />
            </Dialog>
          )}
        </ResumoItem>
        <ResumoItem icon={ArrowUp} label="Entradas PIX" valor={resumo.entradas} />
        <ResumoItem icon={ArrowDown} label="Saídas" valor={resumo.saidas} />
        <ResumoItem
          icon={Wallet}
          label="Saldo atual do Tronco"
          valor={resumo.saldoAtual}
          destaque
        />
      </div>

      <Card className="print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="data" ord={ord}>
                Data
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="descricao" ord={ord}>
                Descrição
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                Tipo / valor
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {f.movimentos.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                  Nenhuma arrecadação registrada ainda.
                </TableCell>
              </TableRow>
            )}
            {movPag.itensPagina.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{fmtDate(m.data)}</TableCell>
                <TableCell>{m.descricao}</TableCell>
                <TableCell className="text-right font-medium">
                  <span className={m.tipo === "saida" ? "text-destructive" : "text-emerald-600"}>
                    {m.tipo === "saida" ? "−" : "+"} {brl(m.valor)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="print:hidden">
          <TabelaPaginacao
            pagina={movPag.pagina}
            totalPaginas={movPag.totalPaginas}
            totalItens={movPag.totalItens}
            tamanhoPagina={movPag.tamanhoPagina}
            setPagina={movPag.setPagina}
          />
        </div>
      </Card>

      <div className="hidden print:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {f.movimentos.map((movimento) => (
              <TableRow key={movimento.id}>
                <TableCell>{fmtDate(movimento.data)}</TableCell>
                <TableCell>{movimento.descricao}</TableCell>
                <TableCell>{movimento.tipo === "saida" ? "Saída" : "Entrada PIX"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {movimento.tipo === "saida" ? "−" : "+"} {brl(movimento.valor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function ResumoItem({
  icon: Icon,
  label,
  valor,
  destaque,
  children,
}: {
  icon: typeof Wallet;
  label: string;
  valor: number;
  destaque?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-28 items-start gap-3 border-b p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold tabular-nums ${destaque ? "text-primary" : ""}`}>
          {brl(valor)}
        </div>
        {children}
      </div>
    </div>
  );
}

function SaldoInicialDialog({
  valorAtual,
  onDone,
}: {
  valorAtual: number;
  onDone: () => Promise<void>;
}) {
  const [valor, setValor] = useState(valorAtual);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarSaldoInicialTronco({ data: { valor: Number(valor) } });
      toast.success("Saldo inicial atualizado.");
      await onDone();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Saldo inicial do Tronco</DialogTitle>
        <DialogDescription>
          Valor informativo para compor o controle reservado. Não altera o saldo bancário.
        </DialogDescription>
      </DialogHeader>
      <div>
        <Label htmlFor="tronco-saldo-inicial">Saldo inicial</Label>
        <Input
          id="tronco-saldo-inicial"
          type="number"
          min={0}
          step="0.01"
          value={valor}
          onChange={(e) => setValor(Number(e.target.value))}
        />
      </div>
      <DialogFooter>
        <Button onClick={() => void salvar()} disabled={salvando || valor < 0}>
          {salvando ? "Salvando…" : "Salvar saldo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SaidaTroncoDialog({
  contas,
  onDone,
}: {
  contas: { id: string; nome: string }[];
  onDone: () => Promise<void>;
}) {
  const [valor, setValor] = useState(0);
  const [data, setData] = useState(toISODate(new Date()));
  const [contaId, setContaId] = useState("");
  const [planoContaId, setPlanoContaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const { data: despesas = [] } = useQuery({
    queryKey: ["planos_despesa"],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: "despesa" } }),
  });
  const salvar = async () => {
    if (!(valor > 0) || !contaId || !planoContaId || !descricao.trim())
      return toast.error("Preencha valor, conta, categoria e descrição.");
    setSalvando(true);
    try {
      await registrarSaidaTronco({
        data: {
          valor,
          data,
          contaFinanceiraId: contaId,
          planoContaId,
          descricao: descricao.trim(),
          observacoes: observacoes.trim() || null,
        },
      });
      toast.success("Saída do Tronco registrada.");
      await onDone();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Registrar saída do Tronco</DialogTitle>
        <DialogDescription>
          O pagamento reduz o saldo reservado e a conta bancária escolhida.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="tronco-valor">Valor</Label>
          <Input
            id="tronco-valor"
            type="number"
            min={0.01}
            step="0.01"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="tronco-data-do-pagamento">Data do pagamento</Label>
          <Input
            id="tronco-data-do-pagamento"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="tronco-conta-bancaria">Conta bancária</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger id="tronco-conta-bancaria">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tronco-categoria-contabil">Categoria contábil</Label>
          <Select value={planoContaId} onValueChange={setPlanoContaId}>
            <SelectTrigger id="tronco-categoria-contabil">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {despesas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.codigo} — {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tronco-descricao">Descrição</Label>
          <Input
            id="tronco-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: auxílio beneficente"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="tronco-observacoes-opcional">Observações (opcional)</Label>
          <Textarea
            id="tronco-observacoes-opcional"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Registrando…" : "Registrar saída"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
