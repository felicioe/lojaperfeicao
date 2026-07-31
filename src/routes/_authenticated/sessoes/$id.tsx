import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { obterSessao, listarPresencas, togglePresenca as togglePresencaFn } from "@/lib/backend/sessoes";
import { listarIrmaos } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GRAU_LABEL, TIPO_SESSAO_LABEL, fmtDate } from "@/lib/format";
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

  const irmaos = useQuery({
    queryKey: ["irmaos-ativos"],
    queryFn: async () => {
      const todos = await listarIrmaos();
      return todos
        .filter((i) => i.situacao !== "adormecido")
        .sort((a, b) => a.nome_civil.localeCompare(b.nome_civil));
    },
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

  const s = sessao.data;
  return (
    <>
      <PageHeader
        title={s ? `Sessão de ${fmtDate(s.data)}` : "Sessão"}
        description={s ? `${TIPO_SESSAO_LABEL[s.tipo]} — Grau: ${GRAU_LABEL[s.grau]}` : ""}
      />
      <Card>
        <CardHeader><CardTitle className="text-base">Lista de presença</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Presente</TableHead>
                <TableHead>Nome civil</TableHead>
                <TableHead>Nome simbólico</TableHead>
                <TableHead>Grau</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(irmaos.data ?? []).map((i: any) => {
                const p: any = map.get(i.id);
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Checkbox
                        checked={p?.presente ?? false}
                        disabled={!can.isSecretario}
                        onCheckedChange={(v) => togglePresenca(i.id, !!v)}
                      />
                    </TableCell>
                    <TableCell>{i.nome_civil}</TableCell>
                    <TableCell>{i.nome_simbolico ?? "—"}</TableCell>
                    <TableCell>{GRAU_LABEL[i.grau]}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
