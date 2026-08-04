import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { useIsDesktop } from "@/lib/use-media-query";
import { obterStatusQuitacao } from "@/lib/backend/irmaos";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtDate, GRAU_LABEL } from "@/lib/format";
import { AlertTriangle, Printer, ScrollText, UserRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/quitacao")({
  head: () => ({ meta: [{ title: "Certificado de Quitação — Gestão Maçônica" }] }),
  component: PainelQuitacao,
});

function PainelQuitacao() {
  const isDesktop = useIsDesktop();
  const meuIrmao = useMeuIrmao();
  const status = useQuery({
    queryKey: ["painel", "statusQuitacao"],
    queryFn: () => obterStatusQuitacao(),
    enabled: !!meuIrmao.data,
  });

  if (meuIrmao.isLoading || status.isLoading) return null;

  if (!meuIrmao.data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState icon={UserRound} title="Cadastro ainda não vinculado" />
        </CardContent>
      </Card>
    );
  }

  const irmao = meuIrmao.data;

  if (!status.data?.quite) {
    return (
      <div className="space-y-4">
        {isDesktop && <PageHeader title="Certificado de Quitação" />}
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={AlertTriangle}
              title="Ainda não é possível emitir o certificado"
              description={`Há ${status.data?.pendentes ?? 0} mensalidade(s) em aberto. Regularize na Situação financeira para poder gerar o certificado.`}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());

  return (
    <div className="space-y-4">
      {isDesktop && <PageHeader title="Certificado de Quitação" />}
      <div className="print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> Imprimir
        </Button>
      </div>
      <Card className="print:border-none print:shadow-none">
        <CardContent className="space-y-6 p-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <ScrollText className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold tracking-tight">Certificado de Quitação</h2>
          </div>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
            Certificamos que <strong className="text-foreground">{irmao.nome_civil}</strong>
            {irmao.nome_simbolico ? ` (${irmao.nome_simbolico})` : ""}, grau{" "}
            <strong className="text-foreground">{GRAU_LABEL[irmao.grau]}</strong>
            {irmao.cim ? (
              <>
                , CIM <strong className="text-foreground">{irmao.cim}</strong>
              </>
            ) : null}
            , encontra-se <strong className="text-foreground">quite</strong> com suas obrigações
            financeiras junto a esta Loja até a presente data, não havendo mensalidades em aberto.
          </p>
          <p className="text-xs text-muted-foreground">Emitido em {hoje}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
