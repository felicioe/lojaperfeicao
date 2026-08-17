import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listarLojas,
  salvarLoja,
  definirLojaAtiva,
  listarAuditoriaPlataforma,
  type LojaResumo,
} from "@/lib/backend/saas-lojas";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { mensagemDeErro } from "@/lib/erro";
import { Building2, Loader2, Pencil, Plus, Power, PowerOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-saas/lojas")({
  head: () => ({ meta: [{ title: "Lojas — Plataforma" }] }),
  component: LojasPlataforma,
});

const FORM_VAZIO = { id: null as string | null, slug: "", nome: "", razaoSocial: "", cnpj: "" };

const ACAO_LABEL: Record<string, string> = {
  criar_loja: "Loja cadastrada",
  editar_loja: "Loja editada",
  suspender_loja: "Loja suspensa",
  reativar_loja: "Loja reativada",
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function LojasPlataforma() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState<LojaResumo | null>(null);

  const { data: lojas = [], isLoading } = useQuery({
    queryKey: ["saas-lojas"],
    queryFn: () => listarLojas(),
  });
  const { data: eventos = [] } = useQuery({
    queryKey: ["saas-auditoria"],
    queryFn: () => listarAuditoriaPlataforma(),
  });

  const ord = useOrdenacao(lojas, {
    nome: (l) => l.nome,
    slug: (l) => l.slug,
    usuarios: (l) => l.usuarios_ativos,
    ultimo: (l) => l.ultimo_acesso,
    situacao: (l) => (l.ativa ? 1 : 0),
  });

  const atualizar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["saas-lojas"] }),
      queryClient.invalidateQueries({ queryKey: ["saas-auditoria"] }),
    ]);
  };

  const abrirNova = () => {
    setForm(FORM_VAZIO);
    setAberto(true);
  };

  const abrirEdicao = (l: LojaResumo) => {
    setForm({
      id: l.id,
      slug: l.slug,
      nome: l.nome,
      razaoSocial: l.razao_social ?? "",
      cnpj: l.cnpj ?? "",
    });
    setAberto(true);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarLoja({ data: form });
      toast.success(form.id ? "Loja atualizada." : "Loja cadastrada.");
      setAberto(false);
      await atualizar();
    } catch (err) {
      toast.error(mensagemDeErro(err, "Erro ao salvar a Loja."));
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtiva = async (l: LojaResumo) => {
    try {
      await definirLojaAtiva({ data: { id: l.id, ativa: !l.ativa } });
      toast.success(l.ativa ? "Loja suspensa." : "Loja reativada.");
      await atualizar();
    } catch (err) {
      toast.error(mensagemDeErro(err, "Erro ao alterar a situação da Loja."), { duration: 12000 });
    } finally {
      setConfirmar(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lojas"
        description="Cadastro das Lojas atendidas pela plataforma. Esta tela não dá acesso aos dados internos de nenhuma delas."
        actions={
          <Button onClick={abrirNova}>
            <Plus className="h-4 w-4 mr-1" /> Nova Loja
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> {lojas.length} Loja(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="nome" ord={ord}>
                    Loja
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="slug" ord={ord}>
                    Endereço
                  </TableHeadOrdenavel>
                  <TableHead>CNPJ</TableHead>
                  <TableHeadOrdenavel campo="usuarios" ord={ord} className="text-right">
                    Usuários
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="ultimo" ord={ord}>
                    Último acesso
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="situacao" ord={ord}>
                    Situação
                  </TableHeadOrdenavel>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ord.itensOrdenados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Nenhuma Loja cadastrada.
                    </TableCell>
                  </TableRow>
                )}
                {ord.itensOrdenados.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.nome}
                      {l.razao_social && (
                        <div className="text-xs text-muted-foreground">{l.razao_social}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.slug}</TableCell>
                    <TableCell className="text-xs">{l.cnpj ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.usuarios_ativos}
                      {/* Sem administrador ninguém consegue gerir a Loja por
                          dentro — é o estado normal logo após o cadastro, até
                          o convite ser aceito (parte 2 da issue #339). */}
                      {l.administradores === 0 && (
                        <div className="text-xs text-amber-600 dark:text-amber-500">sem admin</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.ultimo_acesso ? dataHora(l.ultimo_acesso) : "nunca"}
                    </TableCell>
                    <TableCell>
                      {l.ativa ? (
                        <Badge variant="secondary">Ativa</Badge>
                      ) : (
                        <Badge variant="destructive">Suspensa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(l)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar {l.nome}</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmar(l)}>
                        {l.ativa ? (
                          <PowerOff className="h-4 w-4 text-destructive" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {l.ativa ? "Suspender" : "Reativar"} {l.nome}
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico da plataforma</CardTitle>
        </CardHeader>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {eventos.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                  <span className="tabular-nums">{dataHora(e.criado_em)}</span>
                  <span className="text-foreground">{ACAO_LABEL[e.acao] ?? e.acao}</span>
                  {e.loja_nome && <span className="text-foreground">— {e.loja_nome}</span>}
                  {e.usuario_email && <span>por {e.usuario_email}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Loja" : "Nova Loja"}</DialogTitle>
            <DialogDescription>
              O cadastro cria a Loja vazia. O convite do primeiro administrador dela ainda é feito à
              mão nesta fase.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Loja de Perfeição Adonhiram"
                autoComplete="off"
              />
            </div>
            <div>
              <Label>Endereço de acesso</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="adonhiram"
                autoComplete="off"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Vira o subdomínio da Loja. Só letras minúsculas, números e hífen.
              </p>
            </div>
            <div>
              <Label>Razão social (opcional)</Label>
              <Input
                value={form.razaoSocial}
                onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div>
              <Label>CNPJ (opcional)</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0001-00"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.ativa ? "Suspender" : "Reativar"} {confirmar?.nome}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.ativa
                ? `Suspender bloqueia o acesso de todos os ${confirmar.usuarios_ativos} usuário(s) desta Loja imediatamente, inclusive quem já estiver com a sessão aberta. Os dados continuam guardados e voltam ao reativar.`
                : "Reativar devolve o acesso a todos os usuários ativos desta Loja."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmar && alternarAtiva(confirmar)}>
              {confirmar?.ativa ? "Suspender" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
