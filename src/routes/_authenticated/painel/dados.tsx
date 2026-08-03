import { createFileRoute } from "@tanstack/react-router";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { useIsDesktop } from "@/lib/use-media-query";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate, GRAU_LABEL, SITUACAO_LABEL } from "@/lib/format";
import { UserRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/dados")({
  component: PainelDados,
});

function PainelDados() {
  const isDesktop = useIsDesktop();
  const meuIrmao = useMeuIrmao();
  if (meuIrmao.isLoading) return null;

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

  return (
    <div className="space-y-4">
      {isDesktop && <PageHeader title="Meus Dados" />}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{irmao.nome_civil}</CardTitle>
            <Badge
              variant={
                irmao.situacao === "ativo" || irmao.situacao === "quite"
                  ? "secondary"
                  : "destructive"
              }
            >
              {SITUACAO_LABEL[irmao.situacao] ?? irmao.situacao}
            </Badge>
          </div>
          {irmao.nome_simbolico && (
            <p className="text-sm text-muted-foreground">{irmao.nome_simbolico}</p>
          )}
        </CardHeader>
        <CardContent className="grid gap-3">
          <InfoRow label="CIM" value={irmao.cim} />
          <InfoRow label="Grau" value={GRAU_LABEL[irmao.grau] ?? irmao.grau} />
          <InfoRow label="Potência" value={irmao.potencia} />
          <InfoRow label="Loja de origem" value={irmao.loja_origem} />
          <InfoRow label="E-mail" value={irmao.email} />
          <InfoRow label="Telefone" value={irmao.telefone ?? irmao.celular} />
          <InfoRow label="Data de iniciação" value={fmtDate(irmao.data_iniciacao)} />
          <InfoRow label="Data de elevação" value={fmtDate(irmao.data_elevacao)} />
          <InfoRow label="Data de exaltação" value={fmtDate(irmao.data_exaltacao)} />
          <InfoRow label="Mensalidade" value={brl(irmao.valor_mensalidade)} />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium">{value || "—"}</span>
    </div>
  );
}
