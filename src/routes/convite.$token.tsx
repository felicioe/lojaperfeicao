import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { verificarConvite, aceitarConvite } from "@/lib/backend/saas-convites";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mensagemDeErro } from "@/lib/erro";
import { Loader2 } from "lucide-react";

// Aceite do convite de administrador de uma Loja (issue #339, parte 2).
//
// Rota pública de propósito — fora de /_authenticated: quem chega aqui ainda
// não tem conta, e é justamente esta tela que cria a primeira conta da Loja. O
// que autoriza não é sessão nenhuma, é o token do link (ver saas-convites.ts).
export const Route = createFileRoute("/convite/$token")({
  head: () => ({ meta: [{ title: "Convite — Gestão Maçônica" }] }),
  component: AceitarConvite,
});

const SENHA_MINIMA = 8;

function AceitarConvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [aceiteLgpd, setAceiteLgpd] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const {
    data: convite,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["convite", token],
    queryFn: async () => {
      const aberto = await verificarConvite({ data: { token } });
      // O nome vem preenchido com o que o super-admin escreveu no convite, mas
      // editável: quem sabe escrever o próprio nome é a pessoa, não quem
      // convidou.
      setNome((atual) => atual || aberto.nomeCompleto);
      return aberto;
    },
    // Link inválido/expirado não melhora com insistência, e cada tentativa é
    // uma busca por hash de token no banco.
    retry: false,
  });

  const aceitar = async () => {
    if (senha.length < SENHA_MINIMA) {
      return toast.error(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    }
    if (senha !== confirmacao) return toast.error("As senhas não conferem.");
    setEnviando(true);
    try {
      const sessao = await aceitarConvite({
        data: { token, nomeCompleto: nome, senha, aceiteLgpd },
      });
      // Entra já logado: a pessoa acabou de provar que controla o e-mail do
      // convite e de escolher a senha — mandá-la para a tela de login para
      // digitar tudo de novo não acrescenta nada.
      queryClient.setQueryData(SESSAO_QUERY_KEY, sessao);
      toast.success("Acesso criado. Bem-vindo(a)!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível aceitar o convite."), { duration: 10000 });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif text-xl mb-2">
            ⚜
          </div>
          <CardTitle className="text-2xl">
            {convite ? `Administrar ${convite.lojaNome}` : "Convite"}
          </CardTitle>
          <CardDescription>
            {convite
              ? `Convite enviado para ${convite.email}. Defina sua senha para criar o acesso.`
              : error
                ? "Este link não abre mais um cadastro."
                : "Verificando o convite…"}
          </CardDescription>
        </CardHeader>

        {isLoading && (
          <CardContent className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        )}

        {error && (
          <CardContent className="space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {mensagemDeErro(error, "Este convite não é mais válido.")}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">Ir para a tela de entrada</Link>
            </Button>
          </CardContent>
        )}

        {convite && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              aceitar();
            }}
          >
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="convite-nome">Seu nome</Label>
                <Input
                  id="convite-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="convite-senha">Senha</Label>
                <Input
                  id="convite-senha"
                  type="password"
                  autoComplete="new-password"
                  minLength={SENHA_MINIMA}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Pelo menos {SENHA_MINIMA} caracteres. É a senha de administrador da Loja.
                </p>
              </div>
              <div>
                <Label htmlFor="convite-confirmacao">Confirmar senha</Label>
                <Input
                  id="convite-confirmacao"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  id="convite-lgpd"
                  checked={aceiteLgpd}
                  onCheckedChange={(v) => setAceiteLgpd(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <Label
                    htmlFor="convite-lgpd"
                    className="text-xs font-normal text-muted-foreground"
                  >
                    Li e aceito a
                  </Label>{" "}
                  <Link to="/privacidade" target="_blank" className="underline underline-offset-2">
                    Política de Privacidade
                  </Link>
                  .
                </span>
              </div>
              <Button type="submit" className="w-full" disabled={enviando || !aceiteLgpd}>
                {enviando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Criar meu acesso
              </Button>
              <p className="text-xs text-muted-foreground">
                Seu login será <strong>{convite.email}</strong>.
              </p>
            </CardContent>
          </form>
        )}
      </Card>
    </div>
  );
}
