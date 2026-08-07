import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { FileSignature, Plus, Trash2, CheckCircle2, Paperclip } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documentos/")({
  head: () => ({
    meta: [
      { title: "Documentos — Gestão Maçônica" },
      { name: "description", content: "Assinatura digital simples de documentos internos." },
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

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ["documentos"],
    queryFn: () => listarDocumentos(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["documentos"] });

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
        title="Documentos"
        description="Registro interno de confirmação/aprovação com hash de integridade — sem validade jurídica ICP-Brasil."
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
                  <Plus className="mr-1.5 h-4 w-4" /> Novo documento
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

      {!isLoading && documentos.length === 0 ? (
        <Card>
          <EmptyState icon={FileSignature} title="Nenhum documento cadastrado ainda" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {documentos.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileSignature className="h-4 w-4" /> {d.titulo}
                    </CardTitle>
                    <CardDescription>Criado por {d.criador_nome ?? "—"}</CardDescription>
                  </div>
                  {d.ja_assinei && (
                    <Badge variant="default" className="shrink-0 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Assinado
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {d.total_assinaturas} assinatura(s) — {fmtDataHora(d.criado_em)}
                </p>
                {d.arquivo_url && (
                  <a
                    href={d.arquivo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Paperclip className="h-3 w-3" /> {d.arquivo_nome_original ?? "Anexo"}
                  </a>
                )}
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={() => setDetalheDe(d)}>
                    Ver e assinar
                  </Button>
                  {can.isAdmin && d.total_assinaturas === 0 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{d.titulo}" será removido permanentemente. Só é possível excluir
                            documentos que ainda não têm assinaturas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => excluir(d.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
            <FileSignature className="mr-1.5 h-4 w-4" />
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
    if (!conteudo.trim()) return toast.error("Conteúdo é obrigatório.");
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
        <DialogTitle>Novo documento</DialogTitle>
        <DialogDescription>
          O texto abaixo é o que fica registrado (com hash) e assinado por quem confirmar.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div>
          <Label>Conteúdo</Label>
          <Textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={8} />
        </div>
        <div>
          <Label>Anexo (opcional — PDF ou DOCX)</Label>
          <Input
            type="file"
            accept=".pdf,.doc,.docx"
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
