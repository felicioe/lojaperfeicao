import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarOrcamentos,
  listarOrcamentoItens,
  listarContasOrcamento,
  listarRealizadoAnual,
  criarOrcamento,
  definirValorOrcamento,
  aprovarOrcamento,
  reabrirOrcamento,
  listarOrcamentoCaixaItens,
  definirValorOrcamentoCaixa,
  listarOrcamentoVersoes,
  listarItensVersaoOrcamento,
  type ContaOrcamento,
} from "@/lib/backend/contabilidade-orcamento";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, History, Lock, Plus, Unlock } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl } from "@/lib/format";
import { mensagemDeErro } from "@/lib/erro";

export const Route = createFileRoute("/_authenticated/contabilidade/orcamento")({
  head: () => ({ meta: [{ title: "Orçamento Anual — Gestão Maçônica" }] }),
  component: Orcamento,
});

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function Orcamento() {
  const can = useCan();
  const qc = useQueryClient();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoAno, setNovoAno] = useState(String(new Date().getFullYear() + 1));
  const [novoObs, setNovoObs] = useState("");
  const [versoesOpen, setVersoesOpen] = useState(false);
  const [versaoSelecionadaId, setVersaoSelecionadaId] = useState<string | null>(null);

  const { data: orcamentos = [] } = useQuery({
    queryKey: ["orcamentos"],
    queryFn: () => listarOrcamentos(),
  });

  const selecionado = orcamentos.find((o) => o.id === selecionadoId) ?? orcamentos[0] ?? null;

  const { data: contas = [] } = useQuery({
    queryKey: ["plano_contas_orcamento"],
    queryFn: () => listarContasOrcamento(),
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["orcamento_itens", selecionado?.id],
    enabled: !!selecionado,
    queryFn: () => listarOrcamentoItens({ data: { orcamentoId: selecionado!.id } }),
  });

  const { data: realizado = [] } = useQuery({
    queryKey: ["orcamento_realizado", selecionado?.ano],
    enabled: !!selecionado,
    queryFn: () => listarRealizadoAnual({ data: { ano: selecionado!.ano } }),
  });

  // Orçamento em base de caixa (achado #581 da auditoria): mesmo cabeçalho
  // orcamentos, itens numa tabela irmã (orcamento_caixa_itens) pra não
  // misturar com os valores de competência acima.
  const { data: itensCaixa = [] } = useQuery({
    queryKey: ["orcamento_caixa_itens", selecionado?.id],
    enabled: !!selecionado,
    queryFn: () => listarOrcamentoCaixaItens({ data: { orcamentoId: selecionado!.id } }),
  });

  // Versionamento (achado #582 da auditoria): cada aprovação tira um
  // snapshot dos itens vigentes sob a versão corrente — permite comparar
  // "orçado original" x "orçado revisado" depois de uma reabertura.
  const { data: versoes = [] } = useQuery({
    queryKey: ["orcamento_versoes", selecionado?.id],
    enabled: !!selecionado,
    queryFn: () => listarOrcamentoVersoes({ data: { orcamentoId: selecionado!.id } }),
  });

  const versaoSelecionada = versoes.find((v) => v.id === versaoSelecionadaId) ?? null;

  const { data: itensVersao = [] } = useQuery({
    queryKey: ["orcamento_versao_itens", versaoSelecionadaId],
    enabled: !!versaoSelecionadaId,
    queryFn: () =>
      listarItensVersaoOrcamento({ data: { orcamentoVersaoId: versaoSelecionadaId! } }),
  });

  const totaisVersaoSelecionada = useMemo(() => {
    const t = { receitaCompetencia: 0, despesaCompetencia: 0, entradaCaixa: 0, saidaCaixa: 0 };
    for (const it of itensVersao) {
      const conta = contas.find((c) => c.id === it.conta_id);
      if (!conta) continue;
      if (it.regime === "competencia") {
        if (conta.tipo === "receita") t.receitaCompetencia += Number(it.valor);
        else t.despesaCompetencia += Number(it.valor);
      } else {
        if (conta.tipo === "receita") t.entradaCaixa += Number(it.valor);
        else t.saidaCaixa += Number(it.valor);
      }
    }
    return t;
  }, [itensVersao, contas]);

  const valorMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of itens) m.set(`${it.conta_id}:${it.mes}`, Number(it.valor));
    return m;
  }, [itens]);

  const valorMapCaixa = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of itensCaixa) m.set(`${it.conta_id}:${it.mes}`, Number(it.valor));
    return m;
  }, [itensCaixa]);

  const realizadoPorMes = useMemo(() => {
    const receita = Array(12).fill(0);
    const despesa = Array(12).fill(0);
    for (const it of realizado) {
      const mes = new Date(it.data + "T00:00:00").getMonth();
      if (it.conta_tipo === "receita") {
        receita[mes] += it.tipo === "credito" ? Number(it.valor) : -Number(it.valor);
      } else {
        despesa[mes] += it.tipo === "debito" ? Number(it.valor) : -Number(it.valor);
      }
    }
    return { receita, despesa };
  }, [realizado]);

  const orcadoPorMes = useMemo(() => {
    const receita = Array(12).fill(0);
    const despesa = Array(12).fill(0);
    for (const it of itens) {
      const conta = contas.find((c) => c.id === it.conta_id);
      if (!conta) continue;
      const arr = conta.tipo === "receita" ? receita : despesa;
      arr[it.mes - 1] += Number(it.valor);
    }
    return { receita, despesa };
  }, [itens, contas]);

  // Realizado por conta × mês (achado #580 da auditoria de orçamento/fluxo
  // de caixa): as duas visões anteriores só abriam UM dos dois eixos — o
  // Acompanhamento Mensal agregava todas as contas juntas por mês, e o DRE
  // Orçado abria por conta mas somava o ano inteiro. Sem essa matriz não
  // dava pra ver, por exemplo, que uma conta específica estourou o orçado
  // num mês específico.
  const realizadoPorContaMes = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const it of realizado) {
      const mes = new Date(it.data + "T00:00:00").getMonth();
      const arr = m.get(it.conta_id) ?? Array(12).fill(0);
      const sinal =
        it.conta_tipo === "receita"
          ? it.tipo === "credito"
            ? 1
            : -1
          : it.tipo === "debito"
            ? 1
            : -1;
      arr[mes] += sinal * Number(it.valor);
      m.set(it.conta_id, arr);
    }
    return m;
  }, [realizado]);

  const criarMutation = useMutation({
    mutationFn: () =>
      criarOrcamento({ data: { ano: Number(novoAno), observacoes: novoObs || null } }),
    onSuccess: () => {
      toast.success("Orçamento criado");
      setNovoOpen(false);
      setNovoObs("");
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao criar orçamento")),
  });

  const salvarValorMutation = useMutation({
    mutationFn: ({ contaId, mes, valor }: { contaId: string; mes: number; valor: number }) =>
      definirValorOrcamento({ data: { orcamentoId: selecionado!.id, contaId, mes, valor } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orcamento_itens", selecionado?.id] }),
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao salvar valor")),
  });

  const salvarValorCaixaMutation = useMutation({
    mutationFn: ({ contaId, mes, valor }: { contaId: string; mes: number; valor: number }) =>
      definirValorOrcamentoCaixa({ data: { orcamentoId: selecionado!.id, contaId, mes, valor } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orcamento_caixa_itens", selecionado?.id] }),
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao salvar valor")),
  });

  const aprovarMutation = useMutation({
    mutationFn: () => aprovarOrcamento({ data: { orcamentoId: selecionado!.id } }),
    onSuccess: () => {
      toast.success("Orçamento aprovado");
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
      // aprovar_orcamento (0149) tira um snapshot novo em orcamento_versoes a
      // cada aprovação — sem invalidar essa query, o botão "Histórico de
      // versões" (que só aparece com versoes.length > 0) ficava escondido
      // logo após a primeira aprovação, mesmo com o snapshot já no banco
      // (achado #589 da reavaliação do módulo).
      qc.invalidateQueries({ queryKey: ["orcamento_versoes", selecionado?.id] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao aprovar")),
  });

  const reabrirMutation = useMutation({
    mutationFn: (motivo: string) =>
      reabrirOrcamento({ data: { orcamentoId: selecionado!.id, motivo } }),
    onSuccess: () => {
      toast.success("Orçamento reaberto para edição");
      qc.invalidateQueries({ queryKey: ["orcamentos"] });
      qc.invalidateQueries({ queryKey: ["orcamento_versoes", selecionado?.id] });
    },
    onError: (e) => toast.error(mensagemDeErro(e, "Erro ao reabrir")),
  });

  const contasReceita = contas.filter((c) => c.tipo === "receita");
  const contasDespesa = contas.filter((c) => c.tipo === "despesa");
  const editavel = selecionado?.status === "rascunho";
  const [mesDetalhe, setMesDetalhe] = useState<string>("ano");

  return (
    <>
      <PageHeader
        title="Orçamento Anual"
        description="Planejamento orçamentário por conta e mês, com fluxo de aprovação e DRE orçado."
        actions={
          can.canManageFinancas && (
            <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" /> Novo orçamento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo orçamento anual</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="orcamento-novo-ano">Ano</Label>
                    <Input
                      id="orcamento-novo-ano"
                      type="number"
                      value={novoAno}
                      onChange={(e) => setNovoAno(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="orcamento-novo-obs">Observações</Label>
                    <Textarea
                      id="orcamento-novo-obs"
                      value={novoObs}
                      onChange={(e) => setNovoObs(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => criarMutation.mutate()} disabled={criarMutation.isPending}>
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div className="md:col-span-2">
          <Label htmlFor="orcamento-selecionado">Orçamento</Label>
          <Select value={selecionado?.id ?? ""} onValueChange={setSelecionadoId}>
            <SelectTrigger id="orcamento-selecionado">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {orcamentos.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.ano} {o.status === "aprovado" ? "— aprovado" : "— rascunho"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selecionado && (
          <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
            {selecionado.status === "aprovado" ? (
              <Badge className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Aprovado
              </Badge>
            ) : (
              <Badge variant="outline">Rascunho</Badge>
            )}
            {/* Só mostra a versão quando existe ao menos um snapshot aprovado —
                orcamentos.versao começa em 1 desde a criação (migração 0149),
                então um rascunho recém-criado nunca aprovado já mostrava
                "Versão 1", sugerindo um histórico que não existe (achado
                #594 da reavaliação do módulo). */}
            {versoes.length > 0 && <Badge variant="secondary">Versão {selecionado.versao}</Badge>}
            {can.isAdmin && selecionado.status === "rascunho" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => aprovarMutation.mutate()}
                disabled={aprovarMutation.isPending}
              >
                <Lock className="h-3.5 w-3.5 mr-1" /> Aprovar
              </Button>
            )}
            {can.isAdmin && selecionado.status === "aprovado" && (
              <ReabrirOrcamentoDialog
                onConfirm={(motivo) => reabrirMutation.mutate(motivo)}
                pending={reabrirMutation.isPending}
              />
            )}
            {versoes.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setVersaoSelecionadaId(versoes[0]?.id ?? null);
                  setVersoesOpen(true);
                }}
              >
                <History className="h-3.5 w-3.5 mr-1" /> Histórico de versões
              </Button>
            )}
          </div>
        )}
      </Card>

      <Dialog open={versoesOpen} onOpenChange={setVersoesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de versões — {selecionado?.ano}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="orcamento-versao-select">Versão aprovada em</Label>
              <Select value={versaoSelecionadaId ?? ""} onValueChange={setVersaoSelecionadaId}>
                <SelectTrigger id="orcamento-versao-select">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {versoes.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      Versão {v.versao} — {new Date(v.aprovado_em).toLocaleDateString("pt-BR")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {versaoSelecionadaId && (
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell>Receita orçada (competência)</TableCell>
                    <TableCell className="text-right">
                      {brl(totaisVersaoSelecionada.receitaCompetencia)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Despesa orçada (competência)</TableCell>
                    <TableCell className="text-right">
                      {brl(totaisVersaoSelecionada.despesaCompetencia)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Entrada orçada (caixa)</TableCell>
                    <TableCell className="text-right">
                      {brl(totaisVersaoSelecionada.entradaCaixa)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Saída orçada (caixa)</TableCell>
                    <TableCell className="text-right">
                      {brl(totaisVersaoSelecionada.saidaCaixa)}
                    </TableCell>
                  </TableRow>
                  {versaoSelecionada?.motivo_reabertura && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-sm text-muted-foreground">
                        Reaberta em{" "}
                        {versaoSelecionada.reaberto_em &&
                          new Date(versaoSelecionada.reaberto_em).toLocaleDateString("pt-BR")}
                        : {versaoSelecionada.motivo_reabertura}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!selecionado && (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum orçamento cadastrado ainda.
        </Card>
      )}

      {selecionado && (
        <Tabs defaultValue="valores">
          <TabsList>
            <TabsTrigger value="valores">Valores Orçados</TabsTrigger>
            <TabsTrigger value="valores_caixa">Valores Orçados (Caixa)</TabsTrigger>
            <TabsTrigger value="acompanhamento">Acompanhamento Mensal</TabsTrigger>
            <TabsTrigger value="detalhado">Detalhado por Conta</TabsTrigger>
          </TabsList>

          <TabsContent value="valores" className="space-y-4">
            <TabelaValoresOrcados
              contasReceita={contasReceita}
              contasDespesa={contasDespesa}
              valorMap={valorMap}
              editavel={!!editavel && !!can.canManageFinancas}
              onSave={(contaId, mes, valor) => salvarValorMutation.mutate({ contaId, mes, valor })}
            />
          </TabsContent>

          <TabsContent value="valores_caixa" className="space-y-4">
            <p className="text-sm text-muted-foreground mb-2">
              Orçamento em regime de caixa — quanto se planeja efetivamente receber/pagar em cada
              mês, independente de quando a receita/despesa foi reconhecida contabilmente. Usado na
              comparação orçado x realizado do Fluxo de Caixa.
            </p>
            <TabelaValoresOrcados
              contasReceita={contasReceita}
              contasDespesa={contasDespesa}
              valorMap={valorMapCaixa}
              editavel={!!editavel && !!can.canManageFinancas}
              onSave={(contaId, mes, valor) =>
                salvarValorCaixaMutation.mutate({ contaId, mes, valor })
              }
            />
          </TabsContent>

          <TabsContent value="acompanhamento">
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receita Orçada</TableHead>
                    <TableHead className="text-right">Receita Real</TableHead>
                    <TableHead className="text-right">Despesa Orçada</TableHead>
                    <TableHead className="text-right">Despesa Real</TableHead>
                    <TableHead className="text-right">Resultado Orçado</TableHead>
                    <TableHead className="text-right">Resultado Real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MESES.map((m, i) => (
                    <TableRow key={m}>
                      <TableCell>{m}</TableCell>
                      <TableCell className="text-right">{brl(orcadoPorMes.receita[i])}</TableCell>
                      <TableCell className="text-right">
                        {brl(realizadoPorMes.receita[i])}
                      </TableCell>
                      <TableCell className="text-right">{brl(orcadoPorMes.despesa[i])}</TableCell>
                      <TableCell className="text-right">
                        {brl(realizadoPorMes.despesa[i])}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(orcadoPorMes.receita[i] - orcadoPorMes.despesa[i])}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(realizadoPorMes.receita[i] - realizadoPorMes.despesa[i])}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell>Total do ano</TableCell>
                    <TableCell className="text-right">
                      {brl(orcadoPorMes.receita.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(realizadoPorMes.receita.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(orcadoPorMes.despesa.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(realizadoPorMes.despesa.reduce((s, v) => s + v, 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(
                        orcadoPorMes.receita.reduce((s, v) => s + v, 0) -
                          orcadoPorMes.despesa.reduce((s, v) => s + v, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {brl(
                        realizadoPorMes.receita.reduce((s, v) => s + v, 0) -
                          realizadoPorMes.despesa.reduce((s, v) => s + v, 0),
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="detalhado" className="space-y-4">
            <Card className="p-4 grid gap-3 md:grid-cols-4 items-end">
              <div>
                <Label htmlFor="orcamento-detalhe-mes">Período</Label>
                <Select value={mesDetalhe} onValueChange={setMesDetalhe}>
                  <SelectTrigger id="orcamento-detalhe-mes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ano">Ano todo</SelectItem>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {(["receita", "despesa"] as const).map((tipo) => {
              const lista = tipo === "receita" ? contasReceita : contasDespesa;
              const linhas = lista.map((c) => {
                const orcadoMensal = Array.from(
                  { length: 12 },
                  (_, i) => valorMap.get(`${c.id}:${i + 1}`) ?? 0,
                );
                const realizadoMensal = realizadoPorContaMes.get(c.id) ?? Array(12).fill(0);
                const orcado =
                  mesDetalhe === "ano"
                    ? orcadoMensal.reduce((s, v) => s + v, 0)
                    : orcadoMensal[Number(mesDetalhe)];
                const realizadoValor =
                  mesDetalhe === "ano"
                    ? realizadoMensal.reduce((s, v) => s + v, 0)
                    : realizadoMensal[Number(mesDetalhe)];
                return {
                  conta: c,
                  orcado,
                  realizado: realizadoValor,
                  variacao: realizadoValor - orcado,
                };
              });
              const totalOrcado = linhas.reduce((s, l) => s + l.orcado, 0);
              const totalRealizado = linhas.reduce((s, l) => s + l.realizado, 0);
              return (
                <Card key={tipo} className="overflow-x-auto">
                  <div className="p-3 border-b font-medium">
                    {tipo === "receita" ? "Receitas" : "Despesas"}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Conta</TableHead>
                        <TableHead className="text-right">Orçado</TableHead>
                        <TableHead className="text-right">Realizado</TableHead>
                        <TableHead className="text-right">Variação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linhas.map(({ conta, orcado, realizado, variacao }) => (
                        <TableRow key={conta.id}>
                          <TableCell className="font-mono text-xs">
                            {conta.codigo} {conta.nome}
                          </TableCell>
                          <TableCell className="text-right">{brl(orcado)}</TableCell>
                          <TableCell className="text-right">{brl(realizado)}</TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              (tipo === "receita" ? variacao < 0 : variacao > 0)
                                ? "text-destructive"
                                : ""
                            }`}
                          >
                            {brl(variacao)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {linhas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                            Nenhuma conta analítica de {tipo} cadastrada.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    {linhas.length > 0 && (
                      <TableRow className="font-semibold bg-muted/30">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{brl(totalOrcado)}</TableCell>
                        <TableCell className="text-right">{brl(totalRealizado)}</TableCell>
                        <TableCell className="text-right">
                          {brl(totalRealizado - totalOrcado)}
                        </TableCell>
                      </TableRow>
                    )}
                  </Table>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

// Grade conta x mês reaproveitada pelos valores orçados de competência e
// de caixa (achado #581 da auditoria) — mesmo layout, só troca o mapa de
// valores e o callback de salvar.
function TabelaValoresOrcados({
  contasReceita,
  contasDespesa,
  valorMap,
  editavel,
  onSave,
}: {
  contasReceita: ContaOrcamento[];
  contasDespesa: ContaOrcamento[];
  valorMap: Map<string, number>;
  editavel: boolean;
  onSave: (contaId: string, mes: number, valor: number) => void;
}) {
  return (
    <>
      {(["receita", "despesa"] as const).map((tipo) => {
        const lista = tipo === "receita" ? contasReceita : contasDespesa;
        return (
          <Card key={tipo} className="overflow-x-auto">
            <div className="p-3 border-b font-medium">
              {tipo === "receita" ? "Receitas" : "Despesas"}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Conta</TableHead>
                  {MESES.map((m) => (
                    <TableHead key={m} className="text-right w-24">
                      {m}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((c) => {
                  const totalConta = Array.from(
                    { length: 12 },
                    (_, i) => valorMap.get(`${c.id}:${i + 1}`) ?? 0,
                  ).reduce((s, v) => s + v, 0);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="sticky left-0 bg-background font-mono text-xs">
                        {c.codigo} {c.nome}
                      </TableCell>
                      {MESES.map((_, i) => (
                        <ValorCell
                          key={i}
                          valor={valorMap.get(`${c.id}:${i + 1}`) ?? 0}
                          editavel={editavel}
                          onSave={(v) => onSave(c.id, i + 1, v)}
                        />
                      ))}
                      <TableCell className="text-right font-medium">{brl(totalConta)}</TableCell>
                    </TableRow>
                  );
                })}
                {lista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-4 text-muted-foreground">
                      Nenhuma conta analítica de {tipo} cadastrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </>
  );
}

// Mesmo padrão de ReabrirDialog em administracao/fechamento-periodo.tsx —
// motivo obrigatório e visível antes de confirmar (achado #590 da
// reavaliação do orçamento: reabrir um orçamento aprovado é tão sensível
// quanto reabrir um período contábil, e devia exigir o mesmo rastro).
function ReabrirOrcamentoDialog({
  onConfirm,
  pending,
}: {
  onConfirm: (motivo: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Unlock className="h-3.5 w-3.5 mr-1" /> Reabrir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reabrir orçamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Volta o orçamento para rascunho, permitindo editar os valores. Informe o motivo.
          </p>
          <div>
            <Label htmlFor="orcamento-motivo-reabertura">Motivo da reabertura</Label>
            <Textarea
              id="orcamento-motivo-reabertura"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!motivo.trim() || pending}
            onClick={() => {
              onConfirm(motivo);
              setOpen(false);
              setMotivo("");
            }}
          >
            Confirmar reabertura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ValorCell({
  valor,
  editavel,
  onSave,
}: {
  valor: number;
  editavel: boolean;
  onSave: (v: number) => void;
}) {
  const [local, setLocal] = useState(valor > 0 ? String(valor) : "");

  useEffect(() => {
    setLocal(valor > 0 ? String(valor) : "");
  }, [valor]);

  if (!editavel) {
    return <TableCell className="text-right">{valor > 0 ? brl(valor) : "—"}</TableCell>;
  }

  return (
    <TableCell className="p-1">
      <Input
        type="number"
        step="0.01"
        className="text-right h-8 w-24"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const num = Number(local || 0);
          if (num !== valor) onSave(num);
        }}
      />
    </TableCell>
  );
}
