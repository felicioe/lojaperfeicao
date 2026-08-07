import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { login, signup, contarUsuarios, getSessao } from "@/lib/backend/auth";
import { iniciarLoginPasskey, confirmarLoginPasskey } from "@/lib/backend/passkeys";
import { confirmarLogin2FA } from "@/lib/backend/totp";
import { iniciarLoginGoogle } from "@/lib/backend/google-auth";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Fingerprint, ShieldCheck } from "lucide-react";

const ERRO_GOOGLE_LABEL: Record<string, string> = {
  cancelado: "Login com Google cancelado.",
  expirado: "Sessão do login com Google expirou — tente novamente.",
  nao_vinculado:
    "Sua conta Google ainda não está vinculada. Entre com sua senha e vincule em Segurança da Conta.",
  nao_configurado: "Login com Google não está disponível no momento.",
  falha_token: "Não foi possível confirmar o login com Google.",
};

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Gestão Maçônica" },
      { name: "description", content: "Acesso restrito ao sistema de gestão da loja." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [firstUser, setFirstUser] = useState<boolean | null>(null);
  const [aceiteLgpd, setAceiteLgpd] = useState(false);
  const [webauthnDisponivel, setWebauthnDisponivel] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [aguardando2FA, setAguardando2FA] = useState(false);
  const [codigo2FA, setCodigo2FA] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    contarUsuarios().then((total) => setFirstUser(total === 0));
    getSessao().then((usuario) => {
      if (usuario) navigate({ to: "/dashboard" });
    });
    setWebauthnDisponivel(browserSupportsWebAuthn());

    const erroGoogle = new URLSearchParams(window.location.search).get("erroGoogle");
    if (erroGoogle) {
      toast.error(ERRO_GOOGLE_LABEL[erroGoogle] ?? "Erro ao entrar com Google.");
    }
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { url } = await iniciarLoginGoogle();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar login com Google.");
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resultado = await login({ data: { email, senha: password } });
      if ("requerTotp" in resultado) {
        setAguardando2FA(true);
        return;
      }
      queryClient.setQueryData(SESSAO_QUERY_KEY, resultado);
      toast.success("Bem-vindo!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmar2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const usuario = await confirmarLogin2FA({ data: { codigo: codigo2FA } });
      queryClient.setQueryData(SESSAO_QUERY_KEY, usuario);
      toast.success("Bem-vindo!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido.");
      setCodigo2FA("");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) return toast.error("Digite seu usuário antes de entrar com Face ID/digital.");
    setPasskeyLoading(true);
    try {
      const optionsJSON = await iniciarLoginPasskey({ data: { email } });
      const response = await startAuthentication({ optionsJSON });
      const usuario = await confirmarLoginPasskey({ data: { response } });
      queryClient.setQueryData(SESSAO_QUERY_KEY, usuario);
      toast.success("Bem-vindo!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      // startAuthentication rejeita com DOMException (cancelou o prompt,
      // sem biometria cadastrada no dispositivo etc.) — não é erro do
      // servidor, não faz sentido mostrar "Erro ao entrar" genérico.
      if (err instanceof Error && err.name === "NotAllowedError") {
        toast.error("Login cancelado.");
      } else {
        toast.error(err instanceof Error ? err.message : "Erro ao entrar com Face ID/digital.");
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aceiteLgpd) return toast.error("É preciso aceitar a Política de Privacidade.");
    setLoading(true);
    try {
      const usuario = await signup({
        data: { email, senha: password, nomeCompleto: nome, aceiteLgpd },
      });
      queryClient.setQueryData(SESSAO_QUERY_KEY, usuario);
      toast.success("Conta criada!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div
            aria-label="Símbolo da loja"
            className="mx-auto w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif text-xl mb-2"
          >
            ⚜
          </div>
          <CardTitle className="text-2xl">Gestão da Loja</CardTitle>
          <CardDescription>Sistema administrativo maçônico</CardDescription>
        </CardHeader>
        <CardContent>
          {aguardando2FA ? (
            <form onSubmit={handleConfirmar2FA} className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4" /> Digite o código do seu app autenticador.
              </div>
              <div>
                <Label>Código</Label>
                <Input
                  autoFocus
                  inputMode="numeric"
                  placeholder="000000 ou código de backup"
                  value={codigo2FA}
                  onChange={(e) => setCodigo2FA(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Confirmando…" : "Confirmar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setAguardando2FA(false);
                  setCodigo2FA("");
                }}
              >
                Voltar
              </Button>
            </form>
          ) : firstUser ? (
            <Tabs defaultValue="signup">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signup">Criar 1º admin</TabsTrigger>
                <TabsTrigger value="login">Entrar</TabsTrigger>
              </TabsList>
              <TabsContent value="signup" className="pt-4">
                <form onSubmit={handleSignUp} className="space-y-3">
                  <div>
                    <Label>Nome completo</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Senha</Label>
                    <Input
                      type="password"
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={aceiteLgpd}
                      onCheckedChange={(v) => setAceiteLgpd(v === true)}
                      className="mt-0.5"
                    />
                    Li e aceito a{" "}
                    <Link to="/privacidade" target="_blank" className="underline">
                      Política de Privacidade
                    </Link>
                    .
                  </label>
                  <Button type="submit" className="w-full" disabled={loading || !aceiteLgpd}>
                    {loading ? "Criando…" : "Criar conta de administrador"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Como não há usuários, esta primeira conta receberá permissões de administrador.
                  </p>
                </form>
              </TabsContent>
              <TabsContent value="login" className="pt-4">
                <LoginForm
                  {...{
                    email,
                    setEmail,
                    password,
                    setPassword,
                    loading,
                    handleLogin,
                    webauthnDisponivel,
                    passkeyLoading,
                    handlePasskeyLogin,
                    googleLoading,
                    handleGoogleLogin,
                  }}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <LoginForm
              {...{
                email,
                setEmail,
                password,
                setPassword,
                loading,
                handleLogin,
                webauthnDisponivel,
                passkeyLoading,
                handlePasskeyLogin,
                googleLoading,
                handleGoogleLogin,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-1.5 h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.38l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  handleLogin,
  webauthnDisponivel,
  passkeyLoading,
  handlePasskeyLogin,
  googleLoading,
  handleGoogleLogin,
}: any) {
  return (
    <form onSubmit={handleLogin} className="space-y-3">
      <div>
        <Label>Usuário ou e-mail</Label>
        <Input
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="nome.sobrenome ou email@..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Senha</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </Button>
      {webauthnDisponivel && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={passkeyLoading}
          onClick={handlePasskeyLogin}
        >
          <Fingerprint className="mr-1.5 h-4 w-4" />
          {passkeyLoading ? "Confirmando…" : "Entrar com Face ID / digital"}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={googleLoading}
        onClick={handleGoogleLogin}
      >
        <GoogleIcon />
        {googleLoading ? "Redirecionando…" : "Entrar com Google"}
      </Button>
      <p className="text-xs text-muted-foreground pt-2">
        Novas contas são criadas pelo administrador.
      </p>
    </form>
  );
}
