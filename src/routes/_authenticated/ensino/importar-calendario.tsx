import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  previewImportacaoCalendario,
  confirmarImportacaoCalendario,
  type ItemPreview,
  type ResumoImportacao,
} from "@/lib/backend/importacao-calendario";
import { listarOrgs } from "@/lib/backend/orgs";
import { parseArquivoCalendario } from "@/lib/calendar-import";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { CheckCircle2, FileUp, Upload } from "lucide-react";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/ensino/importar-calendario")({
  head: () => ({ meta: [{ title: "Importar Calendário — Gestão Maçônica" }] }),
  component: ImportarCalendarioPage,
});

function ImportarCalendarioPage() {
  const [orgId, setOrgId] = useState("");
  const [preview, setPreview] = useState<ItemPreview[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  const carregarArquivo = async (file: File) => {
    setCarregando(true);
    setResumo(null);
    try {
      const texto = await file.text();
      const itens = parseArquivoCalendario(file.name, texto);
      if (itens.length === 0) {
        toast.error("Nenhum item reconhecido no arquivo.");
        setPreview(null);
        return;
      }
      const itensPreview = await previewImportacaoCalendario({ data: { orgId, itens } });
      setPreview(itensPreview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar arquivo.");
    } finally {
      setCarregando(false);
    }
  };

  const confirmar = async () => {
    if (!preview) return;
    setConfirmando(true);
    try {
      const itens = preview.map(({ titulo, data, hora, descricao }) => ({
        titulo,
        data,
        hora,
        descricao,
      }));
      const resultado = await confirmarImportacaoCalendario({ data: { orgId, itens } });
      setResumo(resultado);
      setPreview(null);
      toast.success("Importação concluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar importação.");
    } finally {
      setConfirmando(false);
    }
  };

  const novos = preview?.filter((p) => !p.duplicado).length ?? 0;
  const duplicados = preview?.filter((p) => p.duplicado).length ?? 0;

  const ord = useOrdenacao(preview ?? [], {
    data: (item) => item.data,
    titulo: (item) => item.titulo,
    tipo: (item) => item.tipo,
    grau: (item) => item.grau,
    status: (item) => (item.duplicado ? 1 : 0),
  });

  return (
    <>
      <PageHeader
        title="Importar Calendário"
        description="Importação em lote de sessões/eventos a partir de arquivo .ics ou .csv, com preview antes de confirmar."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Corpo e arquivo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Corpo maçônico</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome} (graus {o.grau_min}–{o.grau_max})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Selecione um arquivo .ics ou .csv</Label>
            <Input
              type="file"
              accept=".ics,.csv,text/calendar,text/csv"
              disabled={carregando || !orgId}
              onChange={(e) => e.target.files?.[0] && carregarArquivo(e.target.files[0])}
            />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Linhas com "grau N" detectado no título/descrição, dentro da faixa do corpo escolhido,
            viram sessões; as demais viram eventos. CSV aceita colunas titulo, data (AAAA-MM-DD ou
            DD/MM/AAAA), hora e descricao.
          </p>
        </CardContent>
      </Card>

      {resumo && (
        <Card className="mb-4 border-emerald-300">
          <CardContent className="flex items-center gap-2 pt-6 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            {resumo.sessoesCriadas} sessão(ões) e {resumo.eventosCriados} evento(s) criados —{" "}
            {resumo.duplicadosIgnorados} duplicado(s) ignorado(s).
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              Preview — {novos} novo(s), {duplicados} duplicado(s)
            </CardTitle>
            <Button onClick={confirmar} disabled={confirmando || novos === 0}>
              <Upload className="mr-1.5 h-4 w-4" /> Confirmar importação
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="data" ord={ord}>
                  Data
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="titulo" ord={ord}>
                  Título
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tipo" ord={ord}>
                  Tipo
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="grau" ord={ord}>
                  Grau
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="status" ord={ord}>
                  Status
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ord.itensOrdenados.map((item, i) => (
                <TableRow key={i} className={item.duplicado ? "opacity-50" : undefined}>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(item.data)}
                    {item.hora ? ` ${item.hora}` : ""}
                  </TableCell>
                  <TableCell className="font-medium">{item.titulo}</TableCell>
                  <TableCell>{item.tipo === "sessao" ? "Sessão" : "Evento"}</TableCell>
                  <TableCell>{item.grau ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={item.duplicado ? "outline" : "secondary"}>
                      {item.duplicado ? "Duplicado — será ignorado" : "Novo"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!preview && !resumo && !carregando && (
        <Card className="p-10 text-center text-muted-foreground">
          <FileUp className="mx-auto mb-2 h-8 w-8" />
          Selecione o corpo e um arquivo para ver o preview.
        </Card>
      )}
    </>
  );
}
