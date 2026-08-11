import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  previewImportacaoPlanosEnsino,
  confirmarImportacaoPlanosEnsino,
  type PlanoEnsinoPreview,
  type ResumoImportacaoPlanos,
} from "@/lib/backend/importacao-planos-ensino";
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
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/ensino/importar-planos-ensino")({
  head: () => ({ meta: [{ title: "Importar Planos de Ensino (PDF) — Gestão Maçônica" }] }),
  component: ImportarPlanosEnsinoPage,
});

function ImportarPlanosEnsinoPage() {
  const [orgId, setOrgId] = useState("generico");
  const [preview, setPreview] = useState<PlanoEnsinoPreview[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resumo, setResumo] = useState<ResumoImportacaoPlanos | null>(null);

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });

  const orgIdEnviado = orgId === "generico" ? null : orgId;

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
      const itensPreview = await previewImportacaoPlanosEnsino({
        data: { orgId: orgIdEnviado, arquivoBase64 },
      });
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
        .filter((p) => !p.bloqueado && !p.jaExiste)
        .map((p) => ({ grau: p.grau, titulo: p.titulo }));
      const resultado = await confirmarImportacaoPlanosEnsino({
        data: { orgId: orgIdEnviado, itens },
      });
      setResumo(resultado);
      setPreview(null);
      toast.success("Importação concluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar importação.");
    } finally {
      setConfirmando(false);
    }
  };

  const importaveis = preview?.filter((p) => !p.bloqueado && !p.jaExiste).length ?? 0;
  const naoImportaveis = (preview?.length ?? 0) - importaveis;

  const ord = useOrdenacao(preview ?? [], {
    grau: (item) => item.grau,
    titulo: (item) => item.titulo,
    status: (item) => (item.bloqueado ? 0 : item.jaExiste ? 1 : 2),
  });

  return (
    <>
      <PageHeader
        title="Importar Planos de Ensino (PDF)"
        description="Extrai os títulos únicos de peça de arquitetura por grau a partir de um cronograma em PDF (ex.: Programa de Ensino e Formação Filosófica) para alimentar o catálogo de Planos de Ensino."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Corpo e arquivo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Corpo maçônico (opcional)</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generico">Genérico (todos os corpos)</SelectItem>
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
              disabled={carregando}
              onChange={(e) => e.target.files?.[0] && carregarArquivo(e.target.files[0])}
            />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground md:col-span-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Reconhece o padrão "Peça de Arq.: sobre &quot;Título&quot;" no texto do cronograma —
            títulos repetidos (mesmo grau) e já existentes no catálogo são marcados e não
            duplicados.
          </p>
        </CardContent>
      </Card>

      {resumo && (
        <Card className="mb-4 border-emerald-300">
          <CardContent className="flex items-center gap-2 pt-6 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            {resumo.criados} plano(s) criado(s), {resumo.ignorados} ignorado(s) (já existente ou
            fora da faixa do corpo).
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              Preview — {importaveis} importável(is), {naoImportaveis} não importável(is)
            </CardTitle>
            <Button onClick={confirmar} disabled={confirmando || importaveis === 0}>
              <Upload className="mr-1.5 h-4 w-4" /> Confirmar importação
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="grau" ord={ord}>
                  Grau
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="titulo" ord={ord}>
                  Título
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="status" ord={ord}>
                  Status
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ord.itensOrdenados.map((item, idx) => (
                <TableRow key={idx} className={item.bloqueado ? "opacity-60" : undefined}>
                  <TableCell>{item.grau}</TableCell>
                  <TableCell className="text-sm">{item.titulo}</TableCell>
                  <TableCell>
                    {item.bloqueado ? (
                      <Badge variant="outline">{item.motivoBloqueio}</Badge>
                    ) : item.jaExiste ? (
                      <Badge variant="outline">Já existe no catálogo</Badge>
                    ) : (
                      <Badge variant="secondary">Novo</Badge>
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
          Selecione o corpo (opcional) e um arquivo PDF para ver o preview.
        </Card>
      )}
    </>
  );
}
