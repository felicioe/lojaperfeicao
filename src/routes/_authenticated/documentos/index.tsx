import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
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
import { Download, FileText, Folder, FolderOpen, Plus, Search, Trash2 } from "lucide-react";

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
] as const;

function LegislacaoPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [categoria, setCategoria] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [dialogAberto, setDialogAberto] = useState(false);

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["documentos"],
    queryFn: () => listarDocumentos(),
  });

  const contagens = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIAS.map((item) => [
          item.id,
          documentos.filter((d) => d.categoria === item.id).length,
        ]),
      ),
    [documentos],
  );
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return documentos.filter(
      (documento) =>
        (!categoria || documento.categoria === categoria) &&
        (!termo ||
          documento.titulo.toLocaleLowerCase("pt-BR").includes(termo) ||
          documento.arquivo_nome_original?.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [busca, categoria, documentos]);
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

  return (
    <>
      <PageHeader
        title="Legislação"
        description="Repositório de documentos normativos, administrativos e tratados da Loja."
        actions={
          can.canManageIrmaos && (
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

      <section aria-labelledby="pastas-legislacao" className="mb-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="pastas-legislacao" className="text-base font-semibold">
              Pastas
            </h2>
            <p className="text-sm text-muted-foreground">
              Selecione uma área para consultar seus documentos.
            </p>
          </div>
          {categoria && (
            <Button variant="ghost" size="sm" onClick={() => setCategoria(null)}>
              Ver todas
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CATEGORIAS.map((item) => {
            const ativa = categoria === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCategoria(ativa ? null : item.id);
                  setPagina(1);
                }}
                aria-pressed={ativa}
                className={`group flex min-h-28 items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ativa ? "border-primary bg-primary/10" : "bg-card hover:border-primary/50 hover:bg-muted/40"}`}
              >
                {ativa ? (
                  <FolderOpen className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                ) : (
                  <Folder className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                )}
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
            );
          })}
        </div>
      </section>

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
          <p className="p-8 text-center text-sm text-muted-foreground">Carregando documentos…</p>
        ) : filtrados.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum documento encontrado"
            description="Escolha outra pasta ou revise os termos da busca."
          />
        ) : (
          <div className="divide-y">
            {itensPagina.map((documento) => (
              <div key={documento.id} className="flex items-center gap-3 p-4 hover:bg-muted/30">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{documento.titulo}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {documento.conteudo}
                  </p>
                </div>
                {documento.arquivo_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={documento.arquivo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={documento.arquivo_nome_original ?? undefined}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      <span className="hidden sm:inline">Baixar</span>
                    </a>
                  </Button>
                )}
                {can.isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label={`Excluir ${documento.titulo}`}>
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
    </>
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
            accept=".pdf,.doc,.docx,.odt,.png,.jpg,.jpeg"
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
