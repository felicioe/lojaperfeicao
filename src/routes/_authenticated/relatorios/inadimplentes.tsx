import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { relatorioInadimplentes, type ItemInadimplente } from "@/lib/backend/relatorios";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";

export const Route = createFileRoute("/_authenticated/relatorios/inadimplentes")({
  head: () => ({ meta: [{ title: "Inadimplentes — Gestão Maçônica" }] }),
  component: Inadimplentes,
});

function Inadimplentes() {
  const [irmaoId, setIrmaoId] = useState("todos");
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });
  const { data } = useQuery({
    queryKey: ["inadimplentes"],
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const pend = await relatorioInadimplentes({ data: { hoje } });

      const grupos = new Map<
        string,
        {
          irmao_id: string;
          irmao: { nome_civil: string; nome_simbolico: string | null };
          itens: ItemInadimplente[];
          total: number;
        }
      >();
      pend.forEach((l) => {
        const key = l.irmao_id;
        if (!key) return;
        const cur = grupos.get(key) ?? {
          irmao_id: key,
          irmao: { nome_civil: l.nome_civil, nome_simbolico: l.nome_simbolico },
          itens: [],
          total: 0,
        };
        cur.itens.push(l);
        cur.total += Number(l.valor);
        grupos.set(key, cur);
      });
      return Array.from(grupos.values()).filter((g) => g.itens.length >= 3);
    },
  });
  const dataFiltrada = (data ?? []).filter((g) => irmaoId === "todos" || g.irmao_id === irmaoId);
  const ord = useOrdenacao(dataFiltrada, {
    irmao: (g) => g.irmao?.nome_civil,
    mensalidades: (g) => g.itens.length,
    total: (g) => g.total,
    vencimento: (g) => g.itens[0]?.data_vencimento,
  });
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } = usePaginacao(
    ord.itensOrdenados,
  );

  return (
    <>
      <PageHeader
        title="Relatório de Inadimplentes"
        description="Irmãos com 3 ou mais mensalidades em atraso."
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">Irmão</Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {irmaos.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome_civil}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeadOrdenavel campo="irmao" ord={ord}>
                Irmão
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="mensalidades" ord={ord} className="text-right">
                Mensalidades em atraso
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="total" ord={ord} className="text-right">
                Total devido
              </TableHeadOrdenavel>
              <TableHeadOrdenavel campo="vencimento" ord={ord}>
                Vencimento mais antigo
              </TableHeadOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataFiltrada.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                  Nenhum inadimplente.
                </TableCell>
              </TableRow>
            )}
            {itensPagina.map((g) => (
              <TableRow key={g.irmao_id}>
                <TableCell>
                  {g.irmao?.nome_civil}
                  {g.irmao?.nome_simbolico ? ` (${g.irmao.nome_simbolico})` : ""}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="destructive">{g.itens.length}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{brl(g.total)}</TableCell>
                <TableCell>{fmtDate(g.itens[0].data_vencimento)}</TableCell>
              </TableRow>
            ))}
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
