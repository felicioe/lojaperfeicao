import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarLancamentosParaConciliar,
  listarOfxPendentes,
  listarOfxConferencia,
  conciliarOfxLote,
  criarLancamentoDeOfx,
  criarLancamentosDeOfxRateado,
  anularLinhasOfx,
  desfazerConciliacao,
  desfazerLancamentoOfx,
  importarOfx,
  obterResumoConciliacaoOfx,
  type OfxLancamento,
  type OfxConferencia,
  type ResumoConciliacaoOfx,
} from "@/lib/backend/tesouraria-conciliacao";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { PageHeader } from "@/components/app/AppShell";
import { DesfazerConciliacaoDialog } from "@/components/app/DesfazerConciliacaoDialog";
import { TerceiroSelect } from "@/components/app/FornecedorSelect";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleDollarSign,
  Link2,
  Loader2,
  Plus,
  Upload,
  Ban,
} from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate } from "@/lib/format";
import { CATEGORIA_LABEL } from "@/components/app/movimentos-filtros";
import { extrairPossivelNome, normalizarTexto } from "@/lib/conciliacao-match";
import { AlocacaoParcialTable } from "@/components/app/AlocacaoParcial";
import { sugerirAlocacao, somaAlocacao } from "@/lib/alocacao-parcial";

export const Route = createFileRoute("/_authenticated/tesouraria/conciliacao")({
  head: () => ({ meta: [{ title: "Conciliação Bancária — Gestão Maçônica" }] }),
  component: Conciliacao,
});

