import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  listarSessoes,
  criarSessao,
  listarResponsaveisSessoes,
  type Sessao,
} from "@/lib/backend/sessoes";
import { listarEventos, type Evento } from "@/lib/backend/eventos";
import { listarFaturasAbertas, type FaturaAberta } from "@/lib/backend/tesouraria-faturas";
import { listarOrgs, listarOrgsGraus } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { LazyRichTextEditor } from "@/components/app/LazyRichTextEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TIPO_SESSAO_LABEL, fmtDate, toISODate } from "@/lib/format";
import { useCan } from "@/lib/auth-hooks";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, CalendarDays, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/calendario/")({
  head: () => ({
    meta: [
      { title: "Calendário — Gestão Maçônica" },
      { name: "description", content: "Sessões, eventos e vencimentos num só calendário." },
    ],
  }),
  component: CalendarioPage,
});

type TipoItem = "sessao" | "evento" | "vencimento";

type ItemCalendario = {
  id: string;
  tipo: TipoItem;
  data: string; // YYYY-MM-DD
  titulo: string;
  linkTo?: string;
  linkParams?: Record<string, string>;
  sessaoId?: string;
};

const COR_TIPO: Record<TipoItem, string> = {
  sessao: "bg-blue-500",
  evento: "bg-purple-500",
  vencimento: "bg-amber-500",
};

const LABEL_TIPO: Record<TipoItem, string> = {
  sessao: "Sessão",
  evento: "Evento",
  vencimento: "Vencimento",
};

function CalendarioPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [mesAtual, setMesAtual] = useState(() => new Date());
  const [orgId, setOrgId] = useState<string>("");
  const [grau, setGrau] = useState<string>("");
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [openNovaSessao, setOpenNovaSessao] = useState(false);
  const [novaSessao, setNovaSessao] = useState<{
    data: string;
    tipo: "ordinaria" | "magna" | "branca" | "administrativa" | "iniciacao";
    orgId: string;
    grau: string;
    local: string;
    observacoes: string;
  }>({
    data: toISODate(new Date()),
    tipo: "ordinaria",
    orgId: "",
    grau: "",
    local: "",
    observacoes: "",
  });
  const [criandoSessao, setCriandoSessao] = useState(false);

  const { data: sessoes = [] } = useQuery({
    queryKey: ["sessoes"],
    queryFn: () => listarSessoes(),
  });
  const { data: eventos = [] } = useQuery({
    queryKey: ["eventos"],
    queryFn: () => listarEventos(),
  });
  const { data: responsaveisSessoes = [] } = useQuery({
    queryKey: ["responsaveis_sessoes"],
    queryFn: () => listarResponsaveisSessoes(),
  });
  const { data: faturas = [] } = useQuery({
    queryKey: ["faturas_abertas"],
    queryFn: () => listarFaturasAbertas(),
    enabled: can.canManageFinancas,
  });
  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });
  const { data: graus = [] } = useQuery({
    queryKey: ["orgs_graus", orgId],
    queryFn: () => listarOrgsGraus({ data: { orgId } }),
    enabled: !!orgId,
  });
  const { data: grausNovaSessao = [] } = useQuery({
    queryKey: ["orgs_graus", novaSessao.orgId],
    queryFn: () => listarOrgsGraus({ data: { orgId: novaSessao.orgId } }),
    enabled: !!novaSessao.orgId,
  });

  const criarNovaSessao = async () => {
    const grauNum = Number(novaSessao.grau);
    if (!novaSessao.orgId || !grauNum) return toast.error("Selecione o corpo e o grau.");
    setCriandoSessao(true);
    try {
      await criarSessao({
        data: {
          data: novaSessao.data,
          tipo: novaSessao.tipo,
          orgId: novaSessao.orgId,
          grau: grauNum,
          local: novaSessao.local || null,
          observacoes: novaSessao.observacoes || null,
        },
      });
      toast.success("Sessão criada.");
      qc.invalidateQueries({ queryKey: ["sessoes"] });
      setOpenNovaSessao(false);
      setNovaSessao({
        data: toISODate(new Date()),
        tipo: "ordinaria",
        orgId: "",
        grau: "",
        local: "",
        observacoes: "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setCriandoSessao(false);
    }
  };

  // Vencimentos de fatura não têm corpo/grau (são por irmão) — o filtro
  // de corpo/grau só se aplica a sessões (têm os dois) e eventos (só têm
  // corpo). Isso é intencional, não uma lacuna: um vencimento continua
  // aparecendo mesmo com um corpo específico selecionado no filtro.
  const itens = useMemo<ItemCalendario[]>(() => {
    const deSessoes: ItemCalendario[] = sessoes
      .filter((s: Sessao) => (!orgId || s.org_id === orgId) && (!grau || s.grau === Number(grau)))
      .map((s) => ({
        id: `sessao-${s.id}`,
        tipo: "sessao" as const,
        data: s.data,
        titulo: `${TIPO_SESSAO_LABEL[s.tipo] ?? s.tipo} — ${s.org_nome ?? "Sessão"} (grau ${s.grau})`,
        linkTo: "/sessoes/$id",
        linkParams: { id: s.id },
        sessaoId: s.id,
      }));
    const deEventos: ItemCalendario[] = eventos
      .filter((e: Evento) => !orgId || !e.org_id || e.org_id === orgId)
      .map((e) => ({
        id: `evento-${e.id}`,
        tipo: "evento" as const,
        data: e.data,
        titulo: e.titulo,
      }));
    const deFaturas: ItemCalendario[] = faturas.map((f: FaturaAberta) => ({
      id: `vencimento-${f.id}`,
      tipo: "vencimento" as const,
      data: f.data_vencimento,
      titulo: `Vencimento — ${f.irmaos?.nome_civil ?? "Fatura"} (${f.descricao})`,
      linkTo: "/tesouraria/faturas/$id",
      linkParams: { id: f.id },
    }));
    return [...deSessoes, ...deEventos, ...deFaturas];
  }, [sessoes, eventos, faturas, orgId, grau]);

  const dias = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mesAtual), { weekStartsOn: 0 });
    const fim = endOfWeek(endOfMonth(mesAtual), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [mesAtual]);

  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, ItemCalendario[]>();
    for (const item of itens) {
      const lista = mapa.get(item.data) ?? [];
      lista.push(item);
      mapa.set(item.data, lista);
    }
    return mapa;
  }, [itens]);

  const itensDoDiaSelecionado = diaSelecionado ? (itensPorDia.get(diaSelecionado) ?? []) : [];

  const exportarIcs = () => {
    const linhas = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Gestao da Loja//Calendario//PT",
      "CALSCALE:GREGORIAN",
    ];
    const agora = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
    for (const item of itens) {
      const dataIcs = item.data.replace(/-/g, "");
      linhas.push(
        "BEGIN:VEVENT",
        `UID:${item.id}@lojaperfeicao`,
        `DTSTAMP:${agora}`,
        `DTSTART;VALUE=DATE:${dataIcs}`,
        `SUMMARY:${escaparIcs(item.titulo)}`,
        `CATEGORIES:${LABEL_TIPO[item.tipo]}`,
        "END:VEVENT",
      );
    }
    linhas.push("END:VCALENDAR");
    const blob = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario-${format(mesAtual, "yyyy-MM")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Calendário"
        description="Sessões, eventos e vencimentos num só lugar."
        actions={
          <div className="flex gap-2">
            {can.isSecretario && (
              <Dialog open={openNovaSessao} onOpenChange={setOpenNovaSessao}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-1.5 h-4 w-4" /> Nova sessão
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova sessão</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div>
                      <Label htmlFor="nova-sessao-data">Data</Label>
                      <Input
                        id="nova-sessao-data"
                        type="date"
                        value={novaSessao.data}
                        onChange={(e) => setNovaSessao({ ...novaSessao, data: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="nova-sessao-tipo">Tipo</Label>
                      <Select
                        value={novaSessao.tipo}
                        onValueChange={(v) =>
                          setNovaSessao({ ...novaSessao, tipo: v as typeof novaSessao.tipo })
                        }
                      >
                        <SelectTrigger id="nova-sessao-tipo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIPO_SESSAO_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="nova-sessao-corpo">Corpo</Label>
                      <Select
                        value={novaSessao.orgId}
                        onValueChange={(v) => setNovaSessao({ ...novaSessao, orgId: v, grau: "" })}
                      >
                        <SelectTrigger id="nova-sessao-corpo">
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                        <SelectContent>
                          {orgs.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="nova-sessao-grau">Grau</Label>
                      {grausNovaSessao.length > 0 ? (
                        <Select
                          value={novaSessao.grau}
                          onValueChange={(v) => setNovaSessao({ ...novaSessao, grau: v })}
                        >
                          <SelectTrigger id="nova-sessao-grau">
                            <SelectValue placeholder="Grau…" />
                          </SelectTrigger>
                          <SelectContent>
                            {grausNovaSessao.map((g) => (
                              <SelectItem key={g.id} value={String(g.grau)}>
                                {g.grau} — {g.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="nova-sessao-grau"
                          type="number"
                          min={1}
                          disabled={!novaSessao.orgId}
                          value={novaSessao.grau}
                          onChange={(e) => setNovaSessao({ ...novaSessao, grau: e.target.value })}
                        />
                      )}
                    </div>
                    <div>
                      <Label htmlFor="nova-sessao-local">Local</Label>
                      <Input
                        id="nova-sessao-local"
                        placeholder="Endereço ou local da sessão"
                        value={novaSessao.local}
                        onChange={(e) => setNovaSessao({ ...novaSessao, local: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label id="nova-sessao-informacoes-label">Informações</Label>
                      <LazyRichTextEditor
                        ariaLabelledBy="nova-sessao-informacoes-label"
                        value={novaSessao.observacoes}
                        onChange={(html) => setNovaSessao({ ...novaSessao, observacoes: html })}
                      />
                    </div>
                    <Button onClick={criarNovaSessao} disabled={criandoSessao}>
                      Criar sessão
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="outline" onClick={exportarIcs}>
              <Download className="mr-1.5 h-4 w-4" /> Exportar .ics
            </Button>
          </div>
        }
      />

      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setMesAtual((d) => subMonths(d, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10rem] text-center font-medium">{tituloMes(mesAtual)}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximo mês"
            onClick={() => setMesAtual((d) => addMonths(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMesAtual(new Date())}>
            Hoje
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={orgId || "todos"}
            onValueChange={(v) => {
              setOrgId(v === "todos" ? "" : v);
              setGrau("");
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Corpo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os corpos</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {orgId && graus.length > 0 && (
            <Select value={grau || "todos"} onValueChange={(v) => setGrau(v === "todos" ? "" : v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Grau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os graus</SelectItem>
                {graus.map((g) => (
                  <SelectItem key={g.id} value={String(g.grau)}>
                    {g.grau} — {g.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </Card>

      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(Object.keys(LABEL_TIPO) as TipoItem[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${COR_TIPO[t]}`} /> {LABEL_TIPO[t]}
          </span>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const chave = format(dia, "yyyy-MM-dd");
            const itensDia = itensPorDia.get(chave) ?? [];
            const foraDoMes = !isSameMonth(dia, mesAtual);
            return (
              <button
                key={chave}
                type="button"
                onClick={() => itensDia.length > 0 && setDiaSelecionado(chave)}
                className={`min-h-24 border-b border-r p-1.5 text-left align-top last:border-r-0 ${
                  foraDoMes ? "bg-muted/20 text-muted-foreground" : ""
                } ${itensDia.length > 0 ? "cursor-pointer hover:bg-muted/50" : "cursor-default"}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isSameDay(dia, new Date()) && isToday(dia)
                      ? "bg-primary font-semibold text-primary-foreground"
                      : ""
                  }`}
                >
                  {format(dia, "d")}
                </span>
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {itensDia.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className={`h-1.5 w-1.5 rounded-full ${COR_TIPO[item.tipo]}`}
                      title={item.titulo}
                    />
                  ))}
                  {itensDia.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{itensDia.length - 4}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Dialog open={diaSelecionado !== null} onOpenChange={(v) => !v && setDiaSelecionado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {diaSelecionado && fmtDate(diaSelecionado)}
            </DialogTitle>
            <DialogDescription>
              {itensDoDiaSelecionado.length} item(ns) neste dia.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {itensDoDiaSelecionado.map((item) => {
              const responsaveisDoItem = item.sessaoId
                ? responsaveisSessoes.filter((r) => r.sessao_id === item.sessaoId)
                : [];
              return (
                <div key={item.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${COR_TIPO[item.tipo]}`} />
                    <span className="flex-1">{item.titulo}</span>
                    {item.linkTo && item.linkParams && (
                      <Link to={item.linkTo} params={item.linkParams}>
                        <Button variant="ghost" size="sm">
                          Abrir
                        </Button>
                      </Link>
                    )}
                  </div>
                  {responsaveisDoItem.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t pt-2 pl-4">
                      {responsaveisDoItem.map((r, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-medium">
                            {r.irmao_nome ?? r.nome_extraido}
                            {r.apelido_extraido ? ` (${r.apelido_extraido})` : ""}
                          </span>
                          {r.atividade && (
                            <span className="text-muted-foreground"> — {r.atividade}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function escaparIcs(texto: string): string {
  return texto.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

// text-transform: capitalize do CSS deixaria "Agosto De 2026" (maiúscula
// em cada palavra) — aqui só a primeira letra do mês vira maiúscula.
function tituloMes(data: Date): string {
  const texto = format(data, "MMMM 'de' yyyy", { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
