import { createFileRoute, Link } from "@tanstack/react-router";
import { useMeuIrmao } from "@/lib/use-meu-irmao";
import { useIsDesktop } from "@/lib/use-media-query";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { brl, fmtDate, GRAU_LABEL, SITUACAO_LABEL } from "@/lib/format";
import { CalendarDays, UserRound, Wallet } from "lucide-react";
import type { Irmao } from "@/lib/backend/irmaos";

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
      <FichaCard irmao={irmao} />

      <Card>
        <CardContent className="grid gap-3 pt-6">
          <InfoRow label="E-mail" value={irmao.email} />
          <InfoRow label="Telefone" value={irmao.telefone ?? irmao.celular} />
          <InfoRow label="Data de elevação" value={fmtDate(irmao.data_elevacao)} />
          <InfoRow label="Data de exaltação" value={fmtDate(irmao.data_exaltacao)} />
          <InfoRow label="Mensalidade" value={brl(irmao.valor_mensalidade)} />
        </CardContent>
      </Card>
    </div>
  );
}

// Grau maçônico como progressão de cor (aprendiz → companheiro → mestre), no
// lugar do "tier" de fidelidade do componente original — não faz sentido
// gamificar grau com pontos/nível numa loja maçônica.
const GRAU_STYLE: Record<
  Irmao["grau"],
  { color: string; bg: string; border: string; gradient: string }
> = {
  aprendiz: {
    color: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800/50",
    border: "border-slate-200 dark:border-slate-700",
    gradient: "from-slate-400/40 to-slate-400/5",
  },
  companheiro: {
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    border: "border-blue-200 dark:border-blue-800",
    gradient: "from-blue-500/40 to-blue-500/5",
  },
  mestre: {
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-800",
    gradient: "from-amber-500/40 to-amber-500/5",
  },
};

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

function FichaCard({ irmao }: { irmao: Irmao }) {
  const grauStyle = GRAU_STYLE[irmao.grau];

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className={`h-2 w-full bg-gradient-to-r ${grauStyle.gradient}`} />
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-14 w-14 border">
              <AvatarImage src={irmao.foto_url ?? undefined} alt={irmao.nome_civil} />
              <AvatarFallback>{iniciais(irmao.nome_civil)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight">{irmao.nome_civil}</h3>
              {irmao.nome_simbolico && (
                <p className="truncate text-sm text-muted-foreground">{irmao.nome_simbolico}</p>
              )}
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Iniciado em {fmtDate(irmao.data_iniciacao)}</span>
              </div>
            </div>
          </div>
          <Badge
            className={`shrink-0 uppercase ${grauStyle.color} ${grauStyle.bg} ${grauStyle.border} border`}
          >
            {GRAU_LABEL[irmao.grau]}
          </Badge>
        </div>

        <Separator className="my-4" />

        <div className="grid grid-cols-2 gap-y-3 text-sm">
          <InfoRow label="CIM" value={irmao.cim} />
          <InfoRow label="Situação" value={SITUACAO_LABEL[irmao.situacao] ?? irmao.situacao} />
          <InfoRow label="Potência" value={irmao.potencia} />
          <InfoRow label="Loja de origem" value={irmao.loja_origem} />
        </div>
      </CardContent>
      <Separator />
      <CardFooter className="p-3">
        <Button variant="ghost" size="sm" asChild className="w-full justify-center gap-1.5 text-xs">
          <Link to="/painel/financeiro">
            <Wallet className="h-3.5 w-3.5" /> Ver situação financeira
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value || "—"}</div>
    </div>
  );
}
