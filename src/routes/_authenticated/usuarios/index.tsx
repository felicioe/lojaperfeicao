import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarUsuarios,
  listarIrmaosSemAcesso,
  criarAcessoIrmao,
  criarAcessosEmLote,
  atualizarPapeisUsuario,
  redefinirSenhaUsuario,
  alternarAtivoUsuario,
  TODOS_PAPEIS,
  type UsuarioAdmin,
} from "@/lib/backend/usuarios";
import type { Papel } from "@/lib/backend/auth";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ROLE_LABEL } from "@/lib/format";
import {
  ShieldAlert,
  KeyRound,
  UserPlus,
  ShieldCheck,
  UserX,
  UserCheck,
  Dices,
} from "lucide-react";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

// Gerador client-side (Web Crypto — sem depender de nada do backend, que
// carrega mysql2/bcrypt e não pode ser importado no bundle do navegador).
// Mesmo alfabeto do gerador do servidor (gerarSenhaTemporaria em
// usuarios.ts): sem 0/O/1/l/I pra não confundir na hora de digitar. Só usada
// aqui pra sugerir um valor no campo de redefinição — quem decide o valor
// final que vai pro servidor continua sendo o admin, editável antes de
// enviar.
const SENHA_TEMP_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function gerarSenhaAleatoriaCliente(tamanho = 10): string {
  const valores = new Uint32Array(tamanho);
  crypto.getRandomValues(valores);
  return Array.from(valores, (v) => SENHA_TEMP_CHARSET[v % SENHA_TEMP_CHARSET.length]).join("");
}

type CredencialCriada = { nome: string; login: string; senha: string };

