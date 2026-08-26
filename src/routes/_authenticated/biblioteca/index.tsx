import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listarPecasArquitetura,
  criarPecaArquitetura,
  atualizarPecaArquitetura,
  excluirPecaArquitetura,
  aprovarPecaArquitetura,
  rejeitarPecaArquitetura,
  uploadArquivoPeca,
  type PecaArquitetura,
} from "@/lib/backend/pecas-arquitetura";
import { listarIrmaosNomes, obterMeuIrmao } from "@/lib/backend/irmaos";
import { listarSessoes } from "@/lib/backend/sessoes";
import { dataUrlParaBlobUrl, ehUrlCompartilhavel } from "@/lib/data-url";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
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
import { fmtDate } from "@/lib/format";
import { useCan } from "@/lib/auth-hooks";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import {
  Library,
  Plus,
  Download,
  Eye,
  Pencil,
  Trash2,
  FileText,
  Check,
  ExternalLink,
  MessageCircle,
  Printer,
  Share2,
  Upload,
  X as XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/biblioteca/")({
  head: () => ({
    meta: [
      { title: "Biblioteca de Peças — Gestão Maçônica" },
      { name: "description", content: "Peças de arquitetura apresentadas em sessão." },
    ],
  }),
  component: BibliotecaPage,
});

type FormState = {
  id?: string;
  autorId: string;
  sessaoId: string;
  titulo: string;
  tema: string;
  resumo: string;
  grau: string;
  arquivoUrl: string | null;
  arquivoNomeOriginal: string | null;
  arquivoMime: string | null;
};

const FORM_VAZIO: FormState = {
  autorId: "",
  sessaoId: "",
  titulo: "",
  tema: "",
  resumo: "",
  grau: "",
  arquivoUrl: null,
  arquivoNomeOriginal: null,
  arquivoMime: null,
};

