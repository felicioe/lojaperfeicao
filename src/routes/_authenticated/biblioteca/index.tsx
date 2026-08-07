import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarPecasArquitetura,
  criarPecaArquitetura,
  atualizarPecaArquitetura,
  excluirPecaArquitetura,
  uploadArquivoPeca,
  type PecaArquitetura,
} from "@/lib/backend/pecas-arquitetura";
import { listarIrmaosNomes, obterMeuIrmao } from "@/lib/backend/irmaos";
import { listarSessoes } from "@/lib/backend/sessoes";
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
import { Library, Plus, Download, Pencil, Trash2, FileText } from "lucide-react";

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

  const { data: pecas = [], isLoading } = useQuery({
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

  const filtered = pecas.filter(
    (p) =>
      !q ||
      p.titulo.toLowerCase().includes(q.toLowerCase()) ||
      p.autor_nome.toLowerCase().includes(q.toLowerCase()) ||
      p.tema?.toLowerCase().includes(q.toLowerCase()),
  );
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(filtered);

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
    setEnviando(true);
    try {
      const payload = {
        autorId: form.autorId,
        sessaoId: form.sessaoId || null,
        titulo: form.titulo.trim(),
        tema: form.tema.trim() || null,
        resumo: form.resumo.trim() || null,
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

  return (
    <>
      <PageHeader
        title="Biblioteca de Peças"
        description="Peças de arquitetura (trabalhos apresentados em sessão)."
        actions={
          (meuIrmao || podeGerenciarTudo) && (
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
                    <Label>Autor</Label>
                    {podeGerenciarTudo ? (
                      <Select
                        value={form.autorId}
                        onValueChange={(v) => setForm({ ...form, autorId: v })}
                      >
                        <SelectTrigger>
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
                      <Input value={meuIrmao?.nome_civil ?? ""} disabled />
                    )}
                  </div>
                  <div>
                    <Label>Título</Label>
                    <Input
                      value={form.titulo}
                      onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Tema (opcional)</Label>
                    <Input
                      value={form.tema}
                      onChange={(e) => setForm({ ...form, tema: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Sessão em que foi apresentada (opcional)</Label>
                    <Select
                      value={form.sessaoId || "nenhuma"}
                      onValueChange={(v) =>
                        setForm({ ...form, sessaoId: v === "nenhuma" ? "" : v })
                      }
                    >
                      <SelectTrigger>
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
                    <Label>Resumo (opcional)</Label>
                    <Textarea
                      value={form.resumo}
                      onChange={(e) => setForm({ ...form, resumo: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Arquivo (PDF ou DOCX, até 15 MB — opcional)</Label>
                    <Input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
        {!isLoading && filtered.length === 0 ? (
          <EmptyState icon={Library} title="Nenhuma peça cadastrada ainda" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Tema</TableHead>
                <TableHead>Sessão</TableHead>
                <TableHead>Cadastrada em</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {itensPagina.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.titulo}</TableCell>
                  <TableCell>{p.autor_nome}</TableCell>
                  <TableCell>{p.tema ?? "—"}</TableCell>
                  <TableCell>{p.sessao_data ? fmtDate(p.sessao_data) : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(p.criado_em)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.arquivo_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={p.arquivo_url} download={p.arquivo_nome_original ?? undefined}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {podeEditar(p) && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)}>
                            <Pencil className="h-4 w-4" />
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
    </>
  );
}
