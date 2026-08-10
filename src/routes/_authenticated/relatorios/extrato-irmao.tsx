import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { relatorioExtratoIrmao, type ItemExtratoIrmao } from "@/lib/backend/relatorios";
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
  { chave: "valor", titulo: "Valor" },
  { chave: "status", titulo: "Status" },
  { chave: "pago_em", titulo: "Pago em" },
];

const TIPO_LABEL: Record<string, string> = {
  saida: "Saída/Estorno",
  transferencia: "Transferência",
};

const hoje = new Date().toISOString().slice(0, 10);

function diasAtraso(vencimento: string | null): number {
  if (!vencimento) return 0;
  const ms = new Date(hoje).getTime() - new Date(vencimento).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

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

  const irmaoNome = irmaos.find((i) => i.id === irmaoId)?.nome_civil ?? "";

  const emAberto = itens.filter((i) => !i.pago);
  const historico = itens.filter((i) => i.pago || Number(i.valor_pago) > 0);

  const totalPago = itens.reduce((s, i) => s + Number(i.valor_pago), 0);
  const totalAberto = emAberto.reduce((s, i) => s + (Number(i.valor) - Number(i.valor_pago)), 0);
  const atrasadas = emAberto.filter((i) => diasAtraso(i.data_vencimento) > 0);
  const totalAtrasado = atrasadas.reduce((s, i) => s + (Number(i.valor) - Number(i.valor_pago)), 0);

  const statusLabel = (i: ItemExtratoIrmao) => {
    if (i.pago) return "Pago";
    const atrasado = diasAtraso(i.data_vencimento) > 0;
    if (Number(i.valor_pago) > 0) return atrasado ? "Parcial (atrasado)" : "Parcial";
    return atrasado ? "Atrasado" : "A vencer";
  };

  const statusBadgeVariant = (status: string) =>
    status === "Atrasado" || status === "Parcial (atrasado)"
      ? ("destructive" as const)
      : status === "Pago"
        ? ("secondary" as const)
        : ("outline" as const);

  const valorExibido = (i: ItemExtratoIrmao) =>
    Number(i.valor_pago) > 0 ? Number(i.valor_pago) : Number(i.valor);

  const linhasExportacao = itens.map((i) => ({
    data: fmtDate(i.data),
    vencimento: i.data_vencimento ? fmtDate(i.data_vencimento) : "—",
    descricao: i.descricao,
    valor: valorExibido(i),
    status: statusLabel(i),
    pago_em: i.data_pagamento ? fmtDate(i.data_pagamento) : "—",
  }));

  const ordAberto = useOrdenacao(emAberto, {
    vencimento: (i) => i.data_vencimento,
    descricao: (i) => i.descricao,
    valor: (i) => Number(i.valor) - Number(i.valor_pago),
    status: (i) => statusLabel(i),
    dias_atraso: (i) => diasAtraso(i.data_vencimento),
  });
  // Padrão: vencimento mais próximo (ou mais atrasado) primeiro — é o que
  // importa pro irmão decidir o que pagar antes.
  const abertoOrdenado =
    ordAberto.coluna === null
      ? [...emAberto].sort(
          (a, b) =>
            new Date(a.data_vencimento ?? a.data).getTime() -
            new Date(b.data_vencimento ?? b.data).getTime(),
        )
      : ordAberto.itensOrdenados;

  const ordHistorico = useOrdenacao(historico, {
    pago_em: (i) => i.data_pagamento ?? i.data,
    descricao: (i) => i.descricao,
    valor: (i) => valorExibido(i),
  });
  const historicoOrdenado =
    ordHistorico.coluna === null
      ? [...historico].sort(
          (a, b) =>
            new Date(b.data_pagamento ?? b.data).getTime() -
            new Date(a.data_pagamento ?? a.data).getTime(),
        )
      : ordHistorico.itensOrdenados;

  const pagHistorico = usePaginacao(historicoOrdenado);

  return (
    <>
      <PageHeader
        title="Relatório de Extrato do Irmão"
        description="O que está em aberto (com vencimento e atraso em destaque) e o histórico do que já foi pago."
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
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Total pago</div>
              <div className="text-2xl font-semibold">{brl(totalPago)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Total em aberto</div>
              <div className="text-2xl font-semibold">{brl(totalAberto)}</div>
            </Card>
            <Card className={`p-4 ${totalAtrasado > 0 ? "border-destructive" : ""}`}>
              <div className="text-sm text-muted-foreground">Total atrasado</div>
              <div
                className={`text-2xl font-semibold ${totalAtrasado > 0 ? "text-destructive" : ""}`}
              >
                {brl(totalAtrasado)}
              </div>
              {atrasadas.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {atrasadas.length} fatura(s) vencida(s)
                </div>
              )}
            </Card>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Em aberto ({emAberto.length})
          </h3>
          <Card className="mb-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeadOrdenavel campo="vencimento" ord={ordAberto}>
                      Vencimento
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="descricao" ord={ordAberto}>
                      Descrição
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="valor" ord={ordAberto} className="text-right">
                      Valor devido
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="status" ord={ordAberto}>
                      Situação
                    </TableHeadOrdenavel>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {abertoOrdenado.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        Nada em aberto — tudo pago.
                      </TableCell>
                    </TableRow>
                  )}
                  {abertoOrdenado.map((i) => {
                    const status = statusLabel(i);
                    const dias = diasAtraso(i.data_vencimento);
                    return (
                      <TableRow key={i.id}>
                        <TableCell>
                          {i.data_vencimento ? fmtDate(i.data_vencimento) : "—"}
                        </TableCell>
                        <TableCell>
                          {i.descricao}
                          {i.tipo !== "entrada" && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({TIPO_LABEL[i.tipo] ?? i.tipo})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {brl(Number(i.valor) - Number(i.valor_pago))}
                          {Number(i.valor_pago) > 0 && (
                            <div className="text-xs font-normal text-muted-foreground">
                              já pago {brl(i.valor_pago)} de {brl(i.valor)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(status)}>
                            {status === "Atrasado" ? `Atrasado (${dias}d)` : status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Histórico de pagamentos ({historico.length})
          </h3>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHeadOrdenavel campo="pago_em" ord={ordHistorico}>
                      Pago em
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="descricao" ord={ordHistorico}>
                      Descrição
                    </TableHeadOrdenavel>
                    <TableHeadOrdenavel campo="valor" ord={ordHistorico} className="text-right">
                      Valor pago
                    </TableHeadOrdenavel>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagHistorico.itensPagina.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        Nenhum pagamento no período.
                      </TableCell>
                    </TableRow>
                  )}
                  {pagHistorico.itensPagina.map((i) => {
                    const status = statusLabel(i);
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="text-muted-foreground">
                          {i.data_pagamento ? fmtDate(i.data_pagamento) : "—"}
                        </TableCell>
                        <TableCell>
                          {i.descricao}
                          {i.tipo !== "entrada" && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({TIPO_LABEL[i.tipo] ?? i.tipo})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {brl(valorExibido(i))}
                          {status === "Parcial" && (
                            <div className="text-xs font-normal text-muted-foreground">
                              de {brl(i.valor)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <TabelaPaginacao
              pagina={pagHistorico.pagina}
              totalPaginas={pagHistorico.totalPaginas}
              totalItens={pagHistorico.totalItens}
              tamanhoPagina={pagHistorico.tamanhoPagina}
              setPagina={pagHistorico.setPagina}
            />
          </Card>
        </>
      )}
    </>
  );
}
