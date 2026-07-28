import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/relatorios/frequencia")({
  head: () => ({ meta: [{ title: "Relatório de Frequência — Gestão Maçônica" }] }),
  component: RelatorioFreq,
});

function RelatorioFreq() {
  const { data } = useQuery({
    queryKey: ["rel_freq"],
    queryFn: async () => {
      const [{ data: irmaos }, { data: sessoes }, { data: pres }] = await Promise.all([
        supabase.from("irmaos").select("id, nome_civil, nome_simbolico").order("nome_civil"),
        supabase.from("sessoes").select("id"),
        supabase.from("presencas").select("irmao_id, presente"),
      ]);
      const total = sessoes?.length ?? 0;
      const stats = new Map<string, { p: number }>();
      pres?.forEach((r: any) => {
        if (r.presente) {
          const cur = stats.get(r.irmao_id) ?? { p: 0 };
          cur.p += 1;
          stats.set(r.irmao_id, cur);
        }
      });
      return { irmaos: irmaos ?? [], total, stats };
    },
  });

  return (
    <>
      <PageHeader title="Relatório de Frequência" description={`Total de sessões registradas: ${data?.total ?? 0}`} />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Irmão</TableHead>
              <TableHead className="text-right">Presenças</TableHead>
              <TableHead className="text-right">Faltas</TableHead>
              <TableHead className="text-right">Frequência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.irmaos ?? []).map((i: any) => {
              const p = data!.stats.get(i.id)?.p ?? 0;
              const total = data!.total;
              const perc = total ? Math.round((p / total) * 100) : 0;
              return (
                <TableRow key={i.id}>
                  <TableCell>{i.nome_civil}{i.nome_simbolico ? ` (${i.nome_simbolico})` : ""}</TableCell>
                  <TableCell className="text-right">{p}</TableCell>
                  <TableCell className="text-right">{Math.max(0, total - p)}</TableCell>
                  <TableCell className="text-right font-medium">{perc}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
