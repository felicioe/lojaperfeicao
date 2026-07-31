import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { relatorioFrequencia } from "@/lib/backend/relatorios";
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
    queryFn: () => relatorioFrequencia(),
  });

  return (
    <>
      <PageHeader title="Relatório de Frequência" description={`Total de sessões registradas: ${data?.totalSessoes ?? 0}`} />
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
            {(data?.irmaos ?? []).map((i) => {
              const total = data!.totalSessoes;
              const perc = total ? Math.round((i.presencas / total) * 100) : 0;
              return (
                <TableRow key={i.id}>
                  <TableCell>{i.nome_civil}{i.nome_simbolico ? ` (${i.nome_simbolico})` : ""}</TableCell>
                  <TableCell className="text-right">{i.presencas}</TableCell>
                  <TableCell className="text-right">{Math.max(0, total - i.presencas)}</TableCell>
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
