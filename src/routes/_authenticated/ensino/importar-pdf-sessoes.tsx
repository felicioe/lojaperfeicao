import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  previewImportacaoPdfSessoes,
  confirmarImportacaoPdfSessoes,
  type ItemPreviewPdf,
  type ResumoImportacaoPdf,
} from "@/lib/backend/importacao-pdf-sessoes";
import { listarOrgs } from "@/lib/backend/orgs";
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
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ensino/importar-pdf-sessoes")({
  head: () => ({ meta: [{ title: "Importar Cronograma (PDF) — Gestão Maçônica" }] }),
  component: ImportarPdfSessoesPage,
});

function ImportarPdfSessoesPage() {
  const [orgId, setOrgId] = useState("");
  const [preview, setPreview] = useState<ItemPreviewPdf[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resumo, setResumo] = useState<ResumoImportacaoPdf | null>(null);

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  const carregarArquivo = async (file: File) => {
    setCarregando(true);
    setResumo(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const arquivoBase64 = dataUrl.split(",")[1];
      const itensPreview = await previewImportacaoPdfSessoes({ data: { orgId, arquivoBase64 } });
      setPreview(itensPreview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar o PDF.");
    } finally {
      setCarregando(false);
    }
  };

  const confirmar = async () => {
    if (!preview) return;
    setConfirmando(true);
    try {
      const itens = preview
        .filter((p) => p.importavel)
        .map(({ data, grau, textoCompleto }) => ({ data, grau: grau!, textoCompleto }));
      const resultado = await confirmarImportacaoPdfSessoes({ data: { orgId, itens } });
      setResumo(resultado);
      setPreview(null);
      toast.success("Importação concluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar importação.");
    } finally {
      setConfirmando(false);
    }
  };

  const importaveis = preview?.filter((p) => p.importavel).length ?? 0;
  const bloqueados = preview?.filter((p) => !p.importavel).length ?? 0;

  return (
    <>
      <PageHeader
        title="Importar Cronograma (PDF)"
        description="Extração best-effort do cronograma de sessões a partir de um PDF (ex.: Programa de Ensino e Formação Filosófica) — revise o preview com atenção antes de confirmar."
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
            <Label>Arquivo PDF</Label>
            <Input
              type="file"
              accept=".pdf,application/pdf"
              disabled={carregando || !orgId}
              onChange={(e) => e.target.files?.[0] && carregarArquivo(e.target.files[0])}
            />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground md:col-span-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Extração de texto de PDF não reconstrói colunas de tabela com garantia — linhas com
            "GRAU N" identificado dentro da faixa do corpo viram sessões; avisos da própria pauta
            (feriado, sessão suspensa, templo cedido, confraternização) são detectados e não entram
            como sessão. Confira o preview linha a linha antes de confirmar.
          </p>
        </CardContent>
      </Card>

      {resumo && (
        <Card className="mb-4 border-emerald-300">
          <CardContent className="flex items-center gap-2 pt-6 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            {resumo.sessoesCriadas} sessão(ões) criada(s).
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              Preview — {importaveis} importável(is), {bloqueados} bloqueado(s)
            </CardTitle>
            <Button onClick={confirmar} disabled={confirmando || importaveis === 0}>
              <Upload className="mr-1.5 h-4 w-4" /> Confirmar importação
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Grau</TableHead>
                <TableHead>Resumo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((item, i) => (
                <TableRow key={i} className={!item.importavel ? "opacity-60" : undefined}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {fmtDate(item.data)}
                  </TableCell>
                  <TableCell>{item.grau ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate text-sm" title={item.textoCompleto}>
                    {item.resumo}
                  </TableCell>
                  <TableCell>
                    {item.importavel ? (
                      <Badge variant="secondary">Novo</Badge>
                    ) : item.duplicado ? (
                      <Badge variant="outline">Já existe nesta data</Badge>
                    ) : (
                      <Badge variant="outline">{item.motivoBloqueio}</Badge>
                    )}
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
          Selecione o corpo e um arquivo PDF para ver o preview.
        </Card>
      )}
    </>
  );
}
