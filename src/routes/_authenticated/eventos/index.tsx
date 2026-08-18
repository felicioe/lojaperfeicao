import { Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarEventos,
  salvarEvento,
  excluirEvento,
  listarRsvpsEvento,
  type Evento,
} from "@/lib/backend/eventos";
import { listarOrgs } from "@/lib/backend/orgs";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/app/RichTextEditor";
import { RichTextView } from "@/components/app/RichTextView";
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
import { fmtDate } from "@/lib/format";
import { ChevronDown, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/eventos/")({
  head: () => ({ meta: [{ title: "Eventos — Gestão Maçônica" }] }),
  component: EventosPage,
});

const PUBLICO_LABEL: Record<Evento["publico"], string> = {
  todos: "Todos",
  ativos: "Só ativos",
  org: "Corpo específico",
};

function statusEvento(evento: Evento): "agendado" | "realizado" {
  const momento = new Date(`${evento.data}T${evento.hora ?? "00:00:00"}`);
  return momento.getTime() >= Date.now() ? "agendado" : "realizado";
}

const FORM_VAZIO = {
  id: null as string | null,
  titulo: "",
  data: "",
  hora: "",
  local: "",
  descricao: "",
  publico: "todos" as Evento["publico"],
  orgId: "" as string,
  temAgape: false,
};

function EventosPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data: eventos = [] } = useQuery({
    queryKey: ["eventos_all"],
    queryFn: () => listarEventos(),
  });
  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["eventos_all"] });

  const salvar = async () => {
    if (!form.titulo.trim() || !form.data) return;
    try {
      await salvarEvento({
        data: {
          id: form.id,
          titulo: form.titulo.trim(),
          data: form.data,
          hora: form.hora || null,
          local: form.local || null,
          descricao: form.descricao || null,
          publico: form.publico,
          orgId: form.publico === "org" ? form.orgId || null : null,
          temAgape: form.temAgape,
        },
      });
      toast.success(form.id ? "Evento atualizado." : "Evento criado.");
      setForm(FORM_VAZIO);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    }
  };

  const editar = (e: Evento) =>
    setForm({
      id: e.id,
      titulo: e.titulo,
      data: e.data,
      hora: e.hora ? e.hora.slice(0, 5) : "",
      local: e.local ?? "",
      descricao: e.descricao ?? "",
      publico: e.publico,
      orgId: e.org_id ?? "",
      temAgape: e.tem_agape,
    });

  const excluir = async (id: string) => {
    try {
      await excluirEvento({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const itens = [...eventos].sort((a, b) => b.data.localeCompare(a.data));
  const ord = useOrdenacao(itens, {
    titulo: (e) => e.titulo,
    data: (e) => e.data,
    publico: (e) => e.publico,
    status: (e) => (statusEvento(e) === "agendado" ? 1 : 0),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  return (
    <>
      <PageHeader
        title="Eventos"
        description="Eventos sociais/ágapes com confirmação de presença (RSVP) pelos irmãos."
      />

      {can.canManageIrmaos && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">{form.id ? "Editar evento" : "Novo evento"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label htmlFor="evento-titulo">Título</Label>
              <Input
                id="evento-titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="evento-data">Data</Label>
              <Input
                id="evento-data"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="evento-hora">Hora</Label>
              <Input
                id="evento-hora"
                type="time"
                value={form.hora}
                onChange={(e) => setForm({ ...form, hora: e.target.value })}
              />
            </div>
            <div>
              <Label>Local</Label>
              <Input
                placeholder="Endereço ou local do evento"
                value={form.local}
                onChange={(e) => setForm({ ...form, local: e.target.value })}
              />
            </div>
            <div className="md:col-span-4">
              <Label>Descrição</Label>
              <RichTextEditor
                value={form.descricao}
                onChange={(html) => setForm({ ...form, descricao: html })}
              />
            </div>
            <div>
              <Label htmlFor="evento-publico">Público</Label>
              <Select
                value={form.publico}
                onValueChange={(v) => setForm({ ...form, publico: v as Evento["publico"] })}
              >
                <SelectTrigger id="evento-publico">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PUBLICO_LABEL) as Evento["publico"][]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PUBLICO_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.publico === "org" && (
              <div>
                <Label htmlFor="evento-corpo">Corpo maçônico</Label>
                <Select value={form.orgId} onValueChange={(v) => setForm({ ...form, orgId: v })}>
                  <SelectTrigger id="evento-corpo">
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
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="evento-tem-agape"
                checked={form.temAgape}
                onCheckedChange={(v) => setForm({ ...form, temAgape: !!v })}
              />
              <Label htmlFor="evento-tem-agape" className="font-normal">
                Tem ágape
              </Label>
            </div>

            <div className="flex gap-2 md:col-span-4">
              <Button onClick={salvar} disabled={!form.titulo || !form.data}>
                {form.id ? "Salvar alterações" : "Criar evento"}
              </Button>
              {form.id && (
                <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}>
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHeadOrdenavel campo="titulo" ord={ord}>
                Título
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="data" ord={ord}>
                Data
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="publico" ord={ord}>
                Público
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="status" ord={ord}>
                Status
              </TableHeadOrdenavel>
              {can.canManageIrmaos && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhum evento cadastrado.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((e) => {
              const status = statusEvento(e);
              return (
                <Fragment key={e.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandido(expandido === e.id ? null : e.id)}
                      >
                        {expandido === e.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{e.titulo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(e.data)}
                      {e.hora ? ` ${e.hora.slice(0, 5)}` : ""}
                    </TableCell>
                    <TableCell>
                      {PUBLICO_LABEL[e.publico]}
                      {e.publico === "org" && e.org_nome ? ` — ${e.org_nome}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status === "agendado" ? "secondary" : "outline"}>
                        {status === "agendado" ? "Agendado" : "Realizado"}
                      </Badge>
                    </TableCell>
                    {can.canManageIrmaos && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => editar(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => excluir(e.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                  {expandido === e.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30">
                        {(e.local || e.descricao) && (
                          <div className="mb-3 space-y-1">
                            {e.local && <p className="text-sm font-medium">{e.local}</p>}
                            {e.descricao && <RichTextView html={e.descricao} />}
                          </div>
                        )}
                        <RsvpPanel eventoId={e.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        <TabelaPaginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalItens={totalItens}
          tamanhoPagina={tamanhoPagina}
          setPagina={setPagina}
        />
      </Card>
    </>
  );
}

const PARTICIPA_LABEL: Record<"sim" | "nao" | "talvez", string> = {
  sim: "Vai",
  nao: "Não vai",
  talvez: "Talvez",
};

function RsvpPanel({ eventoId }: { eventoId: string }) {
  const { data: rsvps = [] } = useQuery({
    queryKey: ["evento_rsvps", eventoId],
    queryFn: () => listarRsvpsEvento({ data: { eventoId } }),
  });

  const contagem = { sim: 0, nao: 0, talvez: 0, agape: 0 };
  for (const r of rsvps) {
    contagem[r.participa]++;
    if (r.agape) contagem.agape++;
  }

  const ord = useOrdenacao(rsvps, {
    irmao: (r) => r.irmao_nome,
    resposta: (r) => r.participa,
    agape: (r) => (r.agape ? 1 : 0),
  });

  return (
    <div className="space-y-2 py-2">
      <div className="flex gap-4 text-sm">
        <span>
          Vão: <strong>{contagem.sim}</strong>
        </span>
        <span>
          Talvez: <strong>{contagem.talvez}</strong>
        </span>
        <span>
          Não vão: <strong>{contagem.nao}</strong>
        </span>
        <span>
          Ágape: <strong>{contagem.agape}</strong>
        </span>
      </div>
      {rsvps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="irmao" ord={ord}>
                Irmão
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="resposta" ord={ord}>
                Resposta
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="agape" ord={ord}>
                Ágape
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ord.itensOrdenados.map((r) => (
              <TableRow key={r.irmao_id}>
                <TableCell>{r.irmao_nome}</TableCell>
                <TableCell>{PARTICIPA_LABEL[r.participa]}</TableCell>
                <TableCell>{r.agape ? "Sim" : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