export const Route = createFileRoute("/_authenticated/usuarios/")({
  beforeLoad: ({ context }) => {
    if (!context.usuario?.papeis.includes("admin")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Usuários — Gestão Maçônica" }] }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const qc = useQueryClient();
  const [obrigarTrocaNovosAcessos, setObrigarTrocaNovosAcessos] = useState(true);
  const [enviarBoasVindasNovosAcessos, setEnviarBoasVindasNovosAcessos] = useState(false);
  const [credenciaisCriadas, setCredenciaisCriadas] = useState<CredencialCriada[] | null>(null);

  const usuarios = useQuery({ queryKey: ["usuarios"], queryFn: () => listarUsuarios() });
  const semAcesso = useQuery({
    queryKey: ["irmaos_sem_acesso"],
    queryFn: () => listarIrmaosSemAcesso(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["usuarios"] });
    qc.invalidateQueries({ queryKey: ["irmaos_sem_acesso"] });
  };

  const ordSemAcesso = useOrdenacao(semAcesso.data ?? [], {
    nome: (i) => i.nome_civil,
    login: (i) => i.loginSugerido,
  });

  const ord = useOrdenacao(usuarios.data ?? [], {
    usuario: (u) => u.email,
    nome: (u) => u.nome_completo,
    papeis: (u) => u.papeis.slice().sort().join(","),
    irmao: (u) => u.irmao?.nome_civil,
    status: (u) => (u.ativo ? 1 : 0),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  const criarUm = async (irmaoId: string, nomeCivil: string) => {
    try {
      const { login, senha } = await criarAcessoIrmao({
        data: {
          irmaoId,
          obrigarTrocaSenha: obrigarTrocaNovosAcessos,
          enviarBoasVindas: enviarBoasVindasNovosAcessos,
        },
      });
      setCredenciaisCriadas([{ nome: nomeCivil, login, senha }]);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar acesso.");
    }
  };

  const criarTodos = async () => {
    try {
      const relatorio = await criarAcessosEmLote({
        data: {
          obrigarTrocaSenha: obrigarTrocaNovosAcessos,
          enviarBoasVindas: enviarBoasVindasNovosAcessos,
        },
      });
      if (relatorio.criados.length > 0) setCredenciaisCriadas(relatorio.criados);
      if (relatorio.falhas.length > 0) {
        // mesmo motivo pra todo mundo (ex.: procedure ausente) é o caso comum
        // — mostra só uma vez em vez de repetir a mesma frase 27 vezes.
        const motivos = [...new Set(relatorio.falhas.map((f) => f.motivo))];
        const nomes = relatorio.falhas.map((f) => f.nome).join(", ");
        toast.error(`${relatorio.falhas.length} falha(s) — ${motivos.join("; ")}`, {
          description: nomes,
          duration: 15000,
        });
      }
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar acessos.");
    }
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Gerencie logins, papéis e senhas sem precisar acessar o banco de dados diretamente."
      />

      <Alert className="mb-6">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Login gerado e senha temporária</AlertTitle>
        <AlertDescription>
          Acessos criados por aqui usam <strong>nome.sobrenome</strong> como login (gerado a partir
          do nome civil, sem precisar de e-mail) e uma senha temporária aleatória, diferente para
          cada pessoa e mostrada uma única vez no momento da criação.
        </AlertDescription>
      </Alert>

      {(semAcesso.data ?? []).length > 0 && (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <CardTitle className="text-base">
                Irmãos sem acesso ({semAcesso.data?.length})
              </CardTitle>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={obrigarTrocaNovosAcessos}
                  onCheckedChange={(v) => setObrigarTrocaNovosAcessos(v === true)}
                />
                Obrigar troca de senha no primeiro acesso
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={enviarBoasVindasNovosAcessos}
                  onCheckedChange={(v) => setEnviarBoasVindasNovosAcessos(v === true)}
                />
                Enviar e-mail de boas-vindas (login e senha)
              </label>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-1.5 h-4 w-4" /> Criar acesso para todos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Criar acesso para {semAcesso.data?.length} irmão(s)?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Vai criar um login (nome.sobrenome) e uma senha temporária aleatória para cada
                    irmão da lista abaixo
                    {obrigarTrocaNovosAcessos ? ", com troca obrigatória no primeiro acesso" : ""}
                    {enviarBoasVindasNovosAcessos
                      ? ". Um e-mail de boas-vindas será enviado para quem tiver e-mail cadastrado."
                      : "."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={criarTodos}>Criar acessos</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="nome" ord={ordSemAcesso}>
                    Nome
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel
                    campo="login"
                    ord={ordSemAcesso}
                    className="hidden sm:table-cell"
                  >
                    Login sugerido
                  </TableHeadOrdenavel>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordSemAcesso.itensOrdenados.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">
                      {i.nome_civil}
                      <div className="font-mono text-xs text-muted-foreground sm:hidden">
                        {i.loginSugerido}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-sm text-muted-foreground">
                      {i.loginSugerido}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => criarUm(i.id, i.nome_civil)}
                      >
                        Criar acesso
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Usuários cadastrados ({usuarios.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="usuario" ord={ord}>
                  Usuário
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="nome" ord={ord} className="hidden sm:table-cell">
                  Nome
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="papeis" ord={ord} className="hidden sm:table-cell">
                  Papéis
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="irmao" ord={ord} className="hidden lg:table-cell">
                  Irmão vinculado
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="status" ord={ord}>
                  Status
                </TableHeadOrdenavel>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usuarios.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              )}
              {itensPagina.map((u) => (
                <UsuarioRow key={u.id} usuario={u} onChanged={invalidate} />
              ))}
            </TableBody>
          </Table>
          <TabelaPaginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            totalItens={totalItens}
            tamanhoPagina={tamanhoPagina}
            setPagina={setPagina}
          />
        </CardContent>
      </Card>

      <Dialog
        open={credenciaisCriadas !== null}
        onOpenChange={(v) => !v && setCredenciaisCriadas(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {credenciaisCriadas && credenciaisCriadas.length > 1
                ? `${credenciaisCriadas.length} acessos criados`
                : "Acesso criado"}
            </DialogTitle>
            <DialogDescription>
              Anote ou copie agora — a senha não fica salva em lugar nenhum além do hash e não vai
              aparecer de novo.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Senha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credenciaisCriadas?.map((c) => (
                  <TableRow key={c.login}>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell className="font-mono text-sm">{c.login}</TableCell>
                    <TableCell className="font-mono text-sm">{c.senha}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredenciaisCriadas(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UsuarioRow({ usuario, onChanged }: { usuario: UsuarioAdmin; onChanged: () => void }) {
  const [papeisOpen, setPapeisOpen] = useState(false);
  const [senhaOpen, setSenhaOpen] = useState(false);
  // usuario.papeis pode trazer "super_admin" (issue #339) — é papel de
  // plataforma, não desta Loja, e não é uma das opções do diálogo (só
  // TODOS_PAPEIS). Sem filtrar aqui, o Salvar reenviava "super_admin" pro
  // servidor e o Zod rejeitava a chamada inteira com um erro técnico, antes
  // até da checagem amigável de ehAlvoSuperAdmin em atualizarPapeisUsuario
  // rodar.
  const [papeisSelecionados, setPapeisSelecionados] = useState<Papel[]>(
    usuario.papeis.filter((p) => TODOS_PAPEIS.includes(p)),
  );
  const [novaSenha, setNovaSenha] = useState("");
  const [obrigarTroca, setObrigarTroca] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const abrirPapeis = () => {
    setPapeisSelecionados(usuario.papeis.filter((p) => TODOS_PAPEIS.includes(p)));
    setPapeisOpen(true);
  };

  const togglePapel = (papel: Papel) => {
    setPapeisSelecionados((prev) =>
      prev.includes(papel) ? prev.filter((p) => p !== papel) : [...prev, papel],
    );
  };

  const salvarPapeis = async () => {
    setSalvando(true);
    try {
      await atualizarPapeisUsuario({ data: { usuarioId: usuario.id, papeis: papeisSelecionados } });
      toast.success("Papéis atualizados.");
      setPapeisOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar papéis.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarSenha = async (senha: string) => {
    if (!senha) return toast.error("Informe uma senha.");
    setSalvando(true);
    try {
      await redefinirSenhaUsuario({
        data: { usuarioId: usuario.id, novaSenha: senha, obrigarTrocaSenha: obrigarTroca },
      });
      toast.success("Senha redefinida.");
      setSenhaOpen(false);
      setNovaSenha("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao redefinir senha.");
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (ativo: boolean) => {
    setSalvando(true);
    try {
      await alternarAtivoUsuario({ data: { usuarioId: usuario.id, ativo } });
      toast.success(ativo ? "Usuário reativado." : "Usuário inativado.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        {usuario.email}
        <div className="text-xs font-normal text-muted-foreground sm:hidden">
          {usuario.nome_completo ?? "—"}
          {usuario.papeis.length > 0
            ? ` · ${usuario.papeis.map((p) => ROLE_LABEL[p]).join(", ")}`
            : ""}
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">{usuario.nome_completo ?? "—"}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          {usuario.papeis.map((p) => (
            <Badge key={p} variant="outline">
              {ROLE_LABEL[p]}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell text-muted-foreground">
        {usuario.irmao?.nome_civil ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge variant={usuario.ativo ? "secondary" : "outline"}>
            {usuario.ativo ? "Ativo" : "Inativo"}
          </Badge>
          {usuario.deve_trocar_senha && (
            <Badge variant="outline" className="gap-1 text-warning-foreground">
              <KeyRound className="h-3 w-3" /> Senha pendente de troca
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={abrirPapeis} title="Editar papéis">
            <ShieldCheck className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSenhaOpen(true)}
            title="Redefinir senha"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          {usuario.ativo ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" title="Inativar usuário" disabled={salvando}>
                  <UserX className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Inativar {usuario.email}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A pessoa não vai mais conseguir entrar no sistema (e qualquer sessão já aberta é
                    encerrada). O cadastro e o histórico continuam intactos — dá para reativar a
                    qualquer momento.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => alternarAtivo(false)}>
                    Inativar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => alternarAtivo(true)}
              title="Reativar usuário"
              disabled={salvando}
            >
              <UserCheck className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Dialog open={papeisOpen} onOpenChange={setPapeisOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Papéis de {usuario.email}</DialogTitle>
              <DialogDescription>
                Define o que essa pessoa pode ver e fazer no sistema.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {TODOS_PAPEIS.map((papel) => (
                <label key={papel} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={papeisSelecionados.includes(papel)}
                    onCheckedChange={() => togglePapel(papel)}
                  />
                  {ROLE_LABEL[papel]}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPapeisOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarPapeis} disabled={salvando || papeisSelecionados.length === 0}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={senhaOpen}
          onOpenChange={(v) => {
            setSenhaOpen(v);
            if (!v) {
              setNovaSenha("");
              setObrigarTroca(true);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redefinir senha de {usuario.email}</DialogTitle>
              <DialogDescription>
                A pessoa vai precisar da nova senha para o próximo login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Digite ou gere uma senha"
              />
              <Button
                type="button"
                variant="link"
                className="h-auto gap-1 p-0 text-xs"
                onClick={() => setNovaSenha(gerarSenhaAleatoriaCliente())}
              >
                <Dices className="h-3 w-3" /> Gerar senha aleatória
              </Button>
            </div>
            <div className="space-y-2">
              <Label id="depois-definida-label">Depois de definida</Label>
              <RadioGroup
                aria-labelledby="depois-definida-label"
                value={obrigarTroca ? "obrigar" : "fixar"}
                onValueChange={(v) => setObrigarTroca(v === "obrigar")}
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="obrigar" /> Obrigar troca no primeiro acesso (senha
                  temporária)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="fixar" /> Fixar esta senha (permanente)
                </label>
              </RadioGroup>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSenhaOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => salvarSenha(novaSenha)} disabled={salvando}>
                Redefinir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
