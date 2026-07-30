import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Plus, Upload } from "lucide-react";
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
  const [selSistema, setSelSistema] = useState<string | null>(null);
  const [selOfx, setSelOfx] = useState<string | null>(null);
  const [openCriar, setOpenCriar] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_financeiras").select("id,nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const { data: sistema = [] } = useQuery({
    queryKey: ["conciliacao_sistema", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos").select("id,data,descricao,valor,tipo").eq("conta_id", contaId).eq("pago", false).order("data");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: ofx = [] } = useQuery({
    queryKey: ["conciliacao_ofx", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ofx_lancamentos").select("*").eq("conta_financeira_id", contaId).eq("conciliado", false).order("data");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["conciliacao_sistema"] });
    qc.invalidateQueries({ queryKey: ["conciliacao_ofx"] });
    setSelSistema(null);
    setSelOfx(null);
  };

  const importar = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !contaId) return toast.error("Selecione a conta e o arquivo OFX.");
    setImportando(true);
    const buffer = await file.arrayBuffer();
    const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""));
    const { data, error } = await supabase.functions.invoke("importar-ofx", { body: { conta_financeira_id: contaId, arquivo_base64: base64 } });
    setImportando(false);
    if (error || !data?.ok) return toast.error(data?.error ?? error?.message ?? "Falha na importação.");
    toast.success(`${data.novos} nova(s) linha(s), ${data.ja_importados} já importada(s) anteriormente.`);
    if (fileRef.current) fileRef.current.value = "";
    invalidate();
  };

  const vincular = async () => {
    if (!selSistema || !selOfx) return;
    const { error } = await supabase.rpc("conciliar_ofx_existente", { _ofx_id: selOfx, _lancamento_id: selSistema });
    if (error) return toast.error(error.message);
    toast.success("Linhas conciliadas.");
    invalidate();
  };

  const sistemaFiltrado = sistema.filter((s: any) => !buscaSistema || s.descricao.toLowerCase().includes(buscaSistema.toLowerCase()));
  const ofxFiltrado = ofx.filter((o: any) => !buscaOfx || (o.descricao ?? "").toLowerCase().includes(buscaOfx.toLowerCase()));
  const ofxSelecionado = ofx.find((o: any) => o.id === selOfx);

  return (
    <>
      <PageHeader title="Conciliação Bancária" description="Importação de extrato OFX e conciliação com os lançamentos do sistema." />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-3 items-end">
        <div>
          <Label>Conta bancária</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {podeEditar && (
          <>
            <div><Label>Arquivo OFX</Label><Input ref={fileRef} type="file" accept=".ofx,.qfx" /></div>
            <div>
              <Button onClick={importar} disabled={importando || !contaId}>
                {importando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />} Importar extrato
              </Button>
            </div>
          </>
        )}
      </Card>

      {contaId && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Sistema — em aberto</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Buscar…" value={buscaSistema} onChange={(e) => setBuscaSistema(e.target.value)} />
              <div className="max-h-96 overflow-y-auto divide-y border rounded-md">
                {sistemaFiltrado.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nenhum lançamento em aberto.</div>}
                {sistemaFiltrado.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setSelSistema(selSistema === s.id ? null : s.id)}
                    className={`w-full text-left p-2 text-sm hover:bg-muted/50 ${selSistema === s.id ? "bg-muted" : ""}`}
                  >
                    <div className="flex justify-between"><span>{s.descricao}</span><span className="font-medium">{brl(s.valor)}</span></div>
                    <div className="text-xs text-muted-foreground">{fmtDate(s.data)} · {s.tipo}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Extrato OFX — não conciliado</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Buscar…" value={buscaOfx} onChange={(e) => setBuscaOfx(e.target.value)} />
              <div className="max-h-96 overflow-y-auto divide-y border rounded-md">
                {ofxFiltrado.length === 0 && <div className="p-3 text-sm text-muted-foreground">Nenhuma linha pendente. Importe um extrato acima.</div>}
                {ofxFiltrado.map((o: any) => (
                  <button
                    key={o.id}
                    onClick={() => setSelOfx(selOfx === o.id ? null : o.id)}
                    className={`w-full text-left p-2 text-sm hover:bg-muted/50 ${selOfx === o.id ? "bg-muted" : ""}`}
                  >
                    <div className="flex justify-between"><span>{o.descricao}</span><span className="font-medium">{brl(o.valor)}</span></div>
                    <div className="text-xs text-muted-foreground">{fmtDate(o.data)} · {o.tipo_ofx}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {podeEditar && (selSistema || selOfx) && (
        <Card className="mt-4 p-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selSistema && selOfx ? "Sistema e OFX selecionados — prontos para vincular." : selOfx ? "Linha OFX selecionada — vincule a um lançamento do sistema ou crie um novo." : "Lançamento do sistema selecionado."}
          </div>
          <div className="flex gap-2">
            {selSistema && selOfx && <Button onClick={vincular}><Link2 className="h-4 w-4 mr-1" /> Vincular</Button>}
            {selOfx && !selSistema && (
              <Dialog open={openCriar} onOpenChange={setOpenCriar}>
                <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-1" /> Criar lançamento</Button></DialogTrigger>
                {ofxSelecionado && <CriarLancamentoDialog ofxLinha={ofxSelecionado} onDone={() => { setOpenCriar(false); invalidate(); }} />}
              </Dialog>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

function CriarLancamentoDialog({ ofxLinha, onDone }: { ofxLinha: any; onDone: () => void }) {
  const isEntrada = Number(ofxLinha.valor) >= 0;
  const [categoria, setCategoria] = useState("outros");
  const [planoContaId, setPlanoContaId] = useState("");
  const [descricao, setDescricao] = useState(ofxLinha.descricao ?? "");
  const [saving, setSaving] = useState(false);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos_por_tipo", isEntrada],
    queryFn: async () => {
      const { data, error } = await supabase.from("plano_contas").select("id,codigo,nome").eq("tipo", isEntrada ? "receita" : "despesa").eq("analitica", true).eq("ativo", true).order("codigo");
      if (error) throw error;
      return (data ?? []) as { id: string; codigo: string; nome: string }[];
    },
  });

  const salvar = async () => {
    if (!planoContaId) return toast.error("Selecione a categoria contábil.");
    setSaving(true);
    const { error } = await supabase.rpc("criar_lancamento_de_ofx", {
      _ofx_id: ofxLinha.id,
      _plano_conta_id: planoContaId,
      _categoria: isEntrada ? (categoria as any) : undefined,
      _descricao: descricao || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lançamento criado e conciliado.");
    onDone();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Criar lançamento a partir do extrato</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="text-sm text-muted-foreground">{brl(ofxLinha.valor)} — {fmtDate(ofxLinha.data)}</div>
        {isEntrada && (
          <div>
            <Label>Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CATEGORIA_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Categoria contábil ({isEntrada ? "receita" : "despesa"})</Label>
          <Select value={planoContaId} onValueChange={setPlanoContaId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.codigo} — {p.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={saving || !planoContaId}>Criar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
