import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  atualizarDocumento,
  criarDocumento,
  excluirDocumento,
  listarDocumentos,
  uploadArquivoDocumento,
} from "@/lib/backend/documentos";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderInput,
  MessageCircle,
  Pencil,
  Printer,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import type { Documento } from "@/lib/backend/documentos";

export const Route = createFileRoute("/_authenticated/documentos/")({
  head: () => ({ meta: [{ title: "Legislação — Gestão Maçônica" }] }),
  component: LegislacaoPage,
});

const CATEGORIAS = [
  {
    id: "documentos_loja",
    nome: "Documentos da Loja",
    descricao: "Administração, planejamento, instruções e formulários",
  },
  { id: "legislacao", nome: "Legislação", descricao: "Atos, regulamentos e normas do SGCAB" },
  {
    id: "tratados_corporacoes",
    nome: "Tratados — Corporações Filosóficas",
    descricao: "Tratados com corpos filosóficos",
  },
  {
    id: "tratados_orientes",
    nome: "Tratados — Grandes Orientes",
    descricao: "Tratados com Grandes Orientes",
  },
  {
    id: "ensino",
    nome: "Ensino",
    descricao: "Materiais de estudo, formação e instrução maçônica",
  },
  {
    id: "documentos_historicos",
    nome: "Documentos Históricos",
    descricao: "Registros e documentos da memória da Loja",
  },
  {
    id: "rituais_antigos",
    nome: "Rituais Antigos",
    descricao: "Rituais históricos preservados para consulta",
  },
  {
    id: "formularios",
    nome: "Formulários",
    descricao: "Modelos e formulários de uso administrativo",
  },
  {
    id: "tabela_valores_sgcab",
    nome: "Tabela de Valores SGCAB",
    descricao: "Tabelas vigentes de taxas e valores do SGCAB",
  },
  {
    id: "historia_rito",
    nome: "História do Rito",
    descricao: "Documentos sobre a origem e a evolução histórica do Rito",
  },
] as const;

const SEM_ANO = "sem_ano";

function extrairAno(documento: Documento) {
  const anoDaPasta = documento.categoria.match(/^legislacao:(\d{4})$/)?.[1];
  if (anoDaPasta) return anoDaPasta;
  const texto = `${documento.titulo} ${documento.arquivo_nome_original ?? ""}`;
  const anos = texto.match(/\b(?:19|20)\d{2}\b/g);
  return anos?.at(-1) ?? SEM_ANO;
}

function LegislacaoPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [categoria, setCategoria] = useState<string | null>(null);
  const [ano, setAno] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);
  const [visualizando, setVisualizando] = useState<Documento | null>(null);
  const [editando, setEditando] = useState<Documento | null>(null);

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["documentos"],
    queryFn: () => listarDocumentos(),
  });

  const contagens = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIAS.map((item) => [
          item.id,
          documentos.filter((d) => d.categoria === item.id || d.categoria.startsWith(`${item.id}:`))
            .length,
        ]),
      ),
    [documentos],
  );
  const anosLegislacao = useMemo(() => {
    const contagem = new Map<string, number>();
    documentos
      .filter(
        (documento) =>
          documento.categoria === "legislacao" || documento.categoria.startsWith("legislacao:"),
      )
      .forEach((documento) => {
        const anoDocumento = extrairAno(documento);
        contagem.set(anoDocumento, (contagem.get(anoDocumento) ?? 0) + 1);
      });
    return [...contagem.entries()].sort(([anoA], [anoB]) => {
      if (anoA === SEM_ANO) return 1;
      if (anoB === SEM_ANO) return -1;
      return Number(anoB) - Number(anoA);
    });
  }, [documentos]);
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const resultado = documentos.filter(
      (documento) =>
        (!categoria ||
          documento.categoria === categoria ||
          documento.categoria.startsWith(`${categoria}:`)) &&
        (categoria !== "legislacao" || !ano || extrairAno(documento) === ano) &&
        (!termo ||
          documento.titulo.toLocaleLowerCase("pt-BR").includes(termo) ||
          documento.arquivo_nome_original?.toLocaleLowerCase("pt-BR").includes(termo)),
    );
    if (categoria === "legislacao") {
      return resultado.sort((a, b) =>
        b.titulo.localeCompare(a.titulo, "pt-BR", { numeric: true, sensitivity: "base" }),
      );
    }
    return resultado;
  }, [ano, busca, categoria, documentos]);
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(filtrados);

  const excluir = async (id: string) => {
    try {
      await excluirDocumento({ data: { id } });
      toast.success("Documento excluído.");
      await qc.invalidateQueries({ queryKey: ["documentos"] });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir o documento.");
    }
  };

  const categoriaAtual = CATEGORIAS.find((item) => item.id === categoria);

  const compartilhar = async (documento: Documento) => {
    if (!documento.arquivo_url) return;
    const url = new URL(documento.arquivo_url, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: documento.titulo, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado para compartilhar.");
      }
    } catch (erro) {
      if (erro instanceof DOMException && erro.name === "AbortError") return;
      toast.error("Não foi possível compartilhar o documento.");
    }
  };

  const urlDocumento = (documento: Documento) =>
    documento.arquivo_url ? new URL(documento.arquivo_url, window.location.origin).toString() : "";

  const urlWhatsapp = (documento: Documento) =>
    `https://wa.me/?text=${encodeURIComponent(`${documento.titulo}\n${urlDocumento(documento)}`)}`;

  return (
    <>
      <PageHeader
        title="Legislação"
        description="Repositório de documentos normativos, administrativos e tratados da Loja."
        actions={
          (can.isAdmin || can.canManageIrmaos) && (
            <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" /> Adicionar documento
                </Button>
              </DialogTrigger>
              <NovoDocumento
                onCriado={async () => {
                  setDialogAberto(false);
                  await qc.invalidateQueries({ queryKey: ["documentos"] });
                }}
              />
            </Dialog>
          )
        }
      />

      {!categoria ? (
        <section aria-labelledby="pastas-legislacao">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="pastas-legislacao" className="text-base font-semibold">
                Pastas
              </h2>
              <p className="text-sm text-muted-foreground">
                Selecione uma área para consultar seus documentos.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CATEGORIAS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCategoria(item.id);
                  setAno(null);
                  setPagina(1);
                }}
                className="group flex min-h-28 items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Folder className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block font-semibold leading-snug">{item.nome}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {item.descricao}
                  </span>
                  <span className="mt-2 block text-xs font-medium text-primary">
                    {contagens[item.id] ?? 0} documento(s)
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : categoria === "legislacao" && !ano ? (
        <section aria-labelledby="anos-legislacao">
          <div className="mb-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCategoria(null);
                setBusca("");
                setPagina(1);
              }}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Pastas
            </Button>
            <div>
              <h2 id="anos-legislacao" className="text-base font-semibold">
                Legislação por ano
              </h2>
              <p className="text-sm text-muted-foreground">
                Os documentos mais recentes aparecem primeiro.
              </p>
            </div>
          </div>
          {anosLegislacao.length === 0 ? (
            <Card>
              <EmptyState
                icon={Folder}
                title="Nenhuma legislação cadastrada"
                description="Adicione um documento com o ano no título ou no nome do arquivo."
              />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {anosLegislacao.map(([anoDocumento, quantidade], indice) => (
                <button
                  key={anoDocumento}
                  type="button"
                  onClick={() => {
                    setAno(anoDocumento);
                    setPagina(1);
                  }}
                  className="group flex min-h-24 items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Folder className="h-6 w-6 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-lg font-semibold tabular-nums">
                      {anoDocumento === SEM_ANO ? "Sem ano identificado" : anoDocumento}
                    </span>
                    <span className="mt-1 block text-xs font-medium text-primary">
                      {quantidade} documento(s)
                      {indice === 0 && anoDocumento !== SEM_ANO ? " · Mais recentes" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby="conteudo-pasta">
          <div className="mb-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (categoria === "legislacao") setAno(null);
                else setCategoria(null);
                setBusca("");
                setPagina(1);
              }}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {categoria === "legislacao" ? "Anos" : "Pastas"}
            </Button>
            <div className="min-w-0">
              <h2 id="conteudo-pasta" className="truncate text-base font-semibold">
                {categoriaAtual?.nome}
                {categoria === "legislacao" && ano
                  ? ` · ${ano === SEM_ANO ? "Sem ano identificado" : ano}`
                  : ""}
              </h2>
              <p className="text-sm text-muted-foreground">{totalItens} documento(s)</p>
            </div>
          </div>
          <Card className="mb-4 p-4">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Buscar documentos"
                placeholder="Buscar documento nesta pasta…"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
                className="pl-9"
              />
            </div>
          </Card>

          <Card className="overflow-hidden">
            {isLoading ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Carregando documentos…
              </p>
            ) : filtrados.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nenhum documento encontrado"
                description="Escolha outra pasta ou revise os termos da busca."
              />
            ) : (
              <div className="divide-y">
                {itensPagina.map((documento) => (
                  <div
                    key={documento.id}
                    className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/30"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setVisualizando(documento)}
                        className="block max-w-full truncate text-left font-medium hover:text-primary hover:underline hover:underline-offset-4"
                      >
                        {documento.titulo}
                      </button>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {documento.conteudo}
                      </p>
                    </div>
                    <div className="ml-auto flex w-full flex-wrap justify-end gap-1 sm:w-auto">
                      {documento.arquivo_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVisualizando(documento)}
                        >
                          <ExternalLink className="mr-1.5 h-4 w-4" />
                          <span className="hidden sm:inline">Visualizar</span>
                        </Button>
                      )}
                      {documento.arquivo_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void compartilhar(documento)}
                          aria-label={`Compartilhar ${documento.titulo}`}
                          title="Compartilhar"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      )}
                      {(can.isAdmin || can.canManageIrmaos) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditando(documento)}
                          aria-label={`Renomear ou mover ${documento.titulo}`}
                          title="Renomear ou mover"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {documento.arquivo_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={documento.arquivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={documento.arquivo_nome_original ?? undefined}
                          >
                            <Download className="h-4 w-4" />
                            <span className="sr-only">Salvar {documento.titulo}</span>
                          </a>
                        </Button>
                      )}
                      {can.isAdmin && (
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
                                “{documento.titulo}” será removido do repositório.
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
                  </div>
                ))}
              </div>
            )}
            <TabelaPaginacao
              pagina={pagina}
              totalPaginas={totalPaginas}
              totalItens={totalItens}
              tamanhoPagina={tamanhoPagina}
              setPagina={setPagina}
            />
          </Card>
        </section>
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
                <DialogDescription>Visualização online do documento em PDF.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void compartilhar(visualizando)}>
                  <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={urlWhatsapp(visualizando)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                  </a>
                </Button>
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
                  onClick={() => {
                    const janela = window.open(
                      visualizando.arquivo_url!,
                      "_blank",
                      "noopener,noreferrer",
                    );
                    if (janela)
                      janela.addEventListener("load", () => janela.print(), { once: true });
                  }}
                >
                  <Printer className="mr-1.5 h-4 w-4" /> Imprimir
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href={visualizando.arquivo_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Nova aba
                  </a>
                </Button>
              </div>
              <iframe
                title={`Visualização de ${visualizando.titulo}`}
                src={visualizando.arquivo_url}
                className="min-h-0 flex-1 rounded-lg border bg-white"
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editando !== null} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        {editando && (
          <EditarDocumento
            documento={editando}
            onSalvo={async () => {
              setEditando(null);
              await qc.invalidateQueries({ queryKey: ["documentos"] });
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function EditarDocumento({
  documento,
  onSalvo,
}: {
  documento: Documento;
  onSalvo: () => Promise<void>;
}) {
  const [titulo, setTitulo] = useState(documento.titulo);
  const [categoria, setCategoria] = useState(documento.categoria.split(":")[0]);
  const [anoReferencia, setAnoReferencia] = useState(
    documento.categoria.match(/^legislacao:(\d{4})$/)?.[1] ?? "",
  );
  const [ocupado, setOcupado] = useState(false);

  const salvar = async () => {
    if (!titulo.trim()) return toast.error("Informe o nome do documento.");
    if (
      categoria === "legislacao" &&
      anoReferencia &&
      (Number(anoReferencia) < 1800 || Number(anoReferencia) > 2200)
    ) {
      return toast.error("Informe um ano entre 1800 e 2200.");
    }
    setOcupado(true);
    try {
      await atualizarDocumento({
        data: {
          id: documento.id,
          titulo: titulo.trim(),
          categoria: categoria as (typeof CATEGORIAS)[number]["id"],
          anoReferencia: categoria === "legislacao" && anoReferencia ? Number(anoReferencia) : null,
        },
      });
      toast.success("Documento atualizado.");
      await onSalvo();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível atualizar o documento.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Renomear ou mover</DialogTitle>
        <DialogDescription>
          Altere o nome do documento ou escolha outra pasta, como em um explorador de arquivos.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div>
          <Label htmlFor="editar-titulo">Nome do documento</Label>
          <Input
            id="editar-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label>Pasta de destino</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger>
              <FolderInput className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {categoria === "legislacao" && (
          <div>
            <Label htmlFor="editar-ano">Pasta do ano</Label>
            <Input
              id="editar-ano"
              type="number"
              min={1800}
              max={2200}
              inputMode="numeric"
              placeholder="Ex.: 2025"
              value={anoReferencia}
              onChange={(e) => setAnoReferencia(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Preencha para mover o documento diretamente para a pasta desse ano.
            </p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => void salvar()} disabled={ocupado || !titulo.trim()}>
          {ocupado ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NovoDocumento({ onCriado }: { onCriado: () => Promise<void> }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("documentos_loja");
  const [arquivo, setArquivo] = useState<{
    url: string;
    nomeOriginal: string;
    mime: string;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const selecionarArquivo = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) return toast.error("Arquivo maior que 15 MB.");
    setOcupado(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setArquivo(await uploadArquivoDocumento({ data: { nomeArquivo: file.name, dataUrl } }));
      if (!titulo) setTitulo(file.name.replace(/\.[^.]+$/, ""));
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Falha ao enviar o arquivo.");
    } finally {
      setOcupado(false);
    }
  };

  const salvar = async () => {
    if (!titulo.trim() || !arquivo) return toast.error("Informe o título e selecione um arquivo.");
    setOcupado(true);
    try {
      await criarDocumento({
        data: {
          titulo: titulo.trim(),
          categoria,
          conteudo: descricao.trim() || "Documento do repositório de legislação.",
          arquivoUrl: arquivo.url,
          arquivoNomeOriginal: arquivo.nomeOriginal,
          arquivoMime: arquivo.mime,
        },
      });
      toast.success("Documento adicionado ao repositório.");
      await onCriado();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o documento.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Adicionar documento</DialogTitle>
        <DialogDescription>Escolha a pasta e envie o arquivo para o repositório.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div>
          <Label>Pasta</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Arquivo</Label>
          <Input
            type="file"
            accept=".pdf,application/pdf"
            disabled={ocupado}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void selecionarArquivo(file);
            }}
          />
          {arquivo && <p className="mt-1 text-xs text-muted-foreground">{arquivo.nomeOriginal}</p>}
        </div>
        <div>
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div>
          <Label>Descrição (opcional)</Label>
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={salvar} disabled={ocupado || !arquivo}>
          {ocupado ? "Aguarde…" : "Adicionar ao repositório"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
