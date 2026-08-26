import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarAgendaPublicaAdmin,
  salvarAgendaPublicaSessao,
  type ItemAgendaPublicaAdmin,
} from "@/lib/backend/agenda-publica-admin";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Pencil, X } from "lucide-react";
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

  const { data: itens = [] } = useQuery({
    queryKey: ["agenda_publica_admin"],
    queryFn: () => listarAgendaPublicaAdmin(),
    enabled: can.isSuperAdmin,
  });

  const abrirEdicao = (item: ItemAgendaPublicaAdmin) => {
    setEditandoId(item.id);
    setRascunhoObservacao(item.observacao_publica ?? "");
    setRascunhoOculto(item.oculto_agenda_publica);
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
                      <div className="space-y-3 py-2">
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
