import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { concluirLoginFacebook } from "@/lib/backend/facebook-auth";
import { SESSAO_QUERY_KEY } from "@/lib/auth-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/facebook-concluir")({
  head: () => ({ meta: [{ title: "Entrando… — Gestão Maçônica" }] }),
  component: FacebookConcluirPage,
});

function FacebookConcluirPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const jaTentou = useRef(false);

  useEffect(() => {
    if (jaTentou.current) return;
    jaTentou.current = true;

    const ticket = new URLSearchParams(window.location.search).get("ticket");
    if (!ticket) {
      navigate({ to: "/auth" });
      return;
    }

    concluirLoginFacebook({ data: { ticket } })
      .then((resultado) => {
        if ("requerTotp" in resultado) {
          window.location.href = "/auth?totpPendente=1";
          return;
        }
        queryClient.setQueryData(SESSAO_QUERY_KEY, resultado);
        toast.success("Bem-vindo!");
        navigate({ to: "/dashboard" });
      })
      .catch((err) => {
        setErro(err instanceof Error ? err.message : "Não foi possível concluir o login.");
        setTimeout(() => navigate({ to: "/auth" }), 2500);
      });
  }, [navigate, queryClient]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {erro ? erro : "Entrando com sua conta Facebook…"}
        </CardContent>
      </Card>
    </div>
  );
}
