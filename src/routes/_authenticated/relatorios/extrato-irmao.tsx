import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { relatorioExtratoIrmao } from "@/lib/backend/relatorios";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useState } from "react";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/relatorios/extrato-irmao")({
  head: () => ({ meta: [{ title: "Extrato do Irmão — Gestão Maçônica" }] }),
  component: ExtratoIrmao,
});

const COLUNAS: ColunaRelatorio[] = [
  { chave: "data", titulo: "Emissão" },
  { chave: "vencimento", titulo: "Vencimento" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "tipo", titulo: "Tipo" },
  { chave: "valor", titulo: "Valor" },
  { chave: "status", titulo: "Status" },
  { chave: "pago_em", titulo: "Pago em" },
];

function ExtratoIrmao() {
  const [irmaoId, setIrmaoId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["relatorio_extrato_irmao", irmaoId, de, ate],
    enabled: !!irmaoId,
    queryFn: () => relatorioExtratoIrmao({ data: { irmaoId, de: de || null, ate: ate || null } }),
  });

  const totalPago = itens.reduce((s, i) => s + Number(i.valor_pago), 0);
  const totalAberto = itens
    .filter((i) => !i.pago)
    .reduce((s, i) => s + (Number(i.valor) - Number(i.valor_pago)), 0);
  const irmaoNome = irmaos.find((i) => i.id === irmaoId)?.nome_civil ?? "";

  const statusLabel = (i: (typeof itens)[number]) =>
    i.pago ? "Pago" : i.valor_pago > 0 ? "Parcial" : "Aberto";

  // Pra título pago (ou parcialmente pago), mostrar o saldo em aberto (que
  // fica 0 quando quitado) não diz nada útil — o que importa aqui é quanto
  // o irmão efetivamente pagou. Só pra título ainda totalmente em aberto
  // (valor_pago = 0) o valor devido faz sentido como número principal.
  const valorExibido = (i: (typeof itens)[number]) =>
    Number(i.valor_pago) > 0 ? Number(i.valor_pago) : Number(i.valor);

  const linhasExportacao = itens.map((i) => ({
    data: fmtDate(i.data),
    vencimento: i.data_vencimento ? fmtDate(i.data_vencimento) : "—",
    descricao: i.descricao,
    tipo: i.tipo,
    valor: valorExibido(i),
    status: statusLabel(i),
    pago_em: i.data_pagamento ? fmtDate(i.data_pagamento) : "—",
  }));

  const ord = useOrdenacao(itens, {
    emissao: (i) => i.data,
    vencimento: (i) => i.data_vencimento,
    descricao: (i) => i.descricao,
    tipo: (i) => i.tipo,
    valor: (i) => valorExibido(i),
    status: (i) => statusLabel(i),
    pago_em: (i) => i.data_pagamento,
  });
  const pag = usePaginacao(ord.itensOrdenados);

  return (
    <>
      <PageHeader
        title="Relatório de Extrato do Irmão"
        description="Histórico de faturas e lançamentos de um irmão específico, com status e período."
        actions={
          irmaoId && (
            <ExportarRelatorio
              titulo={`Extrato — ${irmaoNome}`}
              colunas={COLUNAS}
              linhas={linhasExportacao}
            />
          )
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-3">
        <div>
          <Label className="text-xs">Irmão</Label>
          <Select value={irmaoId} onValueChange={setIrmaoId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {irmaos.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.nome_civil}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </Card>

      {!irmaoId && (
        <Card className="p-6 text-center text-muted-foreground">
          Selecione um irmão para ver o extrato.
        </Card>
      )}

      {irmaoId && (
        <>
          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Total pago</div>
              <div className="text-2xl font-semibold">{brl(totalPago)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Total em aberto</div>
              <div className="text-2xl font-semibold">{brl(totalAberto)}</div>
            </Card>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeadOrdenavel campo="emissao" ord={ord}>
                      Emissão
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="vencimento" ord={ord}>
                      Vencimento
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="descricao" ord={ord}>
                      Descrição
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="tipo" ord={ord}>
                      Tipo
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                      Valor
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="status" ord={ord}>
                      Status
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="pago_em" ord={ord}>
                      Pago em
                    </TableHeadOrdenavel>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        Nenhum lançamento encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                  {pag.itensPagina.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{fmtDate(i.data)}</TableCell>
                      <TableCell>{i.data_vencimento ? fmtDate(i.data_vencimento) : "—"}</TableCell>
                      <TableCell>{i.descricao}</TableCell>
                      <TableCell className="text-muted-foreground">{i.tipo}</TableCell>
                      <TableCell className="text-right font-medium">
                        {brl(valorExibido(i))}
                        {Number(i.valor_pago) > 0 && Number(i.valor_pago) !== Number(i.valor) && (
                          <div className="text-xs font-normal text-muted-foreground">
                            de {brl(i.valor)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusLabel(i) === "Aberto" ? "outline" : "secondary"}>
                          {statusLabel(i)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {i.data_pagamento ? fmtDate(i.data_pagamento) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TabelaPaginacao
              pagina={pag.pagina}
              totalPaginas={pag.totalPaginas}
              totalItens={pag.totalItens}
              tamanhoPagina={pag.tamanhoPagina}
              setPagina={pag.setPagina}
            />
          </Card>
        </>
      )}
    </>
  );
}
