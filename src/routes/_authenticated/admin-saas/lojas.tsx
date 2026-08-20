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
import {
  convidarAdminLoja,
  reenviarConviteLoja,
  revogarConviteLoja,
  type ResultadoConvite,
  type SituacaoConvite,
} from "@/lib/backend/saas-convites";
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
import {
  AlertTriangle,
  Building2,
  Copy,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  X,
} from "lucide-react";

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
  convidar_admin_loja: "Convite enviado",
  reenviar_convite_loja: "Convite reenviado",
  revogar_convite_loja: "Convite cancelado",
  aceitar_convite_loja: "Convite aceito",
};

const CONVITE_LABEL: Record<SituacaoConvite, string> = {
  pendente: "Convite pendente",
  aceito: "Convite aceito",
  revogado: "Convite cancelado",
  expirado: "Convite expirado",
};

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function LojasPlataforma() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState<LojaResumo | null>(null);
  const [convidando, setConvidando] = useState<LojaResumo | null>(null);
  const [convite, setConvite] = useState({ email: "", nomeCompleto: "" });
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  // Resultado do último convite emitido: fica na tela até ser fechado porque
  // contém o link, que é a única cópia — o token não é recuperável depois
  // (o banco guarda só o hash).
  const [resultado, setResultado] = useState<(ResultadoConvite & { loja: string }) | null>(null);
  const [revogando, setRevogando] = useState<LojaResumo | null>(null);

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

  const abrirConvite = (l: LojaResumo) => {
    setConvite({ email: "", nomeCompleto: "" });
    setConvidando(l);
  };

  // Um só caminho para os três resultados possíveis (enviado, enviado com
  // falha de SMTP, e reenvio), porque a conduta é a mesma: guardar o link e
  // dizer se o e-mail saiu.
  const mostrarResultado = (r: ResultadoConvite, lojaNome: string) => {
    setResultado({ ...r, loja: lojaNome });
    if (r.enviado) toast.success("Convite enviado por e-mail.");
    else
      toast.warning("Convite criado, mas o e-mail não saiu — copie o link.", { duration: 12000 });
  };

  const enviarConvite = async () => {
    if (!convidando) return;
    setEnviandoConvite(true);
    try {
      const r = await convidarAdminLoja({ data: { ...convite, lojaId: convidando.id } });
      setConvidando(null);
      mostrarResultado(r, convidando.nome);
      await atualizar();
    } catch (err) {
      toast.error(mensagemDeErro(err, "Erro ao enviar o convite."), { duration: 12000 });
    } finally {
      setEnviandoConvite(false);
    }
  };

  const reenviar = async (l: LojaResumo) => {
    if (!l.convite) return;
    try {
      const r = await reenviarConviteLoja({ data: { conviteId: l.convite.id } });
      mostrarResultado(r, l.nome);
      await atualizar();
    } catch (err) {
      toast.error(mensagemDeErro(err, "Erro ao reenviar o convite."), { duration: 12000 });
    }
  };

  const revogar = async (l: LojaResumo) => {
    if (!l.convite) return;
    try {
      await revogarConviteLoja({ data: { conviteId: l.convite.id } });
      toast.success("Convite cancelado. O link deixou de funcionar.");
      await atualizar();
    } catch (err) {
      toast.error(mensagemDeErro(err, "Erro ao cancelar o convite."), { duration: 12000 });
    } finally {
      setRevogando(null);
    }
  };

  const copiarLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      // Área de transferência bloqueada (http sem localhost, permissão negada):
      // o link continua visível e selecionável na tela.
      toast.error("Não foi possível copiar — selecione o link e copie à mão.");
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

      {/* O aviso é o oposto de decorativo: esta tela deixa a um clique de
          distância exatamente a ação que o sistema ainda não sustenta. O
          isolamento entre Lojas está pela metade (issue #337 — Tesouraria
          pronta, Cadastros/Relatórios/Contabilidade/Atividades/SGCAB não), e
          medido ao vivo: o admin de uma Loja nova enxerga a Tesouraria dela
          vazia, como deve, mas a tela de Irmãos mostra os irmãos da Adonhiram.
          Some quando a #337 fechar. */}
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <p className="flex items-start gap-2 font-medium">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />O
          isolamento entre Lojas ainda não está completo.
        </p>
        <p className="mt-1 text-muted-foreground">
          Cadastrar uma segunda Loja e convidar o administrador dela funciona, mas as telas de
          Cadastros, Relatórios, Contabilidade, Atividades e SGCAB ainda não filtram por Loja — quem
          entrar na Loja nova vai ver dados da Adonhiram nelas. Use por enquanto só para testes, não
          com uma Loja real.
        </p>
      </div>

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
                  <TableHead>Administrador</TableHead>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
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
                    <TableCell className="text-right tabular-nums">{l.usuarios_ativos}</TableCell>
                    {/* Sem administrador ninguém consegue gerir a Loja por
                        dentro — é o estado normal logo após o cadastro, até o
                        convite ser aceito. */}
                    <TableCell className="text-xs">
                      {l.administradores > 0 ? (
                        <span className="text-muted-foreground">
                          {l.administradores} administrador(es)
                        </span>
                      ) : l.convite && l.convite.situacao !== "aceito" ? (
                        <div className="space-y-1">
                          <Badge
                            variant={l.convite.situacao === "pendente" ? "secondary" : "outline"}
                          >
                            {CONVITE_LABEL[l.convite.situacao]}
                          </Badge>
                          <div className="text-muted-foreground">{l.convite.email}</div>
                          {l.convite.situacao === "pendente" && (
                            <div className="text-muted-foreground">
                              vale até {data(l.convite.expira_em)}
                            </div>
                          )}
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => reenviar(l)}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" /> Reenviar
                            </Button>
                            {l.convite.situacao === "pendente" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setRevogando(l)}
                              >
                                <X className="h-3 w-3 mr-1" /> Cancelar
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="text-amber-600 dark:text-amber-500">sem admin</span>
                          <div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => abrirConvite(l)}
                            >
                              <Mail className="h-3 w-3 mr-1" /> Convidar
                            </Button>
                          </div>
                        </div>
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
              {form.id
                ? "Alterar o endereço de acesso muda o subdomínio da Loja — quem já usa o endereço antigo deixa de encontrá-la."
                : "O cadastro cria a Loja vazia. Depois de salvar, convide o primeiro administrador dela pela coluna Administrador."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="lojas-nome-2">Nome</Label>
              <Input
                id="lojas-nome-2"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Loja de Perfeição Adonhiram"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="lojas-endereco-de-acesso">Endereço de acesso</Label>
              <Input
                id="lojas-endereco-de-acesso"
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
              <Label htmlFor="lojas-razao-social-opcional">Razão social (opcional)</Label>
              <Input
                id="lojas-razao-social-opcional"
                value={form.razaoSocial}
                onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="lojas-cnpj-opcional">CNPJ (opcional)</Label>
              <Input
                id="lojas-cnpj-opcional"
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

      <Dialog open={!!convidando} onOpenChange={(o) => !o && setConvidando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar administrador de {convidando?.nome}</DialogTitle>
            <DialogDescription>
              Quem receber o convite define a própria senha e vira administrador desta Loja. O
              convite vale por 7 dias e só pode ser usado uma vez. Esta tela continua sem acesso aos
              dados internos da Loja.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="lojas-nome">Nome</Label>
              <Input
                id="lojas-nome"
                value={convite.nomeCompleto}
                onChange={(e) => setConvite({ ...convite, nomeCompleto: e.target.value })}
                placeholder="Nome de quem vai administrar"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="lojas-e-mail">E-mail</Label>
              <Input
                id="lojas-e-mail"
                type="email"
                value={convite.email}
                onChange={(e) => setConvite({ ...convite, email: e.target.value })}
                placeholder="admin@loja.org.br"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Vira o login desta pessoa. Precisa ser um e-mail que ainda não seja login em nenhuma
                Loja.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvidando(null)}>
              Cancelar
            </Button>
            <Button onClick={enviarConvite} disabled={enviandoConvite}>
              {enviandoConvite && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resultado} onOpenChange={(o) => !o && setResultado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convite de {resultado?.loja}</DialogTitle>
            <DialogDescription>
              {resultado?.enviado
                ? "O e-mail saiu. Guarde o link abaixo como reserva — ele não aparece de novo depois que esta janela fechar."
                : "O convite foi criado, mas o e-mail não saiu. Entregue o link abaixo por outro meio — ele não aparece de novo depois que esta janela fechar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={resultado?.link ?? ""} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => resultado && copiarLink(resultado.link)}
              >
                <Copy className="h-4 w-4" />
                <span className="sr-only">Copiar link</span>
              </Button>
            </div>
            {resultado?.erroEnvio && (
              <p className="text-xs text-destructive">
                Erro do servidor de e-mail: {resultado.erroEnvio}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setResultado(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revogando} onOpenChange={(o) => !o && setRevogando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o convite de {revogando?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O link enviado para {revogando?.convite?.email} deixa de funcionar na hora. A Loja
              fica sem administrador até um novo convite ser aceito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => revogando && revogar(revogando)}>
              Cancelar convite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
