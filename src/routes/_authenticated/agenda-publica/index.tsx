import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  listarAgendaPublicaAdmin,
  salvarAgendaPublicaSessao,
  listarTrabalhosSessaoAdmin,
  salvarTrabalhoSessao,
  excluirTrabalhoSessao,
  type ItemAgendaPublicaAdmin,
  type TrabalhoSessaoAdmin,
} from "@/lib/backend/agenda-publica-admin";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LazyRichTextEditor } from "@/components/app/LazyRichTextEditor";
import { RichTextView } from "@/components/app/RichTextView";
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
  const qc = useQueryClient();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunhoObservacao, setRascunhoObservacao] = useState("");
  const [rascunhoOculto, setRascunhoOculto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const painelEdicaoRef = useRef<HTMLDivElement>(null);

  const { data: itens = [] } = useQuery({
    queryKey: ["agenda_publica_admin"],
    queryFn: () => listarAgendaPublicaAdmin(),
    enabled: can.isSuperAdmin,
  });

  const abrirEdicao = (item: ItemAgendaPublicaAdmin) => {
    setEditandoId(item.id);
    setRascunhoObservacao(item.observacao_publica ?? "");
    setRascunhoOculto(item.oculto_agenda_publica);
    // Sem isso, editar uma sessão perto do fim da lista atualiza o painel
    // fora da área visível e passa a impressão de que o clique não fez nada
    // (achado do próprio usuário testando notícias e agenda em produção).
    requestAnimationFrame(() => {
      painelEdicaoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const salvar = async (id: string) => {
    setSalvando(true);
    try {
      await salvarAgendaPublicaSessao({
        data: { id, observacaoPublica: rascunhoObservacao || null, oculto: rascunhoOculto },
      });
      toast.success("Agenda pública atualizada.");
      setEditandoId(null);
      qc.invalidateQueries({ queryKey: ["agenda_publica_admin"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

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
              <Fragment key={item.id}>
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
                    {editandoId !== item.id && (
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {editandoId === item.id && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30">
                      <div ref={painelEdicaoRef} className="space-y-4 py-2">
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
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => salvar(item.id)} disabled={salvando}>
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditandoId(null)}
                            disabled={salvando}
                          >
                            <X className="mr-1 h-4 w-4" /> Cancelar
                          </Button>
                        </div>

                        <TrabalhosDaSessao sessaoId={item.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {editandoId !== item.id && item.observacao_publica && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30">
                      <RichTextView html={item.observacao_publica} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

const TRABALHO_VAZIO = { nomeExtraido: "", apelidoExtraido: "", atividade: "" };

function TrabalhosDaSessao({ sessaoId }: { sessaoId: string }) {
  const qc = useQueryClient();
  const queryKey = ["agenda_publica_trabalhos", sessaoId];
  const { data: trabalhos = [] } = useQuery({
    queryKey,
    queryFn: () => listarTrabalhosSessaoAdmin({ data: { sessaoId } }),
  });

  const [editandoTrabalhoId, setEditandoTrabalhoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState(TRABALHO_VAZIO);
  const [adicionando, setAdicionando] = useState(false);
  const [salvandoTrabalho, setSalvandoTrabalho] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const editarTrabalho = (t: TrabalhoSessaoAdmin) => {
    setEditandoTrabalhoId(t.id);
    setAdicionando(false);
    setRascunho({
      nomeExtraido: t.nome_extraido,
      apelidoExtraido: t.apelido_extraido ?? "",
      atividade: t.atividade ?? "",
    });
  };

  const abrirNovo = () => {
    setAdicionando(true);
    setEditandoTrabalhoId(null);
    setRascunho(TRABALHO_VAZIO);
  };

  const cancelar = () => {
    setEditandoTrabalhoId(null);
    setAdicionando(false);
    setRascunho(TRABALHO_VAZIO);
  };

  const salvarTrabalho = async () => {
    if (!rascunho.nomeExtraido.trim()) {
      toast.error("Informe ao menos o nome do apresentador.");
      return;
    }
    setSalvandoTrabalho(true);
    try {
      await salvarTrabalhoSessao({
        data: {
          id: editandoTrabalhoId,
          sessaoId,
          nomeExtraido: rascunho.nomeExtraido,
          apelidoExtraido: rascunho.apelidoExtraido.trim() || null,
          atividade: rascunho.atividade.trim() || null,
        },
      });
      toast.success(editandoTrabalhoId ? "Trabalho atualizado." : "Trabalho adicionado.");
      cancelar();
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvandoTrabalho(false);
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirTrabalhoSessao({ data: { id } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <Label className="text-sm font-medium">Trabalhos e apresentadores desta sessão</Label>
      {trabalhos.length === 0 && !adicionando && (
        <p className="text-sm text-muted-foreground">Nenhum trabalho cadastrado.</p>
      )}
      <div className="space-y-2">
        {trabalhos.map((t) => (
          <div key={t.id}>
            {editandoTrabalhoId === t.id ? (
              <FormularioTrabalho
                rascunho={rascunho}
                setRascunho={setRascunho}
                onSalvar={salvarTrabalho}
                onCancelar={cancelar}
                salvando={salvandoTrabalho}
              />
            ) : (
              <div className="flex items-start justify-between gap-2 rounded-md border bg-background p-2 text-sm">
                <div>
                  <p>
                    {t.atividade || <span className="text-muted-foreground">(sem título)</span>}
                  </p>
                  <p className="text-muted-foreground">
                    Apresentação: {t.apelido_extraido || t.nome_extraido}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => editarTrabalho(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => excluir(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {adicionando ? (
        <FormularioTrabalho
          rascunho={rascunho}
          setRascunho={setRascunho}
          onSalvar={salvarTrabalho}
          onCancelar={cancelar}
          salvando={salvandoTrabalho}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={abrirNovo}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar trabalho
        </Button>
      )}
    </div>
  );
}

function FormularioTrabalho({
  rascunho,
  setRascunho,
  onSalvar,
  onCancelar,
  salvando,
}: {
  rascunho: typeof TRABALHO_VAZIO;
  setRascunho: (v: typeof TRABALHO_VAZIO) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  salvando: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div>
        <Label htmlFor="trabalho-atividade">Título do trabalho</Label>
        <Textarea
          id="trabalho-atividade"
          rows={2}
          value={rascunho.atividade}
          onChange={(e) => setRascunho({ ...rascunho, atividade: e.target.value })}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="trabalho-apelido">Nome simbólico exibido no site</Label>
          <Input
            id="trabalho-apelido"
            value={rascunho.apelidoExtraido}
            onChange={(e) => setRascunho({ ...rascunho, apelidoExtraido: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="trabalho-nome">Nome completo (interno, não aparece no site)</Label>
          <Input
            id="trabalho-nome"
            value={rascunho.nomeExtraido}
            onChange={(e) => setRascunho({ ...rascunho, nomeExtraido: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSalvar} disabled={salvando}>
          Salvar
        </Button>
        <Button size="sm" variant="outline" onClick={onCancelar} disabled={salvando}>
          <X className="mr-1 h-4 w-4" /> Cancelar
        </Button>
      </div>
    </div>
  );
}