function Conciliacao() {
  const can = useCan();
  const qc = useQueryClient();
  const podeEditar = can.canManageFinancas;
  const fileRef = useRef<HTMLInputElement>(null);
  const [contaId, setContaId] = useState("");
  const [importando, setImportando] = useState(false);
  const [buscaSistema, setBuscaSistema] = useState("");
  const [buscaSistemaAuto, setBuscaSistemaAuto] = useState(false);
  const [buscaOfx, setBuscaOfx] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [selSistema, setSelSistema] = useState<string[]>([]);
  const [selOfx, setSelOfx] = useState<string[]>([]);
  const [openCriar, setOpenCriar] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [openAnular, setOpenAnular] = useState(false);
  const [alocacaoParcial, setAlocacaoParcial] = useState<Record<string, number>>({});

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });

  const { data: sistema = [] } = useQuery({
    queryKey: ["conciliacao_sistema", contaId],
    enabled: !!contaId,
    queryFn: () => listarLancamentosParaConciliar({ data: { contaId } }),
  });

  const { data: ofx = [] } = useQuery({
    queryKey: ["conciliacao_ofx", contaId],
    enabled: !!contaId,
    queryFn: () => listarOfxPendentes({ data: { contaId } }),
  });

  const { data: resumo } = useQuery({
    queryKey: ["conciliacao_resumo", contaId],
    enabled: !!contaId,
    queryFn: () => obterResumoConciliacaoOfx({ data: { contaId } }),
  });

  const { data: conferencia = [] } = useQuery({
    queryKey: ["conciliacao_conferencia", contaId],
    enabled: !!contaId,
    queryFn: () => listarOfxConferencia({ data: { contaId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conciliacao_sistema"] });
    qc.invalidateQueries({ queryKey: ["conciliacao_ofx"] });
    qc.invalidateQueries({ queryKey: ["conciliacao_resumo"] });
    qc.invalidateQueries({ queryKey: ["conciliacao_conferencia"] });
    setSelSistema([]);
    setSelOfx([]);
  };

  const toggleSistema = (id: string) =>
    setSelSistema((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Sugestão automática por depositante (issue #123): ao marcar a única
  // linha do OFX selecionada, pré-preenche a busca do "Sistema" com um
  // nome provável extraído da descrição — só quando a busca está vazia ou
  // foi ela mesma quem preencheu da última vez (não atropela busca digitada
  // manualmente). Some flag pra saber quando limpar de volta ao desmarcar.
  const toggleOfx = (id: string) =>
    setSelOfx((prev) => {
      const proximo = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (proximo.length === 1 && (buscaSistema === "" || buscaSistemaAuto)) {
        const linha = ofx.find((o) => o.id === proximo[0]);
        const termo = linha ? extrairPossivelNome(linha.descricao ?? "") : "";
        if (termo) {
          setBuscaSistema(termo);
          setBuscaSistemaAuto(true);
        }
      } else if (proximo.length === 0 && buscaSistemaAuto) {
        setBuscaSistema("");
        setBuscaSistemaAuto(false);
      }
      return proximo;
    });

  const importar = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !contaId) return toast.error("Selecione a conta e o arquivo OFX.");
    setImportando(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""));
      const resultado = await importarOfx({
        data: { contaFinanceiraId: contaId, arquivoBase64: base64 },
      });
      if (resultado.erros.length > 0) {
        toast.error(
          `${resultado.erros.length} de ${resultado.total} linha(s) do extrato não puderam ser lidas — ${resultado.erros[0]}${resultado.erros.length > 1 ? ` (e mais ${resultado.erros.length - 1})` : ""}`,
        );
      }
      if (resultado.novos > 0 || resultado.jaImportados > 0) {
        toast.success(
          `${resultado.novos} nova(s) linha(s), ${resultado.jaImportados} já importada(s) anteriormente.`,
        );
      }
      if (fileRef.current) fileRef.current.value = "";
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na importação.");
    } finally {
      setImportando(false);
    }
  };

  const vincular = async () => {
    if (selSistema.length === 0 || selOfx.length === 0) return;
    setVinculando(true);
    try {
      const alocacao = usarParcial
        ? Object.entries(alocacaoParcial)
            .filter(([, v]) => v > 0)
            .map(([lancamentoId, valor]) => ({ lancamentoId, valor }))
        : selecionadosSistema.map((s) => ({
            lancamentoId: s.id,
            valor: Number(s.valor) - Number(s.valor_pago),
          }));
      await conciliarOfxLote({ data: { ofxIds: selOfx, alocacao } });
      toast.success("Baixa registrada e linhas conciliadas.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao vincular.");
    } finally {
      setVinculando(false);
    }
  };

  // Busca aceita vários termos separados por vírgula (OR) — cobre o caso de
  // "mais de um depositante" pedido no #123 (ex.: "joao, maria"). Vazio =
  // sem filtro nenhum, mostra tudo.
  const termosSistema = buscaSistema
    .split(",")
    .map((t) => normalizarTexto(t.trim()))
    .filter(Boolean);
  const sistemaFiltrado = sistema.filter((s) => {
    if (dataInicial && s.data < dataInicial) return false;
    if (dataFinal && s.data > dataFinal) return false;
    if (termosSistema.length === 0) return true;
    const alvo = normalizarTexto(s.descricao);
    return termosSistema.some((t) => alvo.includes(t));
  });
  const hojeIso = new Date().toISOString().slice(0, 10);
  const sistemaOrdenado = [...sistemaFiltrado].sort((a, b) => {
    const aVencida = !!a.data_vencimento && a.data_vencimento < hojeIso;
    const bVencida = !!b.data_vencimento && b.data_vencimento < hojeIso;
    if (aVencida !== bVencida) return aVencida ? -1 : 1;
    return (a.data_vencimento ?? a.data).localeCompare(b.data_vencimento ?? b.data);
  });
  const ofxFiltrado = ofx.filter((o) => {
    if (dataInicial && o.data < dataInicial) return false;
    if (dataFinal && o.data > dataFinal) return false;
    return !buscaOfx || (o.descricao ?? "").toLowerCase().includes(buscaOfx.toLowerCase());
  });
  const ofxSelecionadoUnico =
    selOfx.length === 1 && selSistema.length === 0
      ? ofx.find((o) => o.id === selOfx[0])
      : undefined;

  const selecionadosSistema = sistema.filter((s) => selSistema.includes(s.id));
  const totalSistema = selecionadosSistema.reduce(
    (acc, s) => acc + (s.tipo === "entrada" ? 1 : -1) * (Number(s.valor) - Number(s.valor_pago)),
    0,
  );
  const totalOfx = ofx
    .filter((o) => selOfx.includes(o.id))
    .reduce((acc, o) => acc + Number(o.valor), 0);
  const diferenca = Math.round((totalOfx - totalSistema) * 100) / 100;
  const totaisBatem = selSistema.length > 0 && selOfx.length > 0 && diferenca === 0;
  const linhasOfxSelecionadas = ofx.filter((o) => selOfx.includes(o.id));
  const podeAnularOfx =
    selSistema.length === 0 &&
    linhasOfxSelecionadas.length === 2 &&
    linhasOfxSelecionadas.some((o) => Number(o.valor) > 0) &&
    linhasOfxSelecionadas.some((o) => Number(o.valor) < 0) &&
    Math.round(linhasOfxSelecionadas.reduce((s, o) => s + Number(o.valor), 0) * 100) === 0;

  const anularMutation = useMutation({
    mutationFn: () => anularLinhasOfx({ data: { ofxIds: selOfx } }),
    onSuccess: () => {
      toast.success("Crédito e débito anulados entre si, sem lançamento financeiro.");
      setOpenAnular(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message ?? "Erro ao anular linhas OFX."),
  });

  // Pagamento parcial (issue #131): quando o depósito marcado no OFX é
  // MENOR que a soma das faturas (todas do mesmo tipo, sem mistura de
  // entrada/saída), oferece alocação sugerida/editável em vez de só
  // bloquear por diferença. Excesso (OFX maior que o sistema) continua
  // pedindo pra marcar mais faturas — não tem o que "sobrar" alocado.
  const todosEntrada =
    selecionadosSistema.length > 0 && selecionadosSistema.every((s) => s.tipo === "entrada");
  const usarParcial =
    selSistema.length > 0 &&
    selOfx.length > 0 &&
    todosEntrada &&
    totalOfx > 0 &&
    totalOfx < totalSistema;
  const faturasParaAlocarConciliacao = selecionadosSistema.map((s) => ({
    id: s.id,
    descricao: s.descricao,
    saldo: Number(s.valor) - Number(s.valor_pago),
    dataVencimento: s.data_vencimento,
  }));
  const totalAlocadoParcial = somaAlocacao(alocacaoParcial);

  // Quando o depósito é MAIOR que a soma das faturas marcadas ("OFX
  // maior"), não tem valor sobrando pra alocar — mas o usuário pode
  // querer puxar mais uma fatura em aberto do mesmo filtro pra dentro da
  // seleção, virando o caso oposto (que já é suportado): o depósito passa
  // a cobrir as faturas já marcadas por inteiro e o restante entra como
  // pagamento parcial na fatura adicionada, com o saldo dela ficando em
  // aberto.
  const proximaFaturaParaCobrirExcedente = sistemaOrdenado.find(
    (s) => s.tipo === "entrada" && !selSistema.includes(s.id),
  );

  useEffect(() => {
    if (!usarParcial) {
      setAlocacaoParcial({});
      return;
    }
    setAlocacaoParcial(sugerirAlocacao(faturasParaAlocarConciliacao, totalOfx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usarParcial, totalOfx, selSistema.join(","), selOfx.join(",")]);

  // Evita manter valores selecionados fora da tela quando o período muda.
  useEffect(() => {
    setSelSistema([]);
    setSelOfx([]);
    setAlocacaoParcial({});
  }, [dataInicial, dataFinal]);

  // Se a sugestão automática filtrou pra um único irmão e a soma de todas
  // as faturas dele bater exatamente com a linha do OFX marcada, pré-marca
  // sozinho — usuário só confirma (ver comentário em toggleOfx). Não mexe
  // se o usuário já tiver marcado algo do lado do sistema.
  useEffect(() => {
    if (!buscaSistemaAuto || selOfx.length !== 1 || selSistema.length > 0) return;
    const nomesUnicos = new Set(sistemaOrdenado.map((s) => s.irmao_nome).filter(Boolean));
    if (nomesUnicos.size !== 1 || sistemaOrdenado.length === 0) return;
    const ofxLinha = ofx.find((o) => o.id === selOfx[0]);
    if (!ofxLinha) return;
    const soma = sistemaOrdenado.reduce(
      (acc, s) => acc + (s.tipo === "entrada" ? 1 : -1) * (Number(s.valor) - Number(s.valor_pago)),
      0,
    );
    if (Math.round(soma * 100) === Math.round(Number(ofxLinha.valor) * 100)) {
      setSelSistema(sistemaOrdenado.map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaSistemaAuto, selOfx]);

  return (
    <>
      <PageHeader
        title="Conciliação Bancária"
        description="Importação de extrato OFX e conciliação com os lançamentos do sistema."
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-3 items-end">
        <div>
          <Label htmlFor="conciliacao-conta">Conta bancária</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger id="conciliacao-conta">
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
        {podeEditar && (
          <>
            <div>
              <Label htmlFor="conciliacao-arquivo-ofx">Arquivo OFX</Label>
              <Input id="conciliacao-arquivo-ofx" ref={fileRef} type="file" accept=".ofx,.qfx" />
            </div>
            <div>
              <Button onClick={importar} disabled={importando || !contaId}>
                {importando ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}{" "}
                Importar extrato
              </Button>
            </div>
          </>
        )}
      </Card>

      {contaId && resumo && <PainelFechamento resumo={resumo} />}

      {contaId && (
        <>
          <div className="mb-3 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Período dos lançamentos</p>
              <p className="text-sm text-muted-foreground">
                O período é aplicado aos dois lados da conciliação.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="conciliacao-data-inicial">Data inicial</Label>
                <Input
                  id="conciliacao-data-inicial"
                  type="date"
                  value={dataInicial}
                  max={dataFinal || undefined}
                  onChange={(e) => setDataInicial(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="conciliacao-data-final">Data final</Label>
                <Input
                  id="conciliacao-data-final"
                  type="date"
                  value={dataFinal}
                  min={dataInicial || undefined}
                  onChange={(e) => setDataFinal(e.target.value)}
                />
              </div>
            </div>
            {(dataInicial || dataFinal) && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDataInicial("");
                  setDataFinal("");
                }}
              >
                Limpar período
              </Button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sistema — em aberto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="Buscar por nome do depositante… (separe vários por vírgula, ou deixe vazio)"
                  value={buscaSistema}
                  onChange={(e) => {
                    setBuscaSistema(e.target.value);
                    setBuscaSistemaAuto(false);
                  }}
                />
                {buscaSistemaAuto && (
                  <p className="text-xs text-muted-foreground">
                    Filtro sugerido a partir da linha do OFX marcada — edite ou limpe se precisar.
                  </p>
                )}
                <div className="max-h-96 overflow-y-auto divide-y border rounded-md">
                  {sistemaOrdenado.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">
                      Nenhum lançamento em aberto.
                    </div>
                  )}
                  {sistemaOrdenado.map((s) => {
                    const vencida = !!s.data_vencimento && s.data_vencimento < hojeIso;
                    return (
                      <label
                        key={s.id}
                        className={`flex items-start gap-2 p-2 text-sm hover:bg-muted/50 cursor-pointer ${selSistema.includes(s.id) ? "bg-muted" : ""}`}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={selSistema.includes(s.id)}
                          onCheckedChange={() => toggleSistema(s.id)}
                        />
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <span>{s.descricao}</span>
                            <span className="font-medium">
                              {brl(Number(s.valor) - Number(s.valor_pago))}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            {fmtDate(s.data)} · {s.tipo}
                            {vencida && (
                              <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                                Vencida
                              </Badge>
                            )}
                            {Number(s.valor_pago) > 0 && (
                              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                                Parcial — de {brl(s.valor)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {selSistema.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {selSistema.length} selecionado(s) · Total: {brl(totalSistema)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extrato OFX — não conciliado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  placeholder="Buscar…"
                  value={buscaOfx}
                  onChange={(e) => setBuscaOfx(e.target.value)}
                />
                <div className="max-h-96 overflow-y-auto divide-y border rounded-md">
                  {ofxFiltrado.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">
                      Nenhuma linha pendente. Importe um extrato acima.
                    </div>
                  )}
                  {ofxFiltrado.map((o) => (
                    <label
                      key={o.id}
                      className={`flex items-start gap-2 p-2 text-sm hover:bg-muted/50 cursor-pointer ${selOfx.includes(o.id) ? "bg-muted" : ""}`}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selOfx.includes(o.id)}
                        onCheckedChange={() => toggleOfx(o.id)}
                      />
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span>{o.descricao}</span>
                          <span className="font-medium">{brl(o.valor)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(o.data)} · {o.tipo_ofx}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {selOfx.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {selOfx.length} selecionado(s) · Total: {brl(totalOfx)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {podeEditar && usarParcial && (
        <Card className="mt-4 p-4 space-y-2">
          <div className="flex items-center gap-1 text-sm text-warning-foreground">
            <AlertTriangle className="h-4 w-4" /> O depósito é menor que a soma das faturas
            selecionadas — pagamento parcial. Sugestão abaixo quita as mais antigas primeiro; ajuste
            se precisar.
          </div>
          <AlocacaoParcialTable
            faturas={faturasParaAlocarConciliacao}
            alocacao={alocacaoParcial}
            onChange={(id, valor) => setAlocacaoParcial((a) => ({ ...a, [id]: valor }))}
          />
          <div
            className={`text-sm flex justify-between ${Math.abs(totalAlocadoParcial - totalOfx) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}
          >
            <span>Alocado</span>
            <span>
              {brl(totalAlocadoParcial)} de {brl(totalOfx)}
            </span>
          </div>
        </Card>
      )}

      {podeEditar && (selSistema.length > 0 || selOfx.length > 0) && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm">
            {selSistema.length > 0 && selOfx.length > 0 ? (
              totaisBatem ? (
                <span className="flex items-center gap-1 text-success-foreground">
                  <CheckCircle2 className="h-4 w-4" /> Totais batem — pronto para vincular.
                </span>
              ) : usarParcial ? (
                <span className="text-muted-foreground">
                  Confira a alocação do pagamento parcial acima.
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2 text-destructive">
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Diferença: {brl(Math.abs(diferenca))}{" "}
                    {diferenca > 0 ? "(OFX maior)" : "(Sistema maior)"} — os totais precisam bater
                    para vincular.
                  </span>
                  {diferenca > 0 && proximaFaturaParaCobrirExcedente && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleSistema(proximaFaturaParaCobrirExcedente.id)}
                    >
                      + {proximaFaturaParaCobrirExcedente.descricao} (aplica só o excedente, resto
                      fica em aberto)
                    </Button>
                  )}
                </span>
              )
            ) : selOfx.length > 0 ? (
              <span className="text-muted-foreground">
                Linha(s) do OFX selecionada(s) — marque lançamento(s) do sistema para vincular, ou
                crie um novo lançamento.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Lançamento(s) do sistema selecionado(s).
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {selSistema.length > 0 && selOfx.length > 0 && (
              <Button
                onClick={vincular}
                disabled={
                  vinculando ||
                  (usarParcial
                    ? Math.abs(totalAlocadoParcial - totalOfx) > 0.01 || totalAlocadoParcial <= 0
                    : !totaisBatem)
                }
              >
                {vinculando ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-1" />
                )}
                Vincular
              </Button>
            )}
            {ofxSelecionadoUnico && (
              <Dialog open={openCriar} onOpenChange={setOpenCriar}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-1" /> Criar lançamento
                  </Button>
                </DialogTrigger>
                {ofxSelecionadoUnico && (
                  <CriarLancamentoDialog
                    ofxLinha={ofxSelecionadoUnico}
                    onDone={() => {
                      setOpenCriar(false);
                      invalidate();
                    }}
                  />
                )}
              </Dialog>
            )}
            {podeAnularOfx && (
              <Dialog open={openAnular} onOpenChange={setOpenAnular}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Ban className="mr-1 h-4 w-4" /> Anular entre si
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Anular crédito e débito?</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    As duas linhas de {brl(Math.abs(Number(linhasOfxSelecionadas[0].valor)))} serão
                    conciliadas entre si. Nenhum lançamento financeiro ou contábil será criado, e
                    ambas continuarão nos relatórios com o histórico “Lançamento indevido”.
                  </p>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" disabled={anularMutation.isPending}>
                        Cancelar
                      </Button>
                    </DialogClose>
                    <Button
                      onClick={() => anularMutation.mutate()}
                      disabled={anularMutation.isPending}
                    >
                      {anularMutation.isPending && (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      )}
                      Confirmar anulação
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </Card>
      )}

      {contaId && <ConferenciaOfx itens={conferencia} podeEditar={podeEditar} />}
    </>
  );
}

function ConferenciaOfx({ itens, podeEditar }: { itens: OfxConferencia[]; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"todos" | "pendentes" | "conciliados">("todos");
  const desfazerMutation = useMutation({
    mutationFn: ({ item, motivo }: { item: OfxConferencia; motivo: string }) =>
      item.conciliacao_id
        ? desfazerConciliacao({ data: { conciliacaoId: item.conciliacao_id, motivo } })
        : desfazerLancamentoOfx({ data: { ofxId: item.id, motivo } }),
    onSuccess: () => {
      toast.success("Conciliação desfeita — o OFX e a fatura voltaram a ficar pendentes.");
      qc.invalidateQueries({ queryKey: ["conciliacao_conferencia"] });
      qc.invalidateQueries({ queryKey: ["conciliacao_resumo"] });
      qc.invalidateQueries({ queryKey: ["conciliacao_sistema"] });
      qc.invalidateQueries({ queryKey: ["conciliacao_ofx"] });
    },
    onError: (err: Error) => toast.error(err.message ?? "Erro ao desfazer conciliação."),
  });
  const visiveis = itens.filter((item) =>
    filtro === "todos" ? true : filtro === "conciliados" ? item.conciliado : !item.conciliado,
  );

  return (
    <section className="mb-6" aria-labelledby="conferencia-ofx">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="conferencia-ofx" className="font-semibold">
            Conferência do último OFX
          </h2>
          <p className="text-sm text-muted-foreground">
            Confira o que já baixou e identifique exatamente o que continua diferente.
          </p>
        </div>
        <Select value={filtro} onValueChange={(valor) => setFiltro(valor as typeof filtro)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendentes">Somente pendentes</SelectItem>
            <SelectItem value="conciliados">Somente conciliados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {visiveis.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nenhuma movimentação neste filtro.</p>
        ) : (
          visiveis.map((item) => (
            <div
              key={item.id}
              className="grid gap-2 border-b p-4 last:border-b-0 md:grid-cols-[7rem_1fr_9rem_auto] md:items-center"
            >
              <span className="text-sm tabular-nums text-muted-foreground">
                {fmtDate(item.data)}
              </span>
              <div className="min-w-0">
                <p className="font-medium">{item.descricao || "Movimentação sem descrição"}</p>
                {/* Três estados, três rótulos. Antes eram dois: o texto do
                    lançamento avulso era o fallback de um COALESCE, então
                    aparecia justamente quando NÃO havia lançamento nenhum e
                    dava ares de normalidade pra linha sem lastro (#356). */}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.vinculo === "baixa_fatura"
                    ? `Baixado em: ${item.vinculos}`
                    : item.vinculo === "anulacao_ofx"
                      ? "Lançamento indevido — crédito e débito anulados entre si"
                      : item.vinculo === "lancamento_avulso"
                        ? `Lançamento avulso criado a partir do OFX${item.vinculos ? `: ${item.vinculos}` : ""}`
                        : "Sem fatura ou lançamento vinculado"}
                </p>
              </div>
              <span
                className={`font-semibold tabular-nums md:text-right ${Number(item.valor) >= 0 ? "text-success-foreground" : "text-destructive"}`}
              >
                {brl(item.valor)}
              </span>
              <div className="flex flex-wrap items-center gap-2 md:justify-self-end">
                <Badge variant={item.conciliado ? "default" : "secondary"} className="w-fit">
                  {item.conciliado ? "Conciliado" : "Pendente"}
                </Badge>
                {podeEditar && item.conciliado && (
                  <DesfazerConciliacaoDialog
                    onConfirm={(motivo) => desfazerMutation.mutate({ item, motivo })}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PainelFechamento({ resumo }: { resumo: ResumoConciliacaoOfx }) {
  const cobertura =
    resumo.totalMovimentado > 0
      ? Math.round((resumo.valorConciliado / resumo.totalMovimentado) * 100)
      : 100;
  const fechado = resumo.itensPendentes === 0 && resumo.diferencaBancoSistema === 0;
  const periodo =
    resumo.dataInicial && resumo.dataFinal
      ? `${fmtDate(resumo.dataInicial)} a ${fmtDate(resumo.dataFinal)}`
      : "Nenhum período importado";

  return (
    <section
      className="mb-6 overflow-hidden rounded-xl border bg-card"
      aria-labelledby="fechamento-ofx"
    >
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="fechamento-ofx" className="font-semibold">
            Fechamento do extrato
          </h2>
          <p className="text-sm text-muted-foreground">Último OFX importado · {periodo}</p>
        </div>
        <Badge variant={fechado ? "default" : "secondary"} className="w-fit">
          {fechado ? "Fechado sem diferenças" : `${resumo.itensPendentes} item(ns) pendente(s)`}
        </Badge>
      </div>
      <div className="grid md:grid-cols-[1.35fr_1fr]">
        <div className="border-b p-5 md:border-b-0 md:border-r">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <MetricaResumo
              label="Saldo inicial"
              valor={resumo.saldoInicialBanco}
              indisponivel="Não informado"
            />
            <MetricaResumo label="Entradas" valor={resumo.entradas} icon={ArrowUp} positivo />
            <MetricaResumo label="Saídas" valor={resumo.saidas} icon={ArrowDown} />
            <MetricaResumo
              label="Saldo final do banco"
              valor={resumo.saldoFinalBanco}
              icon={CircleDollarSign}
              indisponivel="Importe novo OFX"
              destaque
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            O saldo final é lido diretamente do arquivo do banco; não é estimado pelo sistema.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Movimentação conciliada</p>
              <p className="text-xl font-semibold tabular-nums">
                {brl(resumo.valorConciliado)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  de {brl(resumo.totalMovimentado)}
                </span>
              </p>
            </div>
            <span className="text-2xl font-semibold tabular-nums">{cobertura}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Percentual da movimentação conciliada"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={cobertura}
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${cobertura}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm">
            <div>
              <p className="text-muted-foreground">Pendente de conciliação</p>
              <p className="font-semibold tabular-nums">{brl(resumo.valorPendente)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Diferença banco × sistema</p>
              <p
                className={`font-semibold tabular-nums ${resumo.diferencaBancoSistema && resumo.diferencaBancoSistema !== 0 ? "text-destructive" : ""}`}
              >
                {resumo.diferencaBancoSistema == null
                  ? "Aguardando saldo OFX"
                  : brl(resumo.diferencaBancoSistema)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm">
            <div>
              <p className="text-muted-foreground">No banco, sem lançamento</p>
              <p className="font-semibold tabular-nums">{brl(resumo.valorPendente)}</p>
              <p className="text-xs text-muted-foreground">{resumo.itensPendentes} item(ns)</p>
            </div>
            <div>
              <p className="text-muted-foreground">No financeiro, sem OFX</p>
              <p className="font-semibold tabular-nums">{brl(resumo.valorFinanceiroSemOfx)}</p>
              <p className="text-xs text-muted-foreground">
                {resumo.itensFinanceirosSemOfx} item(ns)
              </p>
            </div>
          </div>
          <div
            className={`flex items-start gap-2 rounded-lg p-3 text-sm ${fechado ? "bg-success-muted text-success-foreground" : "bg-warning-muted text-warning-foreground"}`}
          >
            {fechado ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {fechado
                ? "Todos os itens foram conciliados e o saldo do sistema confere com o banco."
                : resumo.saldoFinalBanco == null
                  ? "Importe novamente o OFX para capturar o saldo bancário e concluir a conferência."
                  : "A conciliação ainda não pode ser fechada. Resolva os itens pendentes e a diferença indicada."}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricaResumo({
  label,
  valor,
  icon: Icon,
  positivo = false,
  destaque = false,
  indisponivel,
}: {
  label: string;
  valor: number | null;
  icon?: typeof ArrowUp;
  positivo?: boolean;
  destaque?: boolean;
  indisponivel?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{label}</span>
      </div>
      <p
        className={`mt-1 font-semibold tabular-nums ${destaque ? "text-xl" : "text-lg"} ${positivo ? "text-success-foreground" : ""}`}
      >
        {valor == null ? indisponivel : brl(valor)}
      </p>
    </div>
  );
}

type RateioItem = {
  chave: string;
  planoContaId: string;
  categoria: string;
  irmaoId: string;
  terceiroId: string;
  valor: string;
  descricao: string;
};

function novoItemRateio(): RateioItem {
  return {
    chave: Math.random().toString(36).slice(2),
    planoContaId: "",
    categoria: "outros",
    irmaoId: "",
    terceiroId: "none",
    valor: "",
    descricao: "",
  };
}

function CriarLancamentoDialog({
  ofxLinha,
  onDone,
}: {
  ofxLinha: OfxLancamento;
  onDone: () => void;
}) {
  const isEntrada = Number(ofxLinha.valor) >= 0;
  const valorOfxAbs = Math.abs(Number(ofxLinha.valor));
  const [modo, setModo] = useState<"simples" | "rateio">("simples");
  const [categoria, setCategoria] = useState("outros");
  const [planoContaId, setPlanoContaId] = useState("");
  const [irmaoId, setIrmaoId] = useState("");
  const [terceiroId, setTerceiroId] = useState("none");
  const [descricao, setDescricao] = useState(ofxLinha.descricao ?? "");
  const [itensRateio, setItensRateio] = useState<RateioItem[]>(() => [
    novoItemRateio(),
    novoItemRateio(),
  ]);
  const [saving, setSaving] = useState(false);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos_por_tipo", isEntrada],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: isEntrada ? "receita" : "despesa" } }),
  });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
    enabled: isEntrada,
  });

  const atualizarItem = (chave: string, patch: Partial<RateioItem>) => {
    setItensRateio((atual) => atual.map((it) => (it.chave === chave ? { ...it, ...patch } : it)));
  };

  const totalRateio = itensRateio.reduce((s, it) => s + (Number(it.valor) || 0), 0);
  const diferencaRateio = Math.round((valorOfxAbs - totalRateio) * 100) / 100;

  const salvar = async () => {
    if (!planoContaId) return toast.error("Selecione a categoria contábil.");
    setSaving(true);
    try {
      await criarLancamentoDeOfx({
        data: {
          ofxId: ofxLinha.id,
          planoContaId,
          categoria: isEntrada
            ? (categoria as "mensalidade" | "taxa_grau" | "tronco" | "doacao" | "outros")
            : null,
          irmaoId: irmaoId || null,
          terceiroId: terceiroId === "none" ? null : terceiroId,
          descricao: descricao || null,
        },
      });
      toast.success("Lançamento criado e conciliado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setSaving(false);
    }
  };

  const salvarRateio = async () => {
    if (itensRateio.some((it) => !it.planoContaId || !(Number(it.valor) > 0))) {
      return toast.error("Preencha a categoria contábil e o valor de cada item.");
    }
    if (diferencaRateio !== 0) {
      return toast.error("A soma dos itens precisa bater exatamente com o valor do extrato.");
    }
    setSaving(true);
    try {
      await criarLancamentosDeOfxRateado({
        data: {
          ofxId: ofxLinha.id,
          itens: itensRateio.map((it) => ({
            planoContaId: it.planoContaId,
            categoria: isEntrada
              ? (it.categoria as "mensalidade" | "taxa_grau" | "tronco" | "doacao" | "outros")
              : null,
            irmaoId: it.irmaoId || null,
            terceiroId: it.terceiroId === "none" ? null : it.terceiroId,
            valor: Number(it.valor),
            descricao: it.descricao || null,
          })),
        },
      });
      toast.success("Lançamentos criados e conciliados.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className={modo === "rateio" ? "max-w-2xl" : undefined}>
      <DialogHeader>
        <DialogTitle>Criar lançamento a partir do extrato</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {brl(ofxLinha.valor)} — {fmtDate(ofxLinha.data)}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setModo(modo === "simples" ? "rateio" : "simples")}
          >
            {modo === "simples" ? "Ratear em mais de uma conta" : "Voltar pro modo simples"}
          </Button>
        </div>

        {modo === "simples" ? (
          <>
            {isEntrada && (
              <div>
                <Label htmlFor="conciliacao-categoria">Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger id="conciliacao-categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isEntrada && (
              <div>
                <Label htmlFor="conciliacao-irmao">Irmão (opcional)</Label>
                <Select
                  value={irmaoId || "__nenhum__"}
                  onValueChange={(v) => {
                    setIrmaoId(v === "__nenhum__" ? "" : v);
                    if (v !== "__nenhum__") setTerceiroId("none");
                  }}
                >
                  <SelectTrigger id="conciliacao-irmao">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum__">
                      Nenhum (ex.: tronco de solidariedade)
                    </SelectItem>
                    {irmaos.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.nome_civil}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="conciliacao-terceiro">
                {isEntrada ? "Cliente (opcional)" : "Fornecedor (opcional)"}
              </Label>
              <TerceiroSelect
                triggerId="conciliacao-terceiro"
                tipo={isEntrada ? "cliente" : "fornecedor"}
                value={terceiroId}
                onValueChange={(v) => {
                  setTerceiroId(v);
                  if (isEntrada && v !== "none") setIrmaoId("");
                }}
              />
              {isEntrada && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Use irmão ou cliente conforme a origem do recebimento.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="conciliacao-plano-conta">
                Categoria contábil ({isEntrada ? "receita" : "despesa"})
              </Label>
              <Select value={planoContaId} onValueChange={setPlanoContaId}>
                <SelectTrigger id="conciliacao-plano-conta">
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
              <Label htmlFor="conciliacao-descricao">Descrição</Label>
              <Input
                id="conciliacao-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Desdobra o valor da linha em mais de um lançamento — ex.: mensalidade + juros
              recebidos juntos. A soma dos itens precisa fechar com {brl(valorOfxAbs)}.
            </p>
            {itensRateio.map((it, idx) => (
              <div key={it.chave} className="grid gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                  {itensRateio.length > 2 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setItensRateio((atual) => atual.filter((x) => x.chave !== it.chave))
                      }
                    >
                      Remover
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`conciliacao-rateio-plano-${it.chave}`}>
                      Categoria contábil ({isEntrada ? "receita" : "despesa"})
                    </Label>
                    <Select
                      value={it.planoContaId}
                      onValueChange={(v) => atualizarItem(it.chave, { planoContaId: v })}
                    >
                      <SelectTrigger id={`conciliacao-rateio-plano-${it.chave}`}>
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
                    <Label htmlFor={`conciliacao-rateio-valor-${it.chave}`}>Valor</Label>
                    <Input
                      id={`conciliacao-rateio-valor-${it.chave}`}
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={it.valor}
                      onChange={(e) => atualizarItem(it.chave, { valor: e.target.value })}
                    />
                  </div>
                </div>
                {isEntrada && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`conciliacao-rateio-categoria-${it.chave}`}>Categoria</Label>
                      <Select
                        value={it.categoria}
                        onValueChange={(v) => atualizarItem(it.chave, { categoria: v })}
                      >
                        <SelectTrigger id={`conciliacao-rateio-categoria-${it.chave}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                            <SelectItem key={v} value={v}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`conciliacao-rateio-irmao-${it.chave}`}>
                        Irmão (opcional)
                      </Label>
                      <Select
                        value={it.irmaoId || "__nenhum__"}
                        onValueChange={(v) =>
                          atualizarItem(it.chave, {
                            irmaoId: v === "__nenhum__" ? "" : v,
                            ...(v === "__nenhum__" ? {} : { terceiroId: "none" }),
                          })
                        }
                      >
                        <SelectTrigger id={`conciliacao-rateio-irmao-${it.chave}`}>
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__nenhum__">Nenhum</SelectItem>
                          {irmaos.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.nome_civil}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor={`conciliacao-rateio-terceiro-${it.chave}`}>
                    {isEntrada ? "Cliente (opcional)" : "Fornecedor (opcional)"}
                  </Label>
                  <TerceiroSelect
                    triggerId={`conciliacao-rateio-terceiro-${it.chave}`}
                    tipo={isEntrada ? "cliente" : "fornecedor"}
                    value={it.terceiroId}
                    onValueChange={(v) =>
                      atualizarItem(it.chave, {
                        terceiroId: v,
                        ...(isEntrada && v !== "none" ? { irmaoId: "" } : {}),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={`conciliacao-rateio-descricao-${it.chave}`}>
                    Descrição (opcional)
                  </Label>
                  <Input
                    id={`conciliacao-rateio-descricao-${it.chave}`}
                    value={it.descricao}
                    onChange={(e) => atualizarItem(it.chave, { descricao: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setItensRateio((atual) => [...atual, novoItemRateio()])}
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar item
            </Button>
            <div
              className={`text-sm font-medium ${diferencaRateio !== 0 ? "text-destructive" : "text-success-foreground"}`}
            >
              Total: {brl(totalRateio)} de {brl(valorOfxAbs)}
              {diferencaRateio !== 0 &&
                ` — falta ${brl(Math.abs(diferencaRateio))} ${diferencaRateio > 0 ? "alocar" : "sobrando"}`}
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        {modo === "simples" ? (
          <Button onClick={salvar} disabled={saving || !planoContaId}>
            Criar
          </Button>
        ) : (
          <Button onClick={salvarRateio} disabled={saving || diferencaRateio !== 0}>
            Criar {itensRateio.length} lançamentos
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
