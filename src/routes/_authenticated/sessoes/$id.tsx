import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  obterSessao,
  listarPresencas,
  listarMembrosOrg,
  togglePresenca as togglePresencaFn,
} from "@/lib/backend/sessoes";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TIPO_SESSAO_LABEL, fmtDate } from "@/lib/format";
import { useCan } from "@/lib/auth-hooks";
import { toast } from "sonner";

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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Presente</TableHead>
                  <TableHead>Nome civil</TableHead>
                  <TableHead>Nome simbólico</TableHead>
                  <TableHead>Grau no corpo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {elegiveis.map((m) => {
                  const p = map.get(m.irmao_id);
                  return (
                    <TableRow key={m.irmao_id}>
                      <TableCell>
                        <Checkbox
                          checked={p?.presente ?? false}
                          disabled={!can.isSecretario}
                          onCheckedChange={(v) => togglePresenca(m.irmao_id, !!v)}
                        />
                      </TableCell>
                      <TableCell>{m.nome_civil}</TableCell>
                      <TableCell>{m.nome_simbolico ?? "—"}</TableCell>
                      <TableCell>{m.grau_atual ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {elegiveis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      Nenhum membro deste corpo com grau suficiente.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
