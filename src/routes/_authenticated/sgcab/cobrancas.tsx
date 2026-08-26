import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  atualizarFaturaSgcab,
  criarFaturaSgcab,
  listarFaturasSgcab,
  obterValoresFaturaSgcab,
  uploadComprovanteSgcab,
  type SgcabFatura,
} from "@/lib/backend/sgcab";
import { listarOrgs, listarOrgsGraus } from "@/lib/backend/orgs";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brl, fmtDate } from "@/lib/format";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  FileCheck2,
  Plus,
  ScrollText,
} from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/sgcab/cobrancas")({
  head: () => ({ meta: [{ title: "Controle SGCAB — Gestão Maçônica" }] }),
  component: ControleSgcabPage,
});

const ANO_ATUAL = new Date().getFullYear();
const STATUS_LABEL = {
  pendente: "Pendente no SGCAB",
  pago: "Pago ao SGCAB",
  cancelado: "Cancelado",
};

function ControleSgcabPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState("todos");
  const [ano, setAno] = useState(ANO_ATUAL);
  const [status, setStatus] = useState("pendente");
  const [irmaoId, setIrmaoId] = useState("todos");
  const [aberta, setAberta] = useState<string | null>(null);
  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });
  const filtro = {
    orgId: orgId === "todos" ? null : orgId,
    ano: ano || null,
    status: status === "todos" ? null : (status as SgcabFatura["status"]),
    irmaoId: irmaoId === "todos" ? null : irmaoId,
  };
  const {
    data: faturas = [],
    isError,
    refetch,
  } = useQuery({
    queryKey: ["sgcab_faturas", filtro],
    queryFn: () => listarFaturasSgcab({ data: filtro }),
  });
  const { data: totais = [] } = useQuery({
    queryKey: ["sgcab_faturas_totais", filtro.orgId, filtro.ano, filtro.irmaoId],
    queryFn: () => listarFaturasSgcab({ data: { ...filtro, status: null } }),
  });
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["sgcab_faturas"] });
    qc.invalidateQueries({ queryKey: ["sgcab_faturas_totais"] });
  };
  const pendente = totais
    .filter((f) => f.status === "pendente")
    .reduce((s, f) => s + Number(f.total), 0);
  const pago = totais.filter((f) => f.status === "pago").reduce((s, f) => s + Number(f.total), 0);

  return (
    <>
      <PageHeader
        title="Controle de cobranças SGCAB"
        description="Acompanhamento gerencial das cobranças emitidas e recebidas diretamente pelo SGCAB. Não integra o financeiro, a contabilidade ou a inadimplência da Loja."
        actions={
          can.isTesoureiro ? (
            <NovaFaturaDialog orgs={orgs} irmaos={irmaos} onDone={atualizar} />
          ) : undefined
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDollarSign className="h-4 w-4 text-amber-500" /> Aguardando pagamento ao SGCAB
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{brl(pendente)}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileCheck2 className="h-4 w-4 text-emerald-500" /> Confirmado como pago ao SGCAB
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{brl(pago)}</div>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <FiltroSelect
            label="Corpo maçônico"
            value={orgId}
            onChange={setOrgId}
            options={[{ id: "todos", nome: "Todos os corpos" }, ...orgs]}
          />
          <div>
            <Label htmlFor="cobrancas-ano">Ano</Label>
            <Input
              id="cobrancas-ano"
              type="number"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
            />
          </div>
          <FiltroSelect
            label="Situação no SGCAB"
            value={status}
            onChange={setStatus}
            options={[
              { id: "todos", nome: "Todas" },
              { id: "pendente", nome: "Pendente" },
              { id: "pago", nome: "Pago" },
              { id: "cancelado", nome: "Cancelado" },
            ]}
          />
          <FiltroSelect
            label="Irmão"
            value={irmaoId}
            onChange={setIrmaoId}
            options={[
              { id: "todos", nome: "Todos os Irmãos" },
              ...irmaos.map((i) => ({ id: i.id, nome: i.nome_civil })),
            ]}
          />
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-card">
        {isError ? (
          <EmptyState
            icon={ScrollText}
            title="Não foi possível carregar as cobranças"
            description="Falha ao buscar os dados. Tente novamente."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            }
          />
        ) : faturas.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Nenhuma cobrança gerencial SGCAB encontrada."
            description="Crie uma cobrança para reunir iniciação, diploma, ritual e demais itens em um único total."
          />
        ) : (
          faturas.map((fatura) => {
            const expandida = aberta === fatura.id;
            return (
              <div key={fatura.id} className="border-b last:border-b-0">
                <div className="grid items-center gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:px-5">
                  <button
                    className="min-w-0 text-left"
                    onClick={() => setAberta(expandida ? null : fatura.id)}
                    aria-expanded={expandida}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                        <ScrollText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{fatura.titulo}</span>
                          {expandida ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {fatura.irmao_nome} · {fatura.org_nome} · Grau {fatura.grau}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Vencimento</span>
                    <div className="font-medium tabular-nums">
                      {fatura.vencimento ? fmtDate(fatura.vencimento) : "Não informado"}
                    </div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-sm text-muted-foreground">Total SGCAB</div>
                    <div className="text-lg font-semibold tabular-nums">{brl(fatura.total)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <Badge
                      variant={
                        fatura.status === "pago"
                          ? "default"
                          : fatura.status === "cancelado"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {STATUS_LABEL[fatura.status]}
                    </Badge>
                    {can.isTesoureiro && (
                      <AtualizarStatusDialog fatura={fatura} onDone={atualizar} />
                    )}
                  </div>
                </div>
                {expandida && (
                  <div className="border-t bg-muted/25 px-4 py-4 md:px-5">
                    <div className="ml-11 max-w-2xl space-y-2">
                      {fatura.itens.map((item) => (
                        <div key={item.id} className="flex justify-between gap-4 text-sm">
                          <span>{item.descricao}</span>
                          <span className="font-medium tabular-nums">{brl(item.valor)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t pt-2 font-semibold">
                        <span>Total das despesas</span>
                        <span className="tabular-nums">{brl(fatura.total)}</span>
                      </div>
                      {fatura.data_sessao && (
                        <p className="pt-2 text-sm text-muted-foreground">
                          <CalendarDays className="mr-1.5 inline h-4 w-4" /> Sessão marcada para{" "}
                          {new Date(fatura.data_sessao).toLocaleString("pt-BR")}
                        </p>
                      )}
                      {fatura.observacoes && (
                        <p className="text-sm text-muted-foreground">{fatura.observacoes}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function FiltroSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; nome: string }[];
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type ItemForm = { tipo: string; descricao: string; valor: number; ativo: boolean };

function NovaFaturaDialog({
  orgs,
  irmaos,
  onDone,
}: {
  orgs: { id: string; nome: string }[];
  irmaos: { id: string; nome_civil: string }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [irmaoId, setIrmaoId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [ano, setAno] = useState(ANO_ATUAL);
  const [grau, setGrau] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [dataSessao, setDataSessao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [salvando, setSalvando] = useState(false);
  const { data: graus = [] } = useQuery({
    queryKey: ["orgs_graus", orgId],
    queryFn: () => listarOrgsGraus({ data: { orgId } }),
    enabled: !!orgId,
  });
  const { data: valores } = useQuery({
    queryKey: ["sgcab_valores_fatura", orgId, ano, grau],
    queryFn: () => obterValoresFaturaSgcab({ data: { orgId, ano, grau: Number(grau) } }),
    enabled: !!orgId && !!grau,
  });
  useEffect(() => {
    if (!valores) return;
    setItens([
      {
        tipo: "iniciacao",
        descricao: "Iniciação",
        valor: valores.iniciacao,
        ativo: valores.iniciacao > 0,
      },
      { tipo: "diploma", descricao: "Diploma", valor: valores.diploma, ativo: valores.diploma > 0 },
      { tipo: "ritual", descricao: "Ritual", valor: valores.ritual, ativo: valores.ritual > 0 },
      { tipo: "boton", descricao: "Botton", valor: valores.boton, ativo: valores.boton > 0 },
    ]);
  }, [valores]);
  const irmao = irmaos.find((i) => i.id === irmaoId);
  const total = useMemo(
    () => itens.filter((i) => i.ativo).reduce((s, i) => s + Number(i.valor), 0),
    [itens],
  );
  const salvar = async () => {
    if (!irmaoId || !orgId || !grau || itens.every((i) => !i.ativo))
      return toast.error("Informe o Irmão, o corpo, o grau e ao menos um item.");
    setSalvando(true);
    try {
      await criarFaturaSgcab({
        data: {
          irmaoId,
          orgId,
          ano,
          grau: Number(grau),
          titulo: `Evolução do Ir. ${irmao?.nome_civil ?? ""} para o grau ${grau}`,
          dataSessao: dataSessao ? dataSessao.replace("T", " ") + ":00" : null,
          vencimento: vencimento || null,
          observacoes: observacoes || null,
          itens: itens
            .filter((i) => i.ativo)
            .map(({ tipo, descricao, valor }) => ({ tipo, descricao, valor: Number(valor) })),
        },
      });
      toast.success("Cobrança gerencial SGCAB criada.");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a cobrança.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" /> Nova cobrança SGCAB
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova cobrança gerencial SGCAB</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Este registro apenas reproduz a cobrança do SGCAB para acompanhamento. Nenhum valor entra
          no financeiro da Loja.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FiltroSelect
            label="Irmão"
            value={irmaoId}
            onChange={setIrmaoId}
            options={irmaos.map((i) => ({ id: i.id, nome: i.nome_civil }))}
          />
          <FiltroSelect
            label="Corpo maçônico"
            value={orgId}
            onChange={(v) => {
              setOrgId(v);
              setGrau("");
            }}
            options={orgs}
          />
          <div>
            <Label htmlFor="sgcab-nova-ano">Ano</Label>
            <Input
              id="sgcab-nova-ano"
              type="number"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
            />
          </div>
          <FiltroSelect
            label="Grau da evolução"
            value={grau}
            onChange={setGrau}
            options={graus.map((g) => ({ id: String(g.grau), nome: `${g.grau} — ${g.nome}` }))}
          />
          <div>
            <Label htmlFor="sgcab-nova-vencimento">Vencimento no SGCAB</Label>
            <Input
              id="sgcab-nova-vencimento"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sgcab-nova-data-sessao">Data e hora da sessão</Label>
            <Input
              id="sgcab-nova-data-sessao"
              type="datetime-local"
              value={dataSessao}
              onChange={(e) => setDataSessao(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label id="sgcab-nova-composicao-label">Composição da cobrança</Label>
          {itens.map((item, index) => (
            <div
              key={item.tipo}
              role="group"
              aria-labelledby="sgcab-nova-composicao-label"
              className="grid grid-cols-[auto_1fr_130px] items-center gap-3 rounded-lg border px-3 py-2"
            >
              <input
                type="checkbox"
                checked={item.ativo}
                onChange={(e) =>
                  setItens(
                    itens.map((i, n) => (n === index ? { ...i, ativo: e.target.checked } : i)),
                  )
                }
                className="h-4 w-4 accent-primary"
              />
              <Input
                aria-label={`Descrição do item ${index + 1}`}
                value={item.descricao}
                onChange={(e) =>
                  setItens(
                    itens.map((i, n) => (n === index ? { ...i, descricao: e.target.value } : i)),
                  )
                }
              />
              <Input
                aria-label={`Valor do item ${index + 1}`}
                type="number"
                step="0.01"
                value={item.valor}
                onChange={(e) =>
                  setItens(
                    itens.map((i, n) =>
                      n === index ? { ...i, valor: Number(e.target.value) } : i,
                    ),
                  )
                }
              />
            </div>
          ))}
          <div className="flex justify-between border-t pt-3 text-lg font-semibold">
            <span>Total das despesas</span>
            <span className="tabular-nums">{brl(total)}</span>
          </div>
        </div>
        <div>
          <Label htmlFor="sgcab-nova-observacoes">Observações</Label>
          <Textarea
            id="sgcab-nova-observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Informações complementares da solicitação ao SGCAB"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Criar controle SGCAB"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AtualizarStatusDialog({ fatura, onDone }: { fatura: SgcabFatura; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SgcabFatura["status"]>(fatura.status);
  const [data, setData] = useState(
    fatura.data_pagamento?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [observacoes, setObservacoes] = useState(fatura.observacoes ?? "");
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(fatura.comprovante_url);
  const salvar = async () => {
    try {
      await atualizarFaturaSgcab({
        data: {
          id: fatura.id,
          status,
          dataPagamento: status === "pago" ? data : null,
          comprovanteUrl,
          observacoes: observacoes || null,
        },
      });
      toast.success("Situação no SGCAB atualizada.");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar.");
    }
  };
  const anexar = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const r = await uploadComprovanteSgcab({
      data: { cobrancaId: fatura.id, dataUrl },
    });
    setComprovanteUrl(r.url);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CheckCircle2 className="mr-1.5 h-4 w-4" /> Atualizar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Situação da cobrança no SGCAB</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FiltroSelect
            label="Situação"
            value={status}
            onChange={(v) => setStatus(v as SgcabFatura["status"])}
            options={[
              { id: "pendente", nome: "Pendente no SGCAB" },
              { id: "pago", nome: "Pago ao SGCAB" },
              { id: "cancelado", nome: "Cancelado" },
            ]}
          />
          {status === "pago" && (
            <>
              <div>
                <Label htmlFor="cobrancas-data-pagamento">Data do pagamento ao SGCAB</Label>
                <Input
                  id="cobrancas-data-pagamento"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cobrancas-comprovante">Comprovante do SGCAB</Label>
                <Input
                  id="cobrancas-comprovante"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => e.target.files?.[0] && anexar(e.target.files[0])}
                />
              </div>
            </>
          )}
          <div>
            <Label htmlFor="cobrancas-observacoes">Observações</Label>
            <Textarea
              id="cobrancas-observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button onClick={salvar}>Salvar situação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