function BibliotecaPage() {
  const qc = useQueryClient();
  const can = useCan();
  const podeGerenciarTudo = can.canManageIrmaos;

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [visualizando, setVisualizando] = useState<PecaArquitetura | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  // Nova aba/Imprimir navegam a janela pro arquivo — data URL nessa
  // navegação é bloqueada/inconsistente entre navegadores, então converte
  // pra blob URL (revogado ao trocar/fechar) só pra esses dois usos.
  const [urlVisualizacaoBlob, setUrlVisualizacaoBlob] = useState<string | null>(null);
  useEffect(() => {
    if (!visualizando?.arquivo_url) {
      setUrlVisualizacaoBlob(null);
      return;
    }
    const blobUrl = dataUrlParaBlobUrl(visualizando.arquivo_url);
    setUrlVisualizacaoBlob(blobUrl);
    return () => {
      if (blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
    };
  }, [visualizando?.arquivo_url]);

  const {
    data: pecas = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["pecas_arquitetura"],
    queryFn: () => listarPecasArquitetura(),
  });
  const { data: meuIrmao } = useQuery({
    queryKey: ["meu_irmao"],
    queryFn: () => obterMeuIrmao(),
  });
  const { data: irmaosNomes = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
    enabled: podeGerenciarTudo,
  });
  const { data: sessoes = [] } = useQuery({
    queryKey: ["sessoes"],
    queryFn: () => listarSessoes(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pecas_arquitetura"] });

  const filtered = useMemo(
    () =>
      pecas.filter(
        (p) =>
          !q ||
          p.titulo.toLowerCase().includes(q.toLowerCase()) ||
          p.autor_nome.toLowerCase().includes(q.toLowerCase()) ||
          p.tema?.toLowerCase().includes(q.toLowerCase()),
      ),
    [pecas, q],
  );
  const ord = useOrdenacao(filtered, {
    titulo: (p) => p.titulo,
    autor: (p) => p.autor_nome,
    tema: (p) => p.tema,
    grau: (p) => p.grau,
    situacao: (p) => p.situacao,
    sessao: (p) => p.sessao_data,
    cadastrada: (p) => p.criado_em,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  const podeEditar = (p: PecaArquitetura) => podeGerenciarTudo || p.autor_id === meuIrmao?.id;

  const abrirNova = () => {
    setForm({ ...FORM_VAZIO, autorId: meuIrmao?.id ?? "" });
    setOpen(true);
  };

  const abrirEdicao = (p: PecaArquitetura) => {
    setForm({
      id: p.id,
      autorId: p.autor_id,
      sessaoId: p.sessao_id ?? "",
      titulo: p.titulo,
      tema: p.tema ?? "",
      resumo: p.resumo ?? "",
      grau: String(p.grau),
      arquivoUrl: p.arquivo_url,
      arquivoNomeOriginal: p.arquivo_nome_original,
      arquivoMime: p.arquivo_mime,
    });
    setOpen(true);
  };

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
      const resultado = await uploadArquivoPeca({
        data: { nomeArquivo: file.name, dataUrl },
      });
      setForm((f) => ({
        ...f,
        arquivoUrl: resultado.url,
        arquivoNomeOriginal: resultado.nomeOriginal,
        arquivoMime: resultado.mime,
      }));
      toast.success("Arquivo enviado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar o arquivo.");
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const salvar = async () => {
    if (!form.autorId) return toast.error("Selecione o autor.");
    if (!form.titulo.trim()) return toast.error("Título é obrigatório.");
    const grau = Number(form.grau);
    if (!grau || grau < 1) return toast.error("Informe o grau da peça.");
    setEnviando(true);
    try {
      const payload = {
        autorId: form.autorId,
        sessaoId: form.sessaoId || null,
        titulo: form.titulo.trim(),
        tema: form.tema.trim() || null,
        resumo: form.resumo.trim() || null,
        grau,
        arquivoUrl: form.arquivoUrl,
        arquivoNomeOriginal: form.arquivoNomeOriginal,
        arquivoMime: form.arquivoMime,
      };
      if (form.id) {
        await atualizarPecaArquitetura({ data: { ...payload, id: form.id } });
        toast.success("Peça atualizada.");
      } else {
        await criarPecaArquitetura({ data: payload });
        toast.success("Peça cadastrada.");
      }
      setOpen(false);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setEnviando(false);
    }
  };

  const excluir = async (id: string) => {
    try {
      await excluirPecaArquitetura({ data: { id } });
      toast.success("Peça excluída.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir.");
    }
  };

  const aprovar = async (id: string) => {
    try {
      await aprovarPecaArquitetura({ data: { id } });
      toast.success("Peça aprovada.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aprovar.");
    }
  };

  const rejeitar = async (id: string) => {
    try {
      await rejeitarPecaArquitetura({ data: { id } });
      toast.success("Peça rejeitada.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao rejeitar.");
    }
  };

  const urlPeca = (peca: PecaArquitetura) =>
    peca.arquivo_url ? new URL(peca.arquivo_url, window.location.origin).toString() : "";

  const compartilhar = async (peca: PecaArquitetura) => {
    if (!peca.arquivo_url) return;
    const url = urlPeca(peca);
    if (!ehUrlCompartilhavel(url)) {
      toast.error("Este arquivo não tem um link compartilhável — use Baixar e envie o arquivo.");
      return;
    }
    try {
      if (navigator.share) await navigator.share({ title: peca.titulo, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado para compartilhar.");
      }
    } catch (erro) {
      if (erro instanceof DOMException && erro.name === "AbortError") return;
      toast.error("Não foi possível compartilhar a peça.");
    }
  };

  const urlWhatsapp = (peca: PecaArquitetura) =>
    `https://wa.me/?text=${encodeURIComponent(`${peca.titulo}\n${urlPeca(peca)}`)}`;

  return (
    <>
      <PageHeader
        title="Biblioteca de Peças"
        description="Peças de arquitetura (trabalhos apresentados em sessão)."
        actions={
          (meuIrmao || podeGerenciarTudo) && (
            <div className="flex flex-wrap gap-2">
              {can.isAdmin && (
                <Dialog open={loteAberto} onOpenChange={setLoteAberto}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Upload className="mr-1.5 h-4 w-4" /> Enviar em lote
                    </Button>
                  </DialogTrigger>
                  <LotePecas
                    autorId={meuIrmao?.id}
                    onConcluido={async () => {
                      setLoteAberto(false);
                      await invalidate();
                    }}
                  />
                </Dialog>
              )}
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button onClick={abrirNova}>
                    <Plus className="mr-1.5 h-4 w-4" /> Nova peça
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{form.id ? "Editar peça" : "Nova peça"}</DialogTitle>
                    <DialogDescription>
                      Título e autor são obrigatórios — o resto é opcional.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3">
                    <div>
                      <Label htmlFor="biblioteca-autor">Autor</Label>
                      {podeGerenciarTudo ? (
                        <Select
                          value={form.autorId}
                          onValueChange={(v) => setForm({ ...form, autorId: v })}
                        >
                          <SelectTrigger id="biblioteca-autor">
                            <SelectValue placeholder="Selecione…" />
                          </SelectTrigger>
                          <SelectContent>
                            {irmaosNomes.map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.nome_civil}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input id="biblioteca-autor" value={meuIrmao?.nome_civil ?? ""} disabled />
                      )}
                    </div>
                    <div>
                      <Label htmlFor="biblioteca-titulo">Título</Label>
                      <Input
                        id="biblioteca-titulo"
                        value={form.titulo}
                        onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="biblioteca-tema-opcional">Tema (opcional)</Label>
                      <Input
                        id="biblioteca-tema-opcional"
                        value={form.tema}
                        onChange={(e) => setForm({ ...form, tema: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="biblioteca-grau">Grau</Label>
                      <Input
                        id="biblioteca-grau"
                        type="number"
                        min={1}
                        value={form.grau}
                        onChange={(e) => setForm({ ...form, grau: e.target.value })}
                        placeholder="Ex.: 4"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Só irmãos deste grau ou superior poderão ver esta peça.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="biblioteca-sessao-em-que-foi">
                        Sessão em que foi apresentada (opcional)
                      </Label>
                      <Select
                        value={form.sessaoId || "nenhuma"}
                        onValueChange={(v) =>
                          setForm({ ...form, sessaoId: v === "nenhuma" ? "" : v })
                        }
                      >
                        <SelectTrigger id="biblioteca-sessao-em-que-foi">
                          <SelectValue placeholder="Nenhuma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhuma">Nenhuma</SelectItem>
                          {sessoes.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {fmtDate(s.data)} — {s.tipo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="biblioteca-resumo-opcional">Resumo (opcional)</Label>
                      <Textarea
                        id="biblioteca-resumo-opcional"
                        value={form.resumo}
                        onChange={(e) => setForm({ ...form, resumo: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="biblioteca-arquivo-pdf-ate-15">
                        Arquivo (PDF, até 15 MB — opcional)
                      </Label>
                      <Input
                        id="biblioteca-arquivo-pdf-ate-15"
                        type="file"
                        accept=".pdf,application/pdf"
                        disabled={enviandoArquivo}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleArquivo(file);
                        }}
                      />
                      {form.arquivoNomeOriginal && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" /> {form.arquivoNomeOriginal}
                          {enviandoArquivo && " — enviando…"}
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={salvar} disabled={enviando || enviandoArquivo}>
                      {enviando ? "Salvando…" : "Salvar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )
        }
      />
      <Card className="mb-4 p-4">
        <Input
          placeholder="Buscar por título, autor ou tema…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
      </Card>
      <Card>
        {isError ? (
          <EmptyState
            icon={Library}
            title="Não foi possível carregar a biblioteca"
            description="Falha ao buscar os dados. Tente novamente."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            }
          />
        ) : !isLoading && filtered.length === 0 ? (
          <EmptyState icon={Library} title="Nenhuma peça cadastrada ainda" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="titulo" ord={ord}>
                  Título
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="autor" ord={ord} className="hidden sm:table-cell">
                  Autor
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="tema" ord={ord} className="hidden lg:table-cell">
                  Tema
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="grau" ord={ord} className="hidden sm:table-cell">
                  Grau
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="situacao" ord={ord}>
                  Situação
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="sessao" ord={ord} className="hidden lg:table-cell">
                  Sessão
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="cadastrada" ord={ord} className="hidden lg:table-cell">
                  Cadastrada em
                </TableHeadOrdenavel>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {itensPagina.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.titulo}
                    <div className="text-xs text-muted-foreground sm:hidden">{p.autor_nome}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{p.autor_nome}</TableCell>
                  <TableCell className="hidden lg:table-cell">{p.tema ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">Grau {p.grau}</TableCell>
                  <TableCell>
                    {p.situacao === "aprovado" ? (
                      <Badge>Aprovada</Badge>
                    ) : p.situacao === "rejeitado" ? (
                      <Badge variant="destructive">Rejeitada</Badge>
                    ) : (
                      <Badge variant="outline">Em análise</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {p.sessao_data ? fmtDate(p.sessao_data) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {fmtDate(p.criado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {podeGerenciarTudo && p.situacao === "em_analise" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Aprovar"
                            onClick={() => aprovar(p.id)}
                          >
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Rejeitar"
                            onClick={() => rejeitar(p.id)}
                          >
                            <XIcon className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {p.arquivo_url && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Visualizar"
                            aria-label={`Visualizar ${p.titulo}`}
                            onClick={() => setVisualizando(p)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Compartilhar"
                            aria-label={`Compartilhar ${p.titulo}`}
                            onClick={() => void compartilhar(p)}
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" asChild title="Baixar">
                            <a href={p.arquivo_url} download={p.arquivo_nome_original ?? undefined}>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      )}
                      {podeEditar(p) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Renomear ou editar {p.titulo}</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir peça?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{p.titulo}" será removida permanentemente, junto com o arquivo
                                  anexado.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => excluir(p.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
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
      {!meuIrmao && !podeGerenciarTudo && (
        <p className="mt-3 text-sm text-muted-foreground">
          Seu usuário ainda não está vinculado a um cadastro de irmão — fale com a secretaria pra
          poder cadastrar peças em seu nome.
        </p>
      )}

      <Dialog
        open={visualizando !== null}
        onOpenChange={(aberto) => !aberto && setVisualizando(null)}
      >
        <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-3 p-4 sm:max-w-5xl">
          {visualizando?.arquivo_url && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="truncate">{visualizando.titulo}</DialogTitle>
                <DialogDescription>
                  Peça de {visualizando.autor_nome} · Grau {visualizando.grau}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void compartilhar(visualizando)}>
                  <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar
                </Button>
                {ehUrlCompartilhavel(urlPeca(visualizando)) && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={urlWhatsapp(visualizando)} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={visualizando.arquivo_url}
                    download={visualizando.arquivo_nome_original ?? undefined}
                  >
                    <Download className="mr-1.5 h-4 w-4" /> Salvar
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!urlVisualizacaoBlob}
                  onClick={() => {
                    if (!urlVisualizacaoBlob) return;
                    const janela = window.open(
                      urlVisualizacaoBlob,
                      "_blank",
                      "noopener,noreferrer",
                    );
                    if (janela)
                      janela.addEventListener("load", () => janela.print(), { once: true });
                  }}
                >
                  <Printer className="mr-1.5 h-4 w-4" /> Imprimir
                </Button>
                <Button variant="ghost" size="sm" disabled={!urlVisualizacaoBlob} asChild>
                  <a href={urlVisualizacaoBlob ?? "#"} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Nova aba
                  </a>
                </Button>
              </div>
              <iframe
                title={`Visualização de ${visualizando.titulo}`}
                src={urlVisualizacaoBlob ?? undefined}
                className="min-h-0 flex-1 rounded-lg border bg-white"
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function arquivoParaDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function LotePecas({
  autorId,
  onConcluido,
}: {
  autorId?: string;
  onConcluido: () => Promise<void>;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const enviar = async () => {
    if (!autorId) return toast.error("O administrador precisa estar vinculado a um irmão.");
    if (!arquivos.length) return toast.error("Selecione ao menos um PDF.");
    setEnviando(true);
    const falhas: string[] = [];
    for (const [indice, file] of arquivos.entries()) {
      setProgresso(indice + 1);
      try {
        if (file.size > 15 * 1024 * 1024) throw new Error("arquivo maior que 15 MB");
        const upload = await uploadArquivoPeca({
          data: { nomeArquivo: file.name, dataUrl: await arquivoParaDataUrl(file) },
        });
        await criarPecaArquitetura({
          data: {
            autorId,
            titulo: file.name.replace(/\.[^.]+$/, ""),
            grau: 1,
            sessaoId: null,
            tema: null,
            resumo: "Peça enviada em lote; informações pendentes de revisão.",
            arquivoUrl: upload.url,
            arquivoNomeOriginal: upload.nomeOriginal,
            arquivoMime: upload.mime,
          },
        });
      } catch {
        falhas.push(file.name);
      }
    }
    const concluidos = arquivos.length - falhas.length;
    if (falhas.length) {
      toast.warning(`${concluidos} enviada(s); ${falhas.length} falharam: ${falhas.join(", ")}`);
    } else toast.success(`${concluidos} peça(s) enviadas.`);
    setEnviando(false);
    if (concluidos) await onConcluido();
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Enviar peças em lote</DialogTitle>
        <DialogDescription>
          Selecione até 50 PDFs. Eles entrarão em análise com grau provisório 1 e poderão ser
          completados depois.
        </DialogDescription>
      </DialogHeader>
      <div>
        <Label htmlFor="lote-pecas">Arquivos PDF</Label>
        <Input
          id="lote-pecas"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          disabled={enviando}
          onChange={(e) => setArquivos(Array.from(e.target.files ?? []).slice(0, 50))}
        />
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {enviando
            ? `Enviando ${progresso} de ${arquivos.length}…`
            : `${arquivos.length} arquivo(s) selecionado(s).`}
        </p>
      </div>
      <DialogFooter>
        <Button onClick={() => void enviar()} disabled={enviando || !arquivos.length || !autorId}>
          {enviando ? "Enviando…" : "Enviar lote"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
