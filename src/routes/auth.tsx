import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { login, signup, contarUsuarios, getSessao } from "@/lib/server/auth";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  useEffect(() => {
    contarUsuarios().then((total) => setFirstUser(total === 0));
    getSessao().then((usuario) => {
      if (usuario) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const usuario = await login({ data: { email, senha: password } });
      queryClient.setQueryData(SESSAO_QUERY_KEY, usuario);
      toast.success("Bem-vindo!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const usuario = await signup({ data: { email, senha: password, nomeCompleto: nome } });
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
          <div className="mx-auto w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif text-xl mb-2">
            ⚜
          </div>
          <CardTitle className="text-2xl">Gestão da Loja</CardTitle>
          <CardDescription>Sistema administrativo maçônico</CardDescription>
        </CardHeader>
        <CardContent>
          {firstUser ? (
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
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Senha</Label>
                    <Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Criando…" : "Criar conta de administrador"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Como não há usuários, esta primeira conta receberá permissões de administrador.
                  </p>
                </form>
              </TabsContent>
              <TabsContent value="login" className="pt-4">
                <LoginForm {...{ email, setEmail, password, setPassword, loading, handleLogin }} />
              </TabsContent>
            </Tabs>
          ) : (
            <LoginForm {...{ email, setEmail, password, setPassword, loading, handleLogin }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoginForm({ email, setEmail, password, setPassword, loading, handleLogin }: any) {
  return (
    <form onSubmit={handleLogin} className="space-y-3">
      <div>
        <Label>E-mail</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label>Senha</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-xs text-muted-foreground pt-2">
        Novas contas são criadas pelo administrador.
      </p>
    </form>
  );
}
