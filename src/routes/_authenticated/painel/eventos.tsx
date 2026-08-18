import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { listarEventos, registrarRsvp, type Evento } from "@/lib/backend/eventos";
import { useIsDesktop } from "@/lib/use-media-query";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/format";
import { CalendarDays, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/painel/eventos")({
  head: () => ({ meta: [{ title: "Eventos — Gestão Maçônica" }] }),
  component: PainelEventos,
});

const PARTICIPA_LABEL: Record<"sim" | "nao" | "talvez", string> = {
  sim: "Vou",
  nao: "Não vou",
  talvez: "Talvez",
};

function statusEvento(evento: Evento): "agendado" | "realizado" {
  const momento = new Date(`${evento.data}T${evento.hora ?? "00:00:00"}`);
  return momento.getTime() >= Date.now() ? "agendado" : "realizado";
}

function PainelEventos() {
  const isDesktop = useIsDesktop();
  const qc = useQueryClient();
  const { data: eventos = [] } = useQuery({
    queryKey: ["painel", "eventos"],
    queryFn: () => listarEventos(),
  });

  const itens = [...eventos].sort((a, b) => b.data.localeCompare(a.data));

  if (itens.length === 0) {
    return (
      <>
        {isDesktop && <PageHeader title="Eventos" />}
        <Card>
          <CardContent className="pt-6">
            <EmptyState icon={CalendarDays} title="Nenhum evento no momento" />
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {isDesktop && <PageHeader title="Eventos" />}
      {itens.map((e) => (
        <EventoCard
          key={e.id}
          evento={e}
          onDone={() => qc.invalidateQueries({ queryKey: ["painel", "eventos"] })}
        />
      ))}
    </div>
  );
}

function EventoCard({ evento, onDone }: { evento: Evento; onDone: () => void }) {
  const [agape, setAgape] = useState(evento.meu_agape ?? false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const status = statusEvento(evento);
  // Um card por evento na mesma tela, então o id do checkbox precisa ser
  // único por instância — id fixo colidiria entre os cards.
  const idAgape = useId();

  const responder = async (participa: "sim" | "nao" | "talvez") => {
    setEnviando(participa);
    try {
      await registrarRsvp({
        data: { eventoId: evento.id, participa, agape: participa === "sim" && agape },
      });
      toast.success("RSVP registrado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar RSVP.");
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{evento.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {fmtDate(evento.data)}
              {evento.hora ? ` às ${evento.hora.slice(0, 5)}` : ""}
              {evento.org_nome ? ` · ${evento.org_nome}` : ""}
            </p>
          </div>
          <Badge variant={status === "agendado" ? "secondary" : "outline"}>
            {status === "agendado" ? "Agendado" : "Realizado"}
          </Badge>
        </div>
        {evento.descricao && <p className="text-sm text-muted-foreground">{evento.descricao}</p>}

        {status === "agendado" && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {(["sim", "talvez", "nao"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={evento.minha_participacao === p ? "default" : "outline"}
                disabled={enviando !== null}
                onClick={() => responder(p)}
                className={cn(evento.minha_participacao === p && "pointer-events-none")}
              >
                {PARTICIPA_LABEL[p]}
              </Button>
            ))}
            {evento.tem_agape && (
              <span className="ml-2 flex items-center gap-1.5 text-sm">
                <Checkbox id={idAgape} checked={agape} onCheckedChange={(v) => setAgape(!!v)} />
                <Label htmlFor={idAgape} className="cursor-pointer font-normal">
                  <PartyPopper className="mr-1 inline h-3.5 w-3.5" /> Vou ao ágape
                </Label>
              </span>
            )}
          </div>
        )}
        {evento.minha_participacao && (
          <p className="text-xs text-muted-foreground">
            Sua resposta: <strong>{PARTICIPA_LABEL[evento.minha_participacao]}</strong>
            {evento.tem_agape && evento.meu_agape ? " · vai ao ágape" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
