import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { brl, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/relatorios/inadimplentes")({
  head: () => ({ meta: [{ title: "Inadimplentes — Gestão Maçônica" }] }),
  component: Inadimplentes,
});

function Inadimplentes() {
  const { data } = useQuery({
    queryKey: ["inadimplentes"],
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data: pend } = await supabase
        .from("lancamentos")
        .select("id, irmao_id, valor, data_vencimento, competencia_mes, descricao, irmaos(nome_civil, nome_simbolico)")
        .eq("is_mensalidade", true)
        .eq("pago", false)
        .lt("data_vencimento", hoje)
        .order("data_vencimento");

      const grupos = new Map<string, any>();
      (pend ?? []).forEach((l: any) => {
        const key = l.irmao_id;
        if (!key) return;
        const cur = grupos.get(key) ?? { irmao: l.irmaos, itens: [], total: 0 };
        cur.itens.push(l);
        cur.total += Number(l.valor);
        grupos.set(key, cur);
      });
      return Array.from(grupos.values()).filter((g) => g.itens.length >= 3);
    },
  });

  return (
    <>
      <PageHeader
        title="Relatório de Inadimplentes"
        description="Irmãos com 3 ou mais mensalidades em atraso."
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Irmão</TableHead>
              <TableHead className="text-right">Mensalidades em atraso</TableHead>
              <TableHead className="text-right">Total devido</TableHead>
              <TableHead>Vencimento mais antigo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum inadimplente.</TableCell></TableRow>
            )}
            {(data ?? []).map((g: any) => (
              <TableRow key={g.irmao?.nome_civil}>
                <TableCell>{g.irmao?.nome_civil}{g.irmao?.nome_simbolico ? ` (${g.irmao.nome_simbolico})` : ""}</TableCell>
                <TableCell className="text-right"><Badge variant="destructive">{g.itens.length}</Badge></TableCell>
                <TableCell className="text-right font-medium">{brl(g.total)}</TableCell>
                <TableCell>{fmtDate(g.itens[0].data_vencimento)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
