import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listarDocumentos,
  obterDocumento,
  criarDocumento,
  assinarDocumento,
  excluirDocumento,
  uploadArquivoDocumento,
  type Documento,
} from "@/lib/backend/documentos";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { Scale, Plus, Trash2, CheckCircle2, Paperclip, Eye, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documentos/")({
  head: () => ({
    meta: [
      { title: "Legislação — Gestão Maçônica" },
      { name: "description", content: "Biblioteca de documentos legais e normativos da Loja." },
    ],
  }),
  component: DocumentosPage,
});

const fmtDataHora = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));

function DocumentosPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [novaChave, setNovaChave] = useState(0);
  const [detalheDe, setDetalheDe] = useState<Documento | null>(null);
  const [q, setQ] = useState("");

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["documentos"],
    queryFn: () => listarDocumentos(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["documentos"] });

  const filtrados = useMemo(() => {
    const busca = q.trim().toLocaleLowerCase("pt-BR");
    if (!busca) return documentos;
    return documentos.filter(
      (documento) =>
        documento.titulo.toLocaleLowerCase("pt-BR").includes(busca) ||
        documento.criador_nome?.toLocaleLowerCase("pt-BR").includes(busca) ||
        documento.arquivo_nome_original?.toLocaleLowerCase("pt-BR").includes(busca),
    );
  }, [documentos, q]);

  const ord = useOrdenacao(filtrados, {
    titulo: (documento) => documento.titulo,
    responsavel: (documento) => documento.criador_nome,
    assinaturas: (documento) => documento.total_assinaturas,
    cadastrado: (documento) => documento.criado_em,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  const excluir = async (id: string) => {
    try {
      await excluirDocumento({ data: { id } });
      toast.success("Documento excluído.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  return (
    <>
      <PageHeader
        title="Legislação"
        description="Biblioteca de leis, regulamentos, estatutos e demais documentos normativos da Loja."
        actions={
          can.canManageIrmaos && (
            <Dialog
              open={novaAberta}
              onOpenChange={(v) => {
                setNovaAberta(v);
                if (v) setNovaChave((c) => c + 1);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" /> Adicionar documento
                </Button>
              </DialogTrigger>
              <NovoDocumentoDialog
                key={novaChave}
                onCriado={() => {
                  setNovaAberta(false);
                  invalidate();
                }}
              />
            </Dialog>
          )
        }
      />
      <Card className="mb-4 p-4">
        <Input
          type="search"
          aria-label="Buscar na legislação"
          placeholder="Buscar por título, responsável ou arquivo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
      </Card>

      <Card>
        {!isLoading && filtrados.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={q ? "Nenhum documento encontrado" : "Nenhum documento cadastrado ainda"}
            description={q ? "Revise os termos da busca e tente novamente." : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="titulo" ord={ord}>
                  Documento
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="responsavel" ord={ord} className="hidden sm:table-cell">
                  Responsável
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="assinaturas" ord={ord} className="hidden md:table-cell">
                  Assinaturas
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="cadastrado" ord={ord} className="hidden lg:table-cell">
                  Cadastrado em
                </TableHeadOrdenavel>
                <TableHead className="w-36">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {itensPagina.map((documento) => (
                <TableRow key={documento.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate">{documento.titulo}</p>
                        <p className="truncate text-xs font-normal text-muted-foreground sm:hidden">
                          {documento.criador_nome ?? "Responsável não informado"}
                        </p>
                        {documento.ja_assinei && (
                          <Badge variant="outline" className="mt-1 gap-1 sm:hidden">
                            <CheckCircle2 className="h-3 w-3" /> Assinado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {documento.criador_nome ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <span>{documento.total_assinaturas}</span>
                      {documento.ja_assinei && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Assinado
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {fmtDataHora(documento.criado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Ver detalhes e assinaturas"
                        aria-label={`Ver detalhes de ${documento.titulo}`}
                        onClick={() => setDetalheDe(documento)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {documento.arquivo_url && (
                        <Button variant="ghost" size="sm" asChild title="Baixar arquivo">
                          <a
                            href={documento.arquivo_url}
                            download={documento.arquivo_nome_original ?? undefined}
                            aria-label={`Baixar ${documento.arquivo_nome_original ?? documento.titulo}`}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {can.isAdmin && documento.total_assinaturas === 0 && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Excluir ${documento.titulo}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{documento.titulo}" será removido permanentemente. Só é possível
                                excluir documentos que ainda não têm assinaturas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir(documento.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <TabelaPaginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalItens={totalItens}
          tamanhoPagina={tamanhoPagina}
          setPagina={setPagina}
        />
      </Card>

      <Dialog open={detalheDe !== null} onOpenChange={(v) => !v && setDetalheDe(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {detalheDe && (
            <DetalheDocumento
              id={detalheDe.id}
              onAssinado={() => {
                invalidate();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetalheDocumento({ id, onAssinado }: { id: string; onAssinado: () => void }) {
  const qc = useQueryClient();
  const [assinando, setAssinando] = useState(false);

  const {
    data: documento,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["documento", id],
    queryFn: () => obterDocumento({ data: { id } }),
  });

  const assinar = async () => {
    setAssinando(true);
    try {
      await assinarDocumento({ data: { id } });
      toast.success("Documento assinado.");
      await qc.invalidateQueries({ queryKey: ["documento", id] });
      onAssinado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao assinar.");
    } finally {
      setAssinando(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (error || !documento)
    return (
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Documento não encontrado."}
      </p>
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{documento.titulo}</DialogTitle>
        <DialogDescription>Criado por {documento.criador_nome ?? "—"}</DialogDescription>
      </DialogHeader>

      <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
        {documento.conteudo}
      </div>

      {documento.arquivo_url && (
        <a
          href={documento.arquivo_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Paperclip className="h-3.5 w-3.5" /> {documento.arquivo_nome_original ?? "Anexo"}
        </a>
      )}

      <div>
        <Label className="text-sm">Assinaturas ({documento.signatarios.length})</Label>
        {documento.signatarios.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Ninguém assinou ainda.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {documento.signatarios.map((s) => (
              <li key={s.usuario_id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {s.nome ?? "—"}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDataHora(s.assinado_em)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter>
        {documento.ja_assinei ? (
          <p className="text-sm text-muted-foreground">Você já assinou este documento.</p>
        ) : (
          <Button onClick={assinar} disabled={assinando}>
            <Scale className="mr-1.5 h-4 w-4" />
            {assinando ? "Assinando…" : "Assinar documento"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function NovoDocumentoDialog({ onCriado }: { onCriado: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [arquivo, setArquivo] = useState<{
    url: string;
    nomeOriginal: string;
    mime: string;
  } | null>(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const handleArquivo = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Arquivo maior que 15 MB.");
      return;
    }
    setEnviandoArquivo(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resultado = await uploadArquivoDocumento({
        data: { nomeArquivo: file.name, dataUrl },
      });
      setArquivo(resultado);
      toast.success("Arquivo enviado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const salvar = async () => {
    if (!titulo.trim()) return toast.error("Título é obrigatório.");
    if (!conteudo.trim()) return toast.error("Descrição ou ementa é obrigatória.");
    if (!arquivo) return toast.error("Selecione um arquivo PDF ou DOCX.");
    setSalvando(true);
    try {
      await criarDocumento({
        data: {
          titulo: titulo.trim(),
          conteudo: conteudo.trim(),
          arquivoUrl: arquivo?.url ?? null,
          arquivoNomeOriginal: arquivo?.nomeOriginal ?? null,
          arquivoMime: arquivo?.mime ?? null,
        },
      });
      toast.success("Documento criado.");
      onCriado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar documento.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Adicionar documento à legislação</DialogTitle>
        <DialogDescription>
          Cadastre o documento e envie o arquivo para disponibilizá-lo a todos os perfis.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Título</Label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Estatuto Social"
          />
        </div>
        <div>
          <Label>Descrição ou ementa</Label>
          <Textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Informe brevemente o conteúdo e a finalidade do documento."
            rows={5}
          />
        </div>
        <div>
          <Label>Arquivo (PDF ou DOCX, até 15 MB)</Label>
          <Input
            type="file"
            accept=".pdf,.doc,.docx"
            required
            disabled={enviandoArquivo}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleArquivo(file);
            }}
          />
          {arquivo && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" /> {arquivo.nomeOriginal}
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={salvando || enviandoArquivo}>
          {salvando ? "Criando…" : "Criar documento"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
