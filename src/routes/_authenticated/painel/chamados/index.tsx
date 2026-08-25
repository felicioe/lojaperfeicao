import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { abrirChamado, listarMeusChamados, type Prioridade } from "@/lib/backend/chamados";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LifeBuoy, Plus, X, Paperclip } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/chamados/")({
  head: () => ({ meta: [{ title: "Chamados de Suporte — Gestão Maçônica" }] }),
  component: MeusChamados,
});

const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  aberto: "default",
  em_andamento: "secondary",
  resolvido: "outline",
  fechado: "outline",
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

type AnexoPendente = { nomeArquivo: string; dataUrl: string };

function arquivoParaDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MeusChamados() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assunto, setAssunto] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [mensagem, setMensagem] = useState("");
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const [enviando, setEnviando] = useState(false);

  const {
    data: chamados = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["meus-chamados"],
    queryFn: () => listarMeusChamados(),
  });

  const adicionarArquivos = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const dataUrl = await arquivoParaDataUrl(file);
      setAnexos((prev) => [...prev, { nomeArquivo: file.name, dataUrl }]);
    }
  };

  const limparForm = () => {
    setAssunto("");
    setPrioridade("media");
    setMensagem("");
    setAnexos([]);
  };

  const enviar = async () => {
    if (!assunto.trim()) return toast.error("Informe o assunto.");
    if (!mensagem.trim()) return toast.error("Descreva o problema ou a dúvida.");
    setEnviando(true);
    try {
      await abrirChamado({ data: { assunto, prioridade, mensagem, anexos } });
      toast.success("Chamado aberto. Você receberá atualizações por e-mail.");
      qc.invalidateQueries({ queryKey: ["meus-chamados"] });
      limparForm();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir chamado.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Chamados de Suporte"
        description="Fale com a equipe que administra o sistema — dúvidas, problemas ou pedidos."
      />

      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(v) => (v ? setOpen(true) : (setOpen(false), limparForm()))}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" /> Abrir chamado
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Abrir chamado de suporte</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="chamado-assunto">Assunto</Label>
                <Input
                  id="chamado-assunto"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div>
                <Label htmlFor="chamado-prioridade">Prioridade</Label>
                <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                  <SelectTrigger id="chamado-prioridade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORIDADE_LABEL) as Prioridade[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORIDADE_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="chamado-mensagem">Descrição</Label>
                <Textarea
                  id="chamado-mensagem"
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  maxLength={5000}
                  rows={5}
                  placeholder="Descreva o problema ou a dúvida com o máximo de detalhes."
                />
              </div>
              <div>
                <Label htmlFor="chamado-anexos">
                  Anexos (opcional, imagem ou PDF, até 5 MB cada)
                </Label>
                <Input
                  id="chamado-anexos"
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => adicionarArquivos(e.target.files)}
                />
                {anexos.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {anexos.map((a, i) => (
                      <li
                        key={`${a.nomeArquivo}-${i}`}
                        className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Paperclip className="h-3 w-3 shrink-0" /> {a.nomeArquivo}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remover ${a.nomeArquivo}`}
                          onClick={() => setAnexos((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={enviando}>
                {enviando ? "Enviando…" : "Abrir chamado"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <EmptyState
              icon={LifeBuoy}
              title="Não foi possível carregar os chamados"
              description="Falha ao buscar os dados. Tente novamente."
              action={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Tentar novamente
                </Button>
              }
            />
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : chamados.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="Nenhum chamado aberto"
              description="Quando precisar de ajuda, abra um chamado — a equipe da plataforma responde por aqui."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atualizado em</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {chamados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.assunto}
                      {c.ultima_mensagem_de_super_admin && c.status !== "fechado" && (
                        <Badge variant="secondary" className="ml-2">
                          Nova resposta
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{PRIORIDADE_LABEL[c.prioridade]}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{dataHora(c.atualizado_em)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/painel/chamados/$id" params={{ id: c.id }}>
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
