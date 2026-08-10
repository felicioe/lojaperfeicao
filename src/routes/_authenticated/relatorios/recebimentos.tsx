import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { relatorioRecebimentos } from "@/lib/backend/relatorios";
import { listarContasFinanceiras } from "@/lib/backend/tesouraria-contas";
import { listarIrmaosNomes } from "@/lib/backend/irmaos";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { CATEGORIA_LABEL } from "@/components/app/RecebimentoAvulso";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useState } from "react";
import { brl, fmtDate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

export const Route = createFileRoute("/_authenticated/relatorios/recebimentos")({
  head: () => ({ meta: [{ title: "Recebimentos no Mês — Gestão Maçônica" }] }),
  component: Recebimentos,
});

const COLUNAS: ColunaRelatorio[] = [
  { chave: "data_pagamento", titulo: "Data" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "irmao_nome", titulo: "Irmão" },
  { chave: "categoria", titulo: "Categoria" },
  { chave: "forma_pagamento", titulo: "Forma de pagamento" },
  { chave: "conta_nome", titulo: "Conta" },
  { chave: "valor", titulo: "Valor" },
];

function Recebimentos() {
  const [competenciaMes, setCompetenciaMes] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [contaId, setContaId] = useState("todas");
  const [categoria, setCategoria] = useState("todas");
  const [irmaoId, setIrmaoId] = useState("todos");
  const [formaPagamento, setFormaPagamento] = useState("");

  const { data: contas = [] } = useQuery({
    queryKey: ["contas_financeiras_ativas"],
    queryFn: () => listarContasFinanceiras(),
  });
  const { data: irmaos = [] } = useQuery({
    queryKey: ["irmaos_nomes"],
    queryFn: () => listarIrmaosNomes(),
  });

  const { data: itens = [] } = useQuery({
    queryKey: [
      "relatorio_recebimentos",
      competenciaMes,
      de,
      ate,
      contaId,
      categoria,
      irmaoId,
      formaPagamento,
    ],
    queryFn: () =>
      relatorioRecebimentos({
        data: {
          competenciaMes: competenciaMes || null,
          de: de || null,
          ate: ate || null,
          contaId: contaId === "todas" ? null : contaId,
          categoria: categoria === "todas" ? null : categoria,
          irmaoId: irmaoId === "todos" ? null : irmaoId,
          formaPagamento: formaPagamento || null,
        },
      }),
  });

  const totalGeral = itens.reduce((s, i) => s + Number(i.valor), 0);
  const porFormaPagamento = new Map<string, number>();
  for (const i of itens) {
    const chave = i.forma_pagamento || "Não informado";
    porFormaPagamento.set(chave, (porFormaPagamento.get(chave) ?? 0) + Number(i.valor));
  }

  const linhasExportacao = itens.map((i) => ({
    data_pagamento: fmtDate(i.data_pagamento),
    descricao: i.descricao,
    irmao_nome: i.irmao_nome ?? "—",
    categoria: i.categoria_recebimento ? CATEGORIA_LABEL[i.categoria_recebimento] : "—",
    forma_pagamento: i.forma_pagamento ?? "—",
    conta_nome: i.conta_nome ?? "—",
    valor: Number(i.valor),
  }));

  const ord = useOrdenacao(itens, {
    data_pagamento: (i) => i.data_pagamento,
    descricao: (i) => i.descricao,
    irmao_nome: (i) => i.irmao_nome,
    categoria: (i) => i.categoria_recebimento,
    forma_pagamento: (i) => i.forma_pagamento,
    conta_nome: (i) => i.conta_nome,
    valor: (i) => Number(i.valor),
  });
  const pag = usePaginacao(ord.itensOrdenados);

  return (
    <>
      <PageHeader
        title="Relatório de Recebimentos no Mês"
        description="Entradas já pagas, com filtros por competência, período, conta, categoria, irmão e forma de pagamento."
        actions={
          <ExportarRelatorio titulo="Recebimentos" colunas={COLUNAS} linhas={linhasExportacao} />
        }
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">Competência (mês)</Label>
          <Input
            type="month"
            value={competenciaMes ? competenciaMes.slice(0, 7) : ""}
            onChange={(e) => setCompetenciaMes(e.target.value ? `${e.target.value}-01` : "")}
          />
        </div>
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Conta</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {contas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {Object.entries(CATEGORIA_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        <div>
          <Label className="text-xs">Forma de pagamento</Label>
          <Input
            placeholder="PIX, dinheiro…"
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total recebido</div>
          <div className="text-2xl font-semibold">{brl(totalGeral)}</div>
          <div className="text-xs text-muted-foreground">{itens.length} lançamento(s)</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground mb-1">Por forma de pagamento</div>
          <div className="space-y-0.5 text-sm">
            {Array.from(porFormaPagamento.entries()).map(([forma, valor]) => (
              <div key={forma} className="flex justify-between">
                <span className="text-muted-foreground">{forma}</span>
                <span className="font-medium">{brl(valor)}</span>
              </div>
            ))}
            {porFormaPagamento.size === 0 && (
              <div className="text-muted-foreground">Nenhum recebimento no filtro.</div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeadOrdenavel campo="data_pagamento" ord={ord}>
                  Data
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="descricao" ord={ord}>
                  Descrição
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="irmao_nome" ord={ord}>
                  Irmão
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="categoria" ord={ord}>
                  Categoria
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="forma_pagamento" ord={ord}>
                  Forma de pagamento
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="conta_nome" ord={ord}>
                  Conta
                </TableHeadOrdenavel>
                <TableHeadOrdenavel campo="valor" ord={ord} className="text-right">
                  Valor
                </TableHeadOrdenavel>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    Nenhum recebimento encontrado.
                  </TableCell>
                </TableRow>
              )}
              {pag.itensPagina.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{fmtDate(i.data_pagamento)}</TableCell>
                  <TableCell>{i.descricao}</TableCell>
                  <TableCell className="text-muted-foreground">{i.irmao_nome ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {i.categoria_recebimento ? CATEGORIA_LABEL[i.categoria_recebimento] : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {i.forma_pagamento ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{i.conta_nome ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{brl(i.valor)}</TableCell>
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
  );
}
