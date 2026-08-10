import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { relatorioFrequencia } from "@/lib/backend/relatorios";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/relatorios/frequencia")({
  head: () => ({ meta: [{ title: "Relatório de Frequência — Gestão Maçônica" }] }),
  component: RelatorioFreq,
});

function RelatorioFreq() {
  const { data } = useQuery({
    queryKey: ["rel_freq"],
    queryFn: () => relatorioFrequencia(),
  });
  const totalSessoes = data?.totalSessoes ?? 0;
  const ord = useOrdenacao(data?.irmaos ?? [], {
    irmao: (i) => i.nome_civil,
    presencas: (i) => i.presencas,
    faltas: (i) => Math.max(0, totalSessoes - i.presencas),
    frequencia: (i) => (totalSessoes ? Math.round((i.presencas / totalSessoes) * 100) : 0),
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  return (
    <>
      <PageHeader
        title="Relatório de Frequência"
        description={`Total de sessões registradas: ${data?.totalSessoes ?? 0}`}
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="irmao" ord={ord}>
                Irmão
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="presencas" ord={ord} className="text-right">
                Presenças
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="faltas" ord={ord} className="text-right">
                Faltas
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="frequencia" ord={ord} className="text-right">
                Frequência
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensPagina.map((i) => {
              const total = data!.totalSessoes;
              const perc = total ? Math.round((i.presencas / total) * 100) : 0;
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    {i.nome_civil}
                    {i.nome_simbolico ? ` (${i.nome_simbolico})` : ""}
                  </TableCell>
                  <TableCell className="text-right">{i.presencas}</TableCell>
                  <TableCell className="text-right">{Math.max(0, total - i.presencas)}</TableCell>
                  <TableCell className="text-right font-medium">{perc}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <TabelaPaginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          totalItens={totalItens}
          tamanhoPagina={tamanhoPagina}
          setPagina={setPagina}
        />
      </Card>
    </>
  );
}
