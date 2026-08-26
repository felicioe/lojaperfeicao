import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listarAgendaPublicaAdmin,
  salvarAgendaPublicaSessao,
  listarTrabalhosSessao,
  salvarTrabalhosSessao,
  listarIrmaosParaTrabalho,
  type ItemAgendaPublicaAdmin,
} from "@/lib/backend/agenda-publica-admin";
import { PageHeader } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LazyRichTextEditor } from "@/components/app/LazyRichTextEditor";
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
import { Fragment } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";
import { TIPO_SESSAO_LABEL, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/agenda-publica/")({
  head: () => ({ meta: [{ title: "Agenda Pública — Gestão Maçônica" }] }),
  component: AgendaPublicaPage,
});

function AgendaPublicaPage() {
  const can = useCan();
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const { data: itens = [] } = useQuery({
    queryKey: ["agenda_publica_admin"],
    queryFn: () => listarAgendaPublicaAdmin(),
    enabled: can.isSuperAdmin,
  });

  if (!can.isSuperAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas o super administrador da plataforma pode acessar esta função.
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Agenda Pública"
        description="Curadoria das próximas sessões exibidas no site institucional (associacaoadonhiramita.org/agenda)."
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Corpo</TableHead>
              <TableHead>Grau</TableHead>
              <TableHead>No site</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Nenhuma sessão futura cadastrada.
                </TableCell>
              </TableRow>
            )}
            {itens.map((item) => (
              <LinhaAgendaPublica
                key={item.id}
                item={item}
                editando={editandoId === item.id}
                onAbrirEdicao={() => setEditandoId(item.id)}
                onFecharEdicao={() => setEditandoId(null)}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

type RascunhoTrabalho = { id: string | null; atividade: string; irmaoId: string | null };

function LinhaAgendaPublica({
  item,
  editando,
  onAbrirEdicao,
  onFecharEdicao,
}: {
  item: ItemAgendaPublicaAdmin;
  editando: boolean;
  onAbrirEdicao: () => void;
  onFecharEdicao: () => void;
}) {
  const qc = useQueryClient();
  const [rascunhoData, setRascunhoData] = useState(item.data);
  const [rascunhoObservacao, setRascunhoObservacao] = useState(item.observacao_publica ?? "");
  const [rascunhoOculto, setRascunhoOculto] = useState(item.oculto_agenda_publica);
  const [rascunhoTrabalhos, setRascunhoTrabalhos] = useState<RascunhoTrabalho[]>([]);
  const [removidosIds, setRemovidosIds] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_para_trabalho"],
    queryFn: () => listarIrmaosParaTrabalho(),
    enabled: editando,
  });

  const { data: trabalhosCarregados } = useQuery({
    queryKey: ["trabalhos_sessao", item.id],
    queryFn: () => listarTrabalhosSessao({ data: { sessaoId: item.id } }),
    enabled: editando,
  });

  // Reinicia o rascunho toda vez que a linha entra em modo de edição — evita
  // misturar edição não salva de uma abertura anterior com dados atuais.
  useEffect(() => {
    if (!editando) return;
    setRascunhoData(item.data);
    setRascunhoObservacao(item.observacao_publica ?? "");
    setRascunhoOculto(item.oculto_agenda_publica);
    setRemovidosIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  useEffect(() => {
    if (editando && trabalhosCarregados) {
      setRascunhoTrabalhos(
        trabalhosCarregados.map((t) => ({ id: t.id, atividade: t.atividade, irmaoId: t.irmao_id })),
      );
    }
  }, [editando, trabalhosCarregados]);

  const adicionarTrabalho = () =>
    setRascunhoTrabalhos((prev) => [...prev, { id: null, atividade: "", irmaoId: null }]);

  const removerTrabalho = (indice: number) => {
    const alvo = rascunhoTrabalhos[indice];
    if (alvo.id) setRemovidosIds((prev) => [...prev, alvo.id!]);
    setRascunhoTrabalhos((prev) => prev.filter((_, i) => i !== indice));
  };

  const atualizarTrabalho = (indice: number, patch: Partial<RascunhoTrabalho>) =>
    setRascunhoTrabalhos((prev) => prev.map((t, i) => (i === indice ? { ...t, ...patch } : t)));

  const salvar = async () => {
    const semTexto = rascunhoTrabalhos.some((t) => !t.atividade.trim());
    if (semTexto) return toast.error("Toda peça precisa de um texto — remova a que estiver vazia.");
    setSalvando(true);
    try {
      await salvarAgendaPublicaSessao({
        data: {
          id: item.id,
          data: rascunhoData,
          observacaoPublica: rascunhoObservacao || null,
          oculto: rascunhoOculto,
        },
      });
      await salvarTrabalhosSessao({
        data: {
          sessaoId: item.id,
          trabalhos: rascunhoTrabalhos.map((t) => ({
            id: t.id,
            atividade: t.atividade.trim(),
            irmaoId: t.irmaoId,
          })),
          removerIds: removidosIds,
        },
      });
      toast.success("Agenda pública atualizada.");
      onFecharEdicao();
      qc.invalidateQueries({ queryKey: ["agenda_publica_admin"] });
      qc.invalidateQueries({ queryKey: ["trabalhos_sessao", item.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Fragment>
      <TableRow>
        <TableCell className="font-medium">{fmtDate(item.data)}</TableCell>
        <TableCell>{TIPO_SESSAO_LABEL[item.tipo] ?? item.tipo}</TableCell>
        <TableCell>{item.corpo ?? "—"}</TableCell>
        <TableCell>
          {item.grau}
          {item.nome_grau ? ` (${item.nome_grau})` : ""}
        </TableCell>
        <TableCell>
          <Badge variant={item.oculto_agenda_publica ? "secondary" : "default"}>
            {item.oculto_agenda_publica ? "Oculta" : "Visível"}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          {!editando && (
            <Button variant="ghost" size="sm" onClick={onAbrirEdicao}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {editando && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor={`data-sessao-${item.id}`}>Data da sessão</Label>
                <Input
                  id={`data-sessao-${item.id}`}
                  type="date"
                  className="max-w-xs"
                  value={rascunhoData}
                  onChange={(e) => setRascunhoData(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={`oculto-${item.id}`}
                  checked={rascunhoOculto}
                  onCheckedChange={(v) => setRascunhoOculto(v === true)}
                />
                <Label htmlFor={`oculto-${item.id}`} className="font-normal">
                  Ocultar esta sessão da agenda pública do site
                </Label>
              </div>

              <div>
                <Label id={`obs-publica-label-${item.id}`}>
                  Observação exibida no site (opcional)
                </Label>
                <LazyRichTextEditor
                  ariaLabelledBy={`obs-publica-label-${item.id}`}
                  value={rascunhoObservacao}
                  onChange={setRascunhoObservacao}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Programação (peças de arquitetura e responsáveis)</Label>
                  <Button variant="outline" size="sm" onClick={adicionarTrabalho}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar peça
                  </Button>
                </div>
                {rascunhoTrabalhos.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma peça cadastrada.</p>
                )}
                {rascunhoTrabalhos.map((trabalho, indice) => (
                  <div
                    key={trabalho.id ?? `novo-${indice}`}
                    className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-start"
                  >
                    <div className="flex-1">
                      <Label htmlFor={`trabalho-texto-${item.id}-${indice}`} className="text-xs">
                        Texto da peça
                      </Label>
                      <Input
                        id={`trabalho-texto-${item.id}-${indice}`}
                        value={trabalho.atividade}
                        onChange={(e) => atualizarTrabalho(indice, { atividade: e.target.value })}
                        placeholder='Ex.: Peça de Arq. sobre: "..."'
                      />
                    </div>
                    <div className="sm:w-64">
                      <Label htmlFor={`trabalho-irmao-${item.id}-${indice}`} className="text-xs">
                        Responsável
                      </Label>
                      <Select
                        value={trabalho.irmaoId ?? "nenhum"}
                        onValueChange={(v) =>
                          atualizarTrabalho(indice, { irmaoId: v === "nenhum" ? null : v })
                        }
                      >
                        <SelectTrigger id={`trabalho-irmao-${item.id}-${indice}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Sem responsável definido</SelectItem>
                          {irmaos.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.nome_civil}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive sm:mt-5"
                      onClick={() => removerTrabalho(indice)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  No site, o responsável só aparece se o Irmão selecionado tiver nome simbólico
                  cadastrado — sem isso, a peça sai sem autoria identificada.
                </p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
                  Salvar
                </Button>
                <Button variant="outline" size="sm" onClick={onFecharEdicao} disabled={salvando}>
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
      {!editando && item.observacao_publica && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <RichTextView html={item.observacao_publica} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
