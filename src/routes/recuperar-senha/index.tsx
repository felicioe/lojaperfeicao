import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { solicitarRecuperacaoSenha } from "@/lib/backend/recuperacao-senha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

// Pedido de recuperação de senha self-service (issue #364) — rota pública
// de propósito, fora de /_authenticated: quem chega aqui não consegue
// entrar, é exatamente o problema que a tela resolve.
export const Route = createFileRoute("/recuperar-senha/")({
  head: () => ({ meta: [{ title: "Recuperar senha — Gestão Maçônica" }] }),
  component: RecuperarSenha,
});

function RecuperarSenha() {
  const [login, setLogin] = useState("");
  const [enviando, setEnviando] = useState(false);
  // null = formulário ainda não enviado; depois disso, sempre a MESMA
  // mensagem genérica de sucesso aparente, exista ou não o login, tenha ou
  // não e-mail cadastrado — só o backend sabe a diferença, e ela nunca
  // chega no HTTP (decisão explícita da issue #364, contra enumeração de
  // usuários).
  const [enviado, setEnviado] = useState(false);

  const solicitar = async () => {
    if (!login.trim()) return;
    setEnviando(true);
    try {
      await solicitarRecuperacaoSenha({ data: { login: login.trim() } });
      setEnviado(true);
    } catch {
      // Erro de rede/servidor genuíno (não "login não encontrado" — isso o
      // backend absorve em { enviado: false }, sem lançar). Mesmo assim não
      // é motivo pra distinguir da tela de sucesso: só reduz o incentivo de
      // ficar tentando login por login pra ver qual dá erro diferente.
      setEnviado(true);
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
          <CardTitle className="text-2xl">Recuperar senha</CardTitle>
          <CardDescription>
            {enviado
              ? "Confira sua caixa de entrada"
              : "Informe seu e-mail ou login para receber um link de redefinição."}
          </CardDescription>
        </CardHeader>

        {enviado ? (
          <CardContent className="space-y-4 text-center">
            <MailCheck className="mx-auto h-10 w-10 text-primary" />
            <p className="text-sm text-muted-foreground">
              Se <strong>{login.trim()}</strong> tiver um e-mail de contato cadastrado, enviamos um
              link de redefinição de senha — ele vale por 30 minutos. Se não chegar nada em alguns
              minutos (confira o spam também), procure o administrador da sua Loja.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar para a tela de entrada
              </Link>
            </Button>
          </CardContent>
        ) : (
          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              solicitar();
            }}
          >
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="recuperar-login">E-mail ou login</Label>
                <Input
                  id="recuperar-login"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  placeholder="seu@email.com ou nome.sobrenome"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Enviar link de redefinição
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/auth">
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar para a tela de entrada
                </Link>
              </Button>
            </CardContent>
          </form>
        )}
      </Card>
    </div>
  );
}
