import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSessao, trocarMinhaSenha, logout } from "@/lib/backend/auth";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/trocar-senha")({
  beforeLoad: async () => {
    const usuario = await getSessao();
    if (!usuario) throw redirect({ to: "/auth" });
    if (!usuario.deveTrocarSenha) throw redirect({ to: "/" });
    return { usuario };
  },
  head: () => ({ meta: [{ title: "Trocar senha — Gestão Maçônica" }] }),
  component: TrocarSenha,
});

function TrocarSenha() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const salvar = async () => {
    if (novaSenha.length < 3) return toast.error("A senha precisa ter pelo menos 3 caracteres.");
    if (novaSenha !== confirmacao) return toast.error("As senhas não conferem.");
    setEnviando(true);
    try {
      await trocarMinhaSenha({ data: { novaSenha, senhaAtual: null } });
      const sessao = await getSessao();
      queryClient.setQueryData(SESSAO_QUERY_KEY, sessao);
      toast.success("Senha atualizada.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao trocar senha.");
    } finally {
      setEnviando(false);
    }
  };

  const sair = async () => {
    await logout();
    queryClient.setQueryData(SESSAO_QUERY_KEY, null);
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif text-xl mb-2">
            ⚜
          </div>
          <CardTitle className="text-2xl">Defina sua senha</CardTitle>
          <CardDescription>
            Sua senha atual é temporária. Escolha uma nova para continuar.
          </CardDescription>
        </CardHeader>
        <form
          method="post"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
              <Input
                id="confirmar-senha"
                type="password"
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={sair} disabled={enviando}>
              Sair
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar e continuar"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
