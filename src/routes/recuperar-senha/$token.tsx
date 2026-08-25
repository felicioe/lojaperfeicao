import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { verificarTokenRecuperacao, redefinirSenhaComToken } from "@/lib/backend/recuperacao-senha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mensagemDeErro } from "@/lib/erro";
import { Loader2 } from "lucide-react";

// Redefinição de senha a partir do link recebido por e-mail (issue #364) —
// rota pública de propósito, fora de /_authenticated: quem chega aqui não
// tem sessão nenhuma. O que autoriza é o token, não login algum (ver
// recuperacao-senha.ts).
export const Route = createFileRoute("/recuperar-senha/$token")({
  head: () => ({ meta: [{ title: "Redefinir senha — Gestão Maçônica" }] }),
  component: RedefinirComToken,
});

const SENHA_MINIMA = 8;

function RedefinirComToken() {
  const { token } = Route.useParams();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const { isLoading, error } = useQuery({
    queryKey: ["recuperar-senha-token", token],
    queryFn: () => verificarTokenRecuperacao({ data: { token } }),
    // Link inválido/expirado não melhora com insistência.
    retry: false,
  });

  const redefinir = async () => {
    if (senha.length < SENHA_MINIMA) {
      return toast.error(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    }
    if (senha !== confirmacao) return toast.error("As senhas não conferem.");
    setEnviando(true);
    try {
      await redefinirSenhaComToken({ data: { token, novaSenha: senha } });
      setConcluido(true);
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível redefinir a senha."), { duration: 10000 });
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
            {concluido ? "Senha redefinida" : "Redefinir senha"}
          </CardTitle>
          <CardDescription>
            {concluido
              ? "Sua senha foi alterada. Entre com ela a partir de agora."
              : error
                ? "Este link não abre mais uma redefinição."
                : isLoading
                  ? "Verificando o link…"
                  : "Escolha sua nova senha."}
          </CardDescription>
        </CardHeader>

        {isLoading && (
          <CardContent className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        )}

        {concluido && (
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/auth">Ir para a tela de entrada</Link>
            </Button>
          </CardContent>
        )}

        {error && !concluido && (
          <CardContent className="space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {mensagemDeErro(error, "Este link não é mais válido.")}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/recuperar-senha">Pedir um novo link</Link>
            </Button>
          </CardContent>
        )}

        {!isLoading && !error && !concluido && (
          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              redefinir();
            }}
          >
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  autoComplete="new-password"
                  minLength={SENHA_MINIMA}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Pelo menos {SENHA_MINIMA} caracteres.
                </p>
              </div>
              <div>
                <Label htmlFor="confirmar-senha">Confirmar senha</Label>
                <Input
                  id="confirmar-senha"
                  type="password"
                  autoComplete="new-password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Redefinir senha
              </Button>
            </CardContent>
          </form>
        )}
      </Card>
    </div>
  );
}
