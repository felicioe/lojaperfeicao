import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listarLancamentosParaConciliar,
  listarOfxPendentes,
  conciliarOfxLote,
  criarLancamentoDeOfx,
  importarOfx,
  type OfxLancamento,
} from "@/lib/backend/tesouraria-conciliacao";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarPlanoContasPorTipo } from "@/lib/backend/plano-contas";
import { PageHeader } from "@/components/app/AppShell";
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
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Link2, Loader2, Plus, Upload } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { brl, fmtDate } from "@/lib/format";
import { CATEGORIA_LABEL } from "@/components/app/RecebimentoAvulso";

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
  const [buscaOfx, setBuscaOfx] = useState("");
  const [selSistema, setSelSistema] = useState<string[]>([]);
  const [selOfx, setSelOfx] = useState<string[]>([]);
  const [openCriar, setOpenCriar] = useState(false);
  const [vinculando, setVinculando] = useState(false);

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conciliacao_sistema"] });
    qc.invalidateQueries({ queryKey: ["conciliacao_ofx"] });
    setSelSistema([]);
    setSelOfx([]);
  };

  const toggleSistema = (id: string) =>
    setSelSistema((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleOfx = (id: string) =>
    setSelOfx((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
      await conciliarOfxLote({ data: { ofxIds: selOfx, lancamentoIds: selSistema } });
      toast.success("Baixa registrada e linhas conciliadas.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao vincular.");
    } finally {
      setVinculando(false);
    }
  };

  const sistemaFiltrado = sistema.filter(
    (s) => !buscaSistema || s.descricao.toLowerCase().includes(buscaSistema.toLowerCase()),
  );
  const ofxFiltrado = ofx.filter(
    (o) => !buscaOfx || (o.descricao ?? "").toLowerCase().includes(buscaOfx.toLowerCase()),
  );
  const ofxSelecionadoUnico =
    selOfx.length === 1 && selSistema.length === 0
      ? ofx.find((o) => o.id === selOfx[0])
      : undefined;

  const totalSistema = sistema
    .filter((s) => selSistema.includes(s.id))
    .reduce((acc, s) => acc + (s.tipo === "entrada" ? Number(s.valor) : -Number(s.valor)), 0);
  const totalOfx = ofx
    .filter((o) => selOfx.includes(o.id))
    .reduce((acc, o) => acc + Number(o.valor), 0);
  const diferenca = Math.round((totalOfx - totalSistema) * 100) / 100;
  const totaisBatem = selSistema.length > 0 && selOfx.length > 0 && diferenca === 0;

  return (
    <>
      <PageHeader
        title="Conciliação Bancária"
        description="Importação de extrato OFX e conciliação com os lançamentos do sistema."
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-3 items-end">
        <div>
          <Label>Conta bancária</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger>
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
              <Label>Arquivo OFX</Label>
              <Input ref={fileRef} type="file" accept=".ofx,.qfx" />
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

      {contaId && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sistema — em aberto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                placeholder="Buscar…"
                value={buscaSistema}
                onChange={(e) => setBuscaSistema(e.target.value)}
              />
              <div className="max-h-96 overflow-y-auto divide-y border rounded-md">
                {sistemaFiltrado.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">
                    Nenhum lançamento em aberto.
                  </div>
                )}
                {sistemaFiltrado.map((s) => (
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
                        <span className="font-medium">{brl(s.valor)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(s.data)} · {s.tipo}
                      </div>
                    </div>
                  </label>
                ))}
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
      )}

      {podeEditar && (selSistema.length > 0 || selOfx.length > 0) && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm">
            {selSistema.length > 0 && selOfx.length > 0 ? (
              totaisBatem ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> Totais batem — pronto para vincular.
                </span>
              ) : (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Diferença: {brl(Math.abs(diferenca))}{" "}
                  {diferenca > 0 ? "(OFX maior)" : "(Sistema maior)"} — os totais precisam bater
                  para vincular.
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
              <Button onClick={vincular} disabled={!totaisBatem || vinculando}>
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
          </div>
        </Card>
      )}
    </>
  );
}

function CriarLancamentoDialog({
  ofxLinha,
  onDone,
}: {
  ofxLinha: OfxLancamento;
  onDone: () => void;
}) {
  const isEntrada = Number(ofxLinha.valor) >= 0;
  const [categoria, setCategoria] = useState("outros");
  const [planoContaId, setPlanoContaId] = useState("");
  const [descricao, setDescricao] = useState(ofxLinha.descricao ?? "");
  const [saving, setSaving] = useState(false);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos_por_tipo", isEntrada],
    queryFn: () => listarPlanoContasPorTipo({ data: { tipo: isEntrada ? "receita" : "despesa" } }),
  });

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

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Criar lançamento a partir do extrato</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm text-muted-foreground">
          {brl(ofxLinha.valor)} — {fmtDate(ofxLinha.data)}
        </div>
        {isEntrada && (
          <div>
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
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
        <div>
          <Label>Categoria contábil ({isEntrada ? "receita" : "despesa"})</Label>
          <Select value={planoContaId} onValueChange={setPlanoContaId}>
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
          <Label>Descrição</Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" disabled={saving}>
            Cancelar
          </Button>
        </DialogClose>
        <Button onClick={salvar} disabled={saving || !planoContaId}>
          Criar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
