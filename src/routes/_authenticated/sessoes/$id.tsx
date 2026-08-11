import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  obterSessao,
  listarPresencas,
  listarMembrosOrg,
  listarResponsaveisSessoes,
  togglePresenca as togglePresencaFn,
} from "@/lib/backend/sessoes";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TIPO_SESSAO_LABEL, fmtDate } from "@/lib/format";
import { useCan } from "@/lib/auth-hooks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sessoes/$id")({
  head: () => ({ meta: [{ title: "Frequência da Sessão — Gestão Maçônica" }] }),
  component: SessaoDetail,
});

function SessaoDetail() {
  const { id } = useParams({ from: "/_authenticated/sessoes/$id" });
  const qc = useQueryClient();
  const can = useCan();

  const sessao = useQuery({
    queryKey: ["sessao", id],
    queryFn: () => obterSessao({ data: { id } }),
  });
  const s = sessao.data;

  const membros = useQuery({
    queryKey: ["membros_org", s?.org_id],
    queryFn: () => listarMembrosOrg({ data: { orgId: s!.org_id! } }),
    enabled: !!s?.org_id,
  });

  const presencas = useQuery({
    queryKey: ["presencas", id],
    queryFn: () => listarPresencas({ data: { sessaoId: id } }),
  });

  // Lista todos os responsáveis (todas as sessões) e filtra no client — é
  // a mesma chamada que o Calendário já usa (cache compartilhado via
  // queryKey), evita uma segunda rota só pra filtrar por sessão.
  const responsaveis = useQuery({
    queryKey: ["responsaveis_sessoes"],
    queryFn: () => listarResponsaveisSessoes(),
  });
  const responsaveisDaSessao = (responsaveis.data ?? []).filter((r) => r.sessao_id === id);

  const map = new Map(presencas.data?.map((p) => [p.irmao_id, p]) ?? []);

  const togglePresenca = async (irmaoId: string, presente: boolean) => {
    if (!can.isSecretario) return;
    try {
      await togglePresencaFn({ data: { sessaoId: id, irmaoId, presente } });
      qc.invalidateQueries({ queryKey: ["presencas", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar presença.");
    }
  };

  const elegiveis = (membros.data ?? []).filter((m) => !s || (m.grau_atual ?? 0) >= s.grau);

  return (
    <>
      <PageHeader
        title={s ? `Sessão de ${fmtDate(s.data)}` : "Sessão"}
        description={
          s
            ? `${TIPO_SESSAO_LABEL[s.tipo]} — ${s.org_nome ?? "sem corpo"} — Grau: ${s.grau}${s.nome_grau ? ` (${s.nome_grau})` : ""}`
            : ""
        }
      />
      {responsaveisDaSessao.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Programação da sessão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {responsaveisDaSessao.map((r, i) => (
              <div key={i} className="border-b pb-2 last:border-b-0 last:pb-0">
                <div className="text-sm font-medium">
                  {r.irmao_nome ?? r.nome_extraido}
                  {r.apelido_extraido && (
                    <span className="text-muted-foreground"> ({r.apelido_extraido})</span>
                  )}
                </div>
                {r.atividade && <div className="text-sm text-muted-foreground">{r.atividade}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de presença</CardTitle>
        </CardHeader>
        <CardContent>
          {!s?.org_id ? (
            <p className="text-sm text-muted-foreground">
              Esta sessão não tem corpo maçônico associado — não é possível montar a lista de
              presença.
            </p>
          ) : elegiveis.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum membro deste corpo com grau suficiente.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {elegiveis.map((m) => {
                const presente = map.get(m.irmao_id)?.presente ?? false;
                return (
                  <button
                    key={m.irmao_id}
                    type="button"
                    disabled={!can.isSecretario}
                    onClick={() => togglePresenca(m.irmao_id, !presente)}
                    className={cn(
                      "rounded-md p-3 text-left text-sm font-medium text-white transition-colors",
                      presente
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-red-600 hover:bg-red-700",
                      !can.isSecretario && "cursor-default",
                      can.isSecretario && "cursor-pointer",
                    )}
                  >
                    <div className="uppercase">{m.nome_civil}</div>
                    {m.nome_simbolico && (
                      <div className="text-xs font-normal uppercase opacity-90">
                        {m.nome_simbolico}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
