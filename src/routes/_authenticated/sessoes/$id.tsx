import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
    queryFn: async () => (await supabase.from("sessoes").select("*").eq("id", id).single()).data,
  });

  const irmaos = useQuery({
    queryKey: ["irmaos-ativos"],
    queryFn: async () =>
      (await supabase.from("irmaos").select("id, nome_civil, nome_simbolico, grau, situacao").neq("situacao", "adormecido").order("nome_civil")).data ?? [],
  });

  const presencas = useQuery({
    queryKey: ["presencas", id],
    queryFn: async () => (await supabase.from("presencas").select("*").eq("sessao_id", id)).data ?? [],
  });

  const map = new Map(presencas.data?.map((p: any) => [p.irmao_id, p]) ?? []);

  const togglePresenca = async (irmaoId: string, presente: boolean) => {
    if (!can.isSecretario) return;
    const existing: any = map.get(irmaoId);
    if (existing) {
      const { error } = await supabase.from("presencas").update({ presente }).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("presencas").insert({ sessao_id: id, irmao_id: irmaoId, presente });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["presencas", id] });
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
