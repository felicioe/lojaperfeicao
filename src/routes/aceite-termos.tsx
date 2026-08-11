import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSessao, registrarConsentimentoLgpd } from "@/lib/backend/auth";
import { logout } from "@/lib/backend/auth";
import { obterConfiguracoesLgpd } from "@/lib/backend/configuracoes-lgpd";
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
import { Checkbox } from "@/components/ui/checkbox";
import { PoliticaPrivacidadeConteudo } from "@/components/app/PoliticaPrivacidade";
import { toast } from "sonner";

export const Route = createFileRoute("/aceite-termos")({
  beforeLoad: async () => {
    const usuario = await getSessao();
    if (!usuario) throw redirect({ to: "/auth" });
    if (usuario.deveTrocarSenha) throw redirect({ to: "/trocar-senha" });
    if (usuario.consentimentoLgpdEm) throw redirect({ to: "/" });
    return { usuario };
  },
  head: () => ({ meta: [{ title: "Política de Privacidade — Gestão Maçônica" }] }),
  component: AceiteTermos,
});

function AceiteTermos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [aceito, setAceito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { data: configuracoes } = useQuery({
    queryKey: ["configuracoes_lgpd"],
    queryFn: () => obterConfiguracoesLgpd(),
  });

  const aceitar = async () => {
    setEnviando(true);
    try {
      await registrarConsentimentoLgpd();
      const sessao = await getSessao();
      queryClient.setQueryData(SESSAO_QUERY_KEY, sessao);
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar aceite.");
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
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif text-xl mb-2">
            ⚜
          </div>
          <CardTitle className="text-2xl">Antes de continuar</CardTitle>
          <CardDescription>
            Precisamos do seu aceite à Política de Privacidade para liberar o acesso ao sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto rounded-lg border p-4">
            <PoliticaPrivacidadeConteudo configuracoes={configuracoes} />
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <Checkbox
              checked={aceito}
              onCheckedChange={(v) => setAceito(v === true)}
              className="mt-0.5"
            />
            Li e aceito a Política de Privacidade acima.
          </label>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={sair} disabled={enviando}>
            Sair
          </Button>
          <Button onClick={aceitar} disabled={!aceito || enviando}>
            {enviando ? "Enviando…" : "Aceitar e continuar"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
