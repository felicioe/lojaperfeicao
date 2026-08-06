import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  previewImportacaoPdfSessoes,
  confirmarImportacaoPdfSessoes,
  type ItemPreviewPdf,
  type ResponsavelPreview,
  type ResumoImportacaoPdf,
} from "@/lib/backend/importacao-pdf-sessoes";
import { listarOrgs } from "@/lib/backend/orgs";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
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
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileUp,
  Upload,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ensino/importar-pdf-sessoes")({
  head: () => ({ meta: [{ title: "Importar Cronograma (PDF) — Gestão Maçônica" }] }),
  component: ImportarPdfSessoesPage,
});

// Estado local: cada item do preview carrega o vínculo (editável) de cada
// responsável — chave irmaoId nulo = "não vincular" (fica só o texto extraído).
type ResponsavelEditavel = ResponsavelPreview & { irmaoId: string | null };
type ItemEditavel = Omit<ItemPreviewPdf, "responsaveis"> & { responsaveis: ResponsavelEditavel[] };

const CATEGORIA_LABEL: Record<ItemPreviewPdf["categoria"], string> = {
  sessao: "Sessão",
  evento: "Evento",
  bloqueado: "Bloqueado",
};

function ImportarPdfSessoesPage() {
  const [orgId, setOrgId] = useState("");
  const [preview, setPreview] = useState<ItemEditavel[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resumo, setResumo] = useState<ResumoImportacaoPdf | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs_all"], queryFn: () => listarOrgs() });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

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
      setPreview(
        itensPreview.map((item) => ({
          ...item,
          responsaveis: item.responsaveis.map((r) => ({ ...r, irmaoId: r.irmaoIdSugerido })),
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar o PDF.");
    } finally {
      setCarregando(false);
    }
  };

  const atualizarResponsavel = (itemIdx: number, respIdx: number, irmaoId: string | null) => {
    setPreview((prev) =>
      prev
        ? prev.map((item, i) =>
            i !== itemIdx
              ? item
              : {
                  ...item,
                  responsaveis: item.responsaveis.map((r, j) =>
                    j !== respIdx ? r : { ...r, irmaoId },
                  ),
                },
          )
        : prev,
    );
  };

  const confirmar = async () => {
    if (!preview) return;
    setConfirmando(true);
    try {
      const itens = preview
        .filter((p) => p.importavel && p.categoria !== "bloqueado")
        .map((p) => ({
          categoria: p.categoria as "sessao" | "evento",
          data: p.data,
          grau: p.grau,
          tipo: p.tipo,
          titulo: p.titulo,
          textoCompleto: p.textoCompleto,
          responsaveis: p.responsaveis.map((r) => ({
            nomeExtraido: r.nomeExtraido,
            apelidoExtraido: r.apelidoExtraido,
            atividade: r.atividade,
            irmaoId: r.irmaoId,
          })),
        }));
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
            Extração de texto de PDF não reconstrói colunas de tabela com garantia. Linhas com "GRAU
            N" dentro da faixa do corpo viram sessão (ou sessão de iniciação, se o texto citar
            "INICIAÇÃO"); avisos da própria pauta (feriado, sessão suspensa, templo cedido,
            confraternização) viram evento em vez de sessão. Responsáveis extraídos ("Ir.: NOME
            (Apelido)") são sugeridos contra o cadastro de irmãos — confira e corrija antes de
            confirmar.
          </p>
        </CardContent>
      </Card>

      {resumo && (
        <Card className="mb-4 border-emerald-300">
          <CardContent className="flex items-center gap-2 pt-6 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            {resumo.sessoesCriadas} sessão(ões) e {resumo.eventosCriados} evento(s) criado(s).
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
                <TableHead></TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Grau</TableHead>
                <TableHead>Resumo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((item, idx) => {
                const podeExpandir = item.responsaveis.length > 0;
                const aberto = expandido === idx;
                return (
                  <Fragment key={idx}>
                    <TableRow className={!item.importavel ? "opacity-60" : undefined}>
                      <TableCell>
                        {podeExpandir && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandido(aberto ? null : idx)}
                          >
                            {aberto ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {fmtDate(item.data)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {CATEGORIA_LABEL[item.categoria]}
                          {item.tipo === "iniciacao" && item.categoria === "sessao"
                            ? " · Iniciação"
                            : ""}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.grau ?? "—"}</TableCell>
                      <TableCell className="max-w-md truncate text-sm" title={item.textoCompleto}>
                        {item.titulo ?? item.resumo}
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
                    {aberto && podeExpandir && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30">
                          <div className="space-y-2 py-2">
                            <div className="text-xs font-medium text-muted-foreground">
                              Responsáveis extraídos — confira o vínculo com o cadastro de irmãos
                            </div>
                            {item.responsaveis.map((r, ridx) => (
                              <div
                                key={ridx}
                                className="grid items-center gap-2 md:grid-cols-[1fr_1fr_auto]"
                              >
                                <div className="text-sm">
                                  <span className="font-medium">{r.nomeExtraido}</span>
                                  {r.apelidoExtraido && (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      ({r.apelidoExtraido})
                                    </span>
                                  )}
                                  {r.atividade && (
                                    <div
                                      className="max-w-md truncate text-xs text-muted-foreground"
                                      title={r.atividade}
                                    >
                                      {r.atividade}
                                    </div>
                                  )}
                                </div>
                                <Select
                                  value={r.irmaoId ?? "nenhum"}
                                  onValueChange={(v) =>
                                    atualizarResponsavel(idx, ridx, v === "nenhum" ? null : v)
                                  }
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Vincular a…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="nenhum">Não vincular</SelectItem>
                                    {irmaos.map((i) => (
                                      <SelectItem key={i.id} value={i.id}>
                                        {i.nome_civil}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {r.irmaoIdSugerido ? (
                                  <Badge variant="outline" className="w-fit text-[10px]">
                                    sugestão automática
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="w-fit text-[10px] text-amber-600"
                                  >
                                    sem sugestão
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
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
