import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  listarComunicados,
  marcarComunicadoLido,
  type Comunicado,
} from "@/lib/backend/comunicacoes";
import { useIsDesktop } from "@/lib/use-media-query";
import { EmptyState, PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel/comunicacoes")({
  head: () => ({ meta: [{ title: "Comunicações — Gestão Maçônica" }] }),
  component: PainelComunicacoes,
});

function PainelComunicacoes() {
  const isDesktop = useIsDesktop();
  const qc = useQueryClient();
  const { data: comunicados = [] } = useQuery({
    queryKey: ["painel", "comunicados"],
    queryFn: () => listarComunicados(),
  });
  const marcados = useRef(new Set<string>());

  useEffect(() => {
    const naoLidos = comunicados.filter((c) => !c.lido && !marcados.current.has(c.id));
    if (naoLidos.length === 0) return;
    Promise.all(
      naoLidos.map((c) => {
        marcados.current.add(c.id);
        return marcarComunicadoLido({ data: { comunicadoId: c.id } });
      }),
    ).then(() => {
      qc.invalidateQueries({ queryKey: ["painel", "comunicados"] });
      qc.invalidateQueries({ queryKey: ["painel", "comunicadosNaoLidos"] });
    });
  }, [comunicados, qc]);

  if (comunicados.length === 0) {
    return (
      <>
        {isDesktop && <PageHeader title="Comunicações" />}
        <Card>
          <CardContent className="pt-6">
            <EmptyState icon={Megaphone} title="Nenhum comunicado no momento" />
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {isDesktop && <PageHeader title="Comunicações" />}
      {comunicados.map((c: Comunicado) => (
        <Card key={c.id}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{c.titulo}</p>
              {!c.lido && (
                <Badge variant="secondary" className="shrink-0">
                  Novo
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{fmtDate(c.criado_em)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{c.corpo}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
