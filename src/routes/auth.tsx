import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { login, signup, contarUsuarios, getSessao } from "@/lib/backend/auth";
import { iniciarLoginPasskey, confirmarLoginPasskey } from "@/lib/backend/passkeys";
import { confirmarLogin2FA } from "@/lib/backend/totp";
import { iniciarLoginGoogle } from "@/lib/backend/google-auth";
import { iniciarLoginFacebook } from "@/lib/backend/facebook-auth";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
  loja_desconhecida:
    "Este endereço não corresponde a nenhuma loja ativa. Verifique o link de acesso.",
};

const ERRO_FACEBOOK_LABEL: Record<string, string> = {
  cancelado: "Login com Facebook cancelado.",
  expirado: "Sessão do login com Facebook expirou — tente novamente.",
  nao_vinculado:
    "Sua conta Facebook ainda não está vinculada. Entre com sua senha e vincule em Segurança da Conta.",
  nao_configurado: "Login com Facebook não está disponível no momento.",
  falha_token: "Não foi possível confirmar o login com Facebook.",
  loja_desconhecida:
    "Este endereço não corresponde a nenhuma loja ativa. Verifique o link de acesso.",
};

const AUTH_CONTROL_CLASS = "min-h-11 sm:min-h-10";

// Quem administra a plataforma (issue #358) cai direto no painel de
// Plataforma ao entrar, mesmo tendo também papel na própria Loja — "Minha
// Loja" nesse painel leva pro dashboard/painel dela quando quiser. Isto é
// só o destino do LOGIN em si: a rota /dashboard não redireciona mais
// super_admin sozinha, senão clicar em "Minha Loja" viraria um loop de
// volta pra /admin-saas.
function destinoPosLogin(papeis: readonly string[]): string {
  return papeis.includes("super_admin") ? "/admin-saas" : "/dashboard";
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | SGLFM" },
      { name: "description", content: "Acesso ao Sistema de Gestão de Loja Filosófica Maçônica." },
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
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const authBusy = loading || passkeyLoading || googleLoading || facebookLoading;

  useEffect(() => {
    contarUsuarios().then((total) => setFirstUser(total === 0));
    getSessao().then((usuario) => {
      if (usuario) navigate({ to: destinoPosLogin(usuario.papeis) });
    });
    setWebauthnDisponivel(browserSupportsWebAuthn());

    const params = new URLSearchParams(window.location.search);
    const erroGoogle = params.get("erroGoogle");
    if (erroGoogle) {
      toast.error(ERRO_GOOGLE_LABEL[erroGoogle] ?? "Erro ao entrar com Google.");
    }
    const erroFacebook = params.get("erroFacebook");
    if (erroFacebook) {
      toast.error(ERRO_FACEBOOK_LABEL[erroFacebook] ?? "Erro ao entrar com Facebook.");
    }
    // Login por Google/Facebook com 2FA ativo (mesmo gate do login por
    // senha) — o próprio servidor já guardou o login pendente, só falta
    // mostrar o formulário de código aqui.
    if (params.get("totpPendente") === "1") {
      setAguardando2FA(true);
    }
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const { url } = await iniciarLoginGoogle();
      window.location.href = url;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Erro ao iniciar login com Google.");
      setGoogleLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setAuthError(null);
    setFacebookLoading(true);
    try {
      const { url } = await iniciarLoginFacebook();
      window.location.href = url;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Erro ao iniciar login com Facebook.");
      setFacebookLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      const resultado = await login({ data: { email, senha: password } });
      if ("requerTotp" in resultado) {
        setAguardando2FA(true);
        return;
      }
      queryClient.setQueryData(SESSAO_QUERY_KEY, resultado);
      toast.success("Bem-vindo!");
      navigate({ to: destinoPosLogin(resultado.papeis) });
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmar2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      const usuario = await confirmarLogin2FA({ data: { codigo: codigo2FA } });
      queryClient.setQueryData(SESSAO_QUERY_KEY, usuario);
      toast.success("Bem-vindo!");
      navigate({ to: destinoPosLogin(usuario.papeis) });
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Código inválido. Confira e tente novamente.",
      );
      setCodigo2FA("");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) {
      toast.error("Digite seu e-mail antes de entrar com Face ID ou digital.");
      return;
    }
    setAuthError(null);
    setPasskeyLoading(true);
    try {
      const optionsJSON = await iniciarLoginPasskey({ data: { email } });
      const response = await startAuthentication({ optionsJSON });
      const usuario = await confirmarLoginPasskey({ data: { response } });
      queryClient.setQueryData(SESSAO_QUERY_KEY, usuario);
      toast.success("Bem-vindo!");
      navigate({ to: destinoPosLogin(usuario.papeis) });
    } catch (err) {
      // startAuthentication rejeita com DOMException (cancelou o prompt,
      // sem biometria cadastrada no dispositivo etc.) — não é erro do
      // servidor, não faz sentido mostrar "Erro ao entrar" genérico.
      if (err instanceof Error && err.name === "NotAllowedError") {
        toast.error("Login cancelado.");
      } else {
        setAuthError(
          err instanceof Error
            ? err.message
            : "Não foi possível entrar com Face ID ou digital. Tente novamente.",
        );
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aceiteLgpd) return toast.error("É preciso aceitar a Política de Privacidade.");
    setAuthError(null);
    setLoading(true);
    try {
      const usuario = await signup({
        data: { email, senha: password, nomeCompleto: nome, aceiteLgpd },
      });
      queryClient.setQueryData(SESSAO_QUERY_KEY, usuario);
      toast.success("Conta criada!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen min-h-dvh items-start justify-center overflow-y-auto bg-muted/40 p-4">
      <Card className="my-auto w-full max-w-md">
        <CardHeader className="text-center">
          <img
            src="/brand/sglfm-mark.svg"
            alt=""
            className="mx-auto mb-2 h-24 w-20 object-contain"
          />
          <h1 className="font-serif text-3xl font-semibold leading-snug tracking-wide">SGLFM</h1>
          <CardDescription>Sistema de Gestão de Loja Filosófica Maçônica</CardDescription>
        </CardHeader>
        <CardContent>
          {aguardando2FA ? (
            <form
              method="post"
              onSubmit={handleConfirmar2FA}
              className="space-y-3"
              aria-busy={loading}
            >
              <div
                id="codigo-2fa-ajuda"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <ShieldCheck className="h-4 w-4" /> Digite o código do seu app autenticador.
              </div>
              <div>
                <Label htmlFor="codigo-2fa">Código</Label>
                <Input
                  className={AUTH_CONTROL_CLASS}
                  id="codigo-2fa"
                  name="codigo"
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  aria-describedby={
                    authError ? "codigo-2fa-ajuda codigo-2fa-erro" : "codigo-2fa-ajuda"
                  }
                  aria-invalid={!!authError}
                  placeholder="000000 ou código de backup"
                  value={codigo2FA}
                  onChange={(e) => setCodigo2FA(e.target.value)}
                  required
                />
              </div>
              {authError && (
                <p id="codigo-2fa-erro" role="alert" className="text-sm text-destructive">
                  {authError}
                </p>
              )}
              <Button type="submit" className="min-h-11 w-full sm:min-h-10" disabled={authBusy}>
                {loading ? "Confirmando…" : "Confirmar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full sm:min-h-10"
                disabled={loading}
                onClick={() => {
                  setAguardando2FA(false);
                  setCodigo2FA("");
                  setAuthError(null);
                }}
              >
                Voltar
              </Button>
            </form>
          ) : firstUser ? (
            <Tabs defaultValue="signup">
              <TabsList className="grid min-h-11 h-auto w-full grid-cols-2">
                <TabsTrigger value="signup" className="min-h-10">
                  Criar 1º admin
                </TabsTrigger>
                <TabsTrigger value="login" className="min-h-10">
                  Entrar
                </TabsTrigger>
              </TabsList>
              <TabsContent value="signup" className="pt-4">
                <form
                  method="post"
                  onSubmit={handleSignUp}
                  className="space-y-3"
                  aria-busy={loading}
                >
                  <div>
                    <Label htmlFor="cadastro-nome">Nome completo</Label>
                    <Input
                      className={AUTH_CONTROL_CLASS}
                      id="cadastro-nome"
                      name="name"
                      autoComplete="name"
                      aria-describedby={authError ? "cadastro-erro" : undefined}
                      aria-invalid={!!authError}
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="cadastro-email">E-mail</Label>
                    <Input
                      className={AUTH_CONTROL_CLASS}
                      id="cadastro-email"
                      name="email"
                      type="email"
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect="off"
                      aria-describedby={authError ? "cadastro-erro" : undefined}
                      aria-invalid={!!authError}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="cadastro-senha">Senha</Label>
                    <Input
                      className={AUTH_CONTROL_CLASS}
                      id="cadastro-senha"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      aria-describedby={authError ? "cadastro-erro" : undefined}
                      aria-invalid={!!authError}
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      id="aceite-lgpd"
                      checked={aceiteLgpd}
                      onCheckedChange={(v) => setAceiteLgpd(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <Label
                        htmlFor="aceite-lgpd"
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Li e aceito a
                      </Label>{" "}
                      <Link
                        to="/privacidade"
                        target="_blank"
                        className="underline underline-offset-2"
                      >
                        Política de Privacidade
                      </Link>
                      .
                    </span>
                  </div>
                  {authError && (
                    <p id="cadastro-erro" role="alert" className="text-sm text-destructive">
                      {authError}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="min-h-11 w-full sm:min-h-10"
                    disabled={authBusy || !aceiteLgpd}
                  >
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
                    authBusy,
                    authError,
                    handleLogin,
                    webauthnDisponivel,
                    passkeyLoading,
                    handlePasskeyLogin,
                    googleLoading,
                    handleGoogleLogin,
                    facebookLoading,
                    handleFacebookLogin,
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
                authBusy,
                authError,
                handleLogin,
                webauthnDisponivel,
                passkeyLoading,
                handlePasskeyLogin,
                googleLoading,
                handleGoogleLogin,
                facebookLoading,
                handleFacebookLogin,
              }}
            />
          )}
        </CardContent>
      </Card>
    </main>
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

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-1.5 h-4 w-4" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07Z" />
    </svg>
  );
}

interface LoginFormProps {
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  authBusy: boolean;
  authError: string | null;
  handleLogin: (event: React.FormEvent) => Promise<void>;
  webauthnDisponivel: boolean;
  passkeyLoading: boolean;
  handlePasskeyLogin: () => Promise<void>;
  googleLoading: boolean;
  handleGoogleLogin: () => Promise<void>;
  facebookLoading: boolean;
  handleFacebookLogin: () => Promise<void>;
}

function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  authBusy,
  authError,
  handleLogin,
  webauthnDisponivel,
  passkeyLoading,
  handlePasskeyLogin,
  googleLoading,
  handleGoogleLogin,
  facebookLoading,
  handleFacebookLogin,
}: LoginFormProps) {
  return (
    <form method="post" onSubmit={handleLogin} className="space-y-3" aria-busy={authBusy}>
      <div>
        <Label htmlFor="login-email">E-mail</Label>
        <Input
          className={AUTH_CONTROL_CLASS}
          id="login-email"
          name="email"
          type="email"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect="off"
          aria-describedby={authError ? "login-erro" : undefined}
          aria-invalid={!!authError}
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="login-senha">Senha</Label>
        <Input
          className={AUTH_CONTROL_CLASS}
          id="login-senha"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-describedby={authError ? "login-erro" : undefined}
          aria-invalid={!!authError}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {authError && (
        <p id="login-erro" role="alert" className="text-sm text-destructive">
          {authError}
        </p>
      )}
      <Button type="submit" className="min-h-11 w-full sm:min-h-10" disabled={authBusy}>
        {loading ? "Entrando…" : "Entrar"}
      </Button>
      {webauthnDisponivel && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:min-h-10"
          disabled={authBusy}
          onClick={handlePasskeyLogin}
        >
          <Fingerprint className="mr-1.5 h-4 w-4" />
          {passkeyLoading ? "Confirmando…" : "Entrar com Face ID ou digital"}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full sm:min-h-10"
        disabled={authBusy}
        onClick={handleGoogleLogin}
      >
        <GoogleIcon />
        {googleLoading ? "Redirecionando…" : "Entrar com Google"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full sm:min-h-10"
        disabled={authBusy}
        onClick={handleFacebookLogin}
      >
        <FacebookIcon />
        {facebookLoading ? "Redirecionando…" : "Entrar com Facebook"}
      </Button>
      <p className="text-xs text-muted-foreground pt-2">
        Novas contas são criadas pelo administrador.
      </p>
    </form>
  );
}
