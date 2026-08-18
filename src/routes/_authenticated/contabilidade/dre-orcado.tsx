import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  listarOrcamentos,
  listarOrcamentoItens,
  listarContasOrcamento,
} from "@/lib/backend/contabilidade-orcamento";
import { listarItensContabeisPeriodo } from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
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
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { useMemo, useState } from "react";
import { brl } from "@/lib/format";
import { useOrdenacao } from "@/lib/use-ordenacao";

export const Route = createFileRoute("/_authenticated/contabilidade/dre-orcado")({
  head: () => ({ meta: [{ title: "DRE Orçado — Gestão Maçônica" }] }),
  component: DreOrcado,
});

type Linha = {
  id: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
  orcado: number;
  realizado: number;
};

function DreOrcado() {
  const [orcamentoId, setOrcamentoId] = useState<string>("");

  const { data: orcamentos = [] } = useQuery({
    queryKey: ["orcamentos_para_dre"],
    queryFn: () => listarOrcamentos(),
  });

  const selecionado = orcamentos.find((o) => o.id === orcamentoId) ?? orcamentos[0] ?? null;

  const { data: contas = [] } = useQuery({
    queryKey: ["plano_contas_orcamento"],
    queryFn: () => listarContasOrcamento(),
  });

  const { data: itens = [] } = useQuery({
    queryKey: ["dre_orcado_itens", selecionado?.id],
    enabled: !!selecionado,
    queryFn: () => listarOrcamentoItens({ data: { orcamentoId: selecionado!.id } }),
  });

  const { data: realizado = [] } = useQuery({
    queryKey: ["dre_orcado_realizado", selecionado?.ano],
    enabled: !!selecionado,
    queryFn: () =>
      listarItensContabeisPeriodo({
        data: { de: `${selecionado!.ano}-01-01`, ate: `${selecionado!.ano}-12-31` },
      }),
  });

  const linhas = useMemo(() => {
    const porConta = new Map<string, Linha>();
    const contaPorId = new Map(contas.map((c) => [c.id, c]));
    for (const it of itens) {
      const conta = contaPorId.get(it.conta_id);
      if (!conta) continue;
      const atual = porConta.get(conta.id) ?? {
        id: conta.id,
        codigo: conta.codigo,
        nome: conta.nome,
        tipo: conta.tipo,
        orcado: 0,
        realizado: 0,
      };
      atual.orcado += Number(it.valor);
      porConta.set(conta.id, atual);
    }
    for (const it of realizado) {
      if (it.conta_tipo !== "receita" && it.conta_tipo !== "despesa") continue;
      const atual = porConta.get(it.conta_id) ?? {
        id: it.conta_id,
        codigo: it.codigo,
        nome: it.nome,
        tipo: it.conta_tipo,
        orcado: 0,
        realizado: 0,
      };
      const sinal =
        it.conta_tipo === "receita"
          ? it.tipo === "credito"
            ? 1
            : -1
          : it.tipo === "debito"
            ? 1
            : -1;
      atual.realizado += sinal * Number(it.valor);
      porConta.set(it.conta_id, atual);
    }
    return Array.from(porConta.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [itens, realizado, contas]);

  const receitas = linhas.filter((l) => l.tipo === "receita");
  const despesas = linhas.filter((l) => l.tipo === "despesa");
  const ordReceitas = useOrdenacao(receitas, {
    conta: (l) => l.codigo,
    orcado: (l) => l.orcado,
    realizado: (l) => l.realizado,
    diferenca: (l) => l.realizado - l.orcado,
  });
  const ordDespesas = useOrdenacao(despesas, {
    conta: (l) => l.codigo,
    orcado: (l) => l.orcado,
    realizado: (l) => l.realizado,
    diferenca: (l) => l.realizado - l.orcado,
  });
  const totalReceitaOrcado = receitas.reduce((s, l) => s + l.orcado, 0);
  const totalReceitaReal = receitas.reduce((s, l) => s + l.realizado, 0);
  const totalDespesaOrcado = despesas.reduce((s, l) => s + l.orcado, 0);
  const totalDespesaReal = despesas.reduce((s, l) => s + l.realizado, 0);
  const resultadoOrcado = totalReceitaOrcado - totalDespesaOrcado;
  const resultadoReal = totalReceitaReal - totalDespesaReal;

  return (
    <>
      <PageHeader
        title="DRE Orçado"
        description="Comparativo entre o orçamento anual aprovado e o resultado realizado, por conta."
      />

      <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4 items-end">
        <div className="md:col-span-2">
          <Label htmlFor="dre-orcado-orcamento">Orçamento</Label>
          <Select value={selecionado?.id ?? ""} onValueChange={setOrcamentoId}>
            <SelectTrigger id="dre-orcado-orcamento">
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {orcamentos.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.ano} {o.status === "aprovado" ? "— aprovado" : "— rascunho"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selecionado && selecionado.status !== "aprovado" && (
          <div className="md:col-span-2">
            <Badge variant="outline">
              Orçamento ainda em rascunho — os valores orçados abaixo podem mudar até a aprovação.
            </Badge>
          </div>
        )}
      </Card>

      {!selecionado && (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum orçamento cadastrado ainda.
        </Card>
      )}

      {selecionado && (
        <>
          <Card className="mb-4">
            <div className="p-3 border-b font-medium">Receitas</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="conta" ord={ordReceitas}>
                    Conta
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="orcado" ord={ordReceitas} className="text-right">
                    Orçado
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="realizado" ord={ordReceitas} className="text-right">
                    Realizado
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="diferenca" ord={ordReceitas} className="text-right">
                    Diferença
                  </TableHeadOrdenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receitas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhuma receita orçada ou realizada neste ano.
                    </TableCell>
                  </TableRow>
                )}
                {ordReceitas.itensOrdenados.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">
                      {l.codigo} {l.nome}
                    </TableCell>
                    <TableCell className="text-right">{brl(l.orcado)}</TableCell>
                    <TableCell className="text-right">{brl(l.realizado)}</TableCell>
                    <TableCell
                      className={`text-right ${l.realizado >= l.orcado ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {brl(l.realizado - l.orcado)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell>Total de Receitas</TableCell>
                  <TableCell className="text-right">{brl(totalReceitaOrcado)}</TableCell>
                  <TableCell className="text-right">{brl(totalReceitaReal)}</TableCell>
                  <TableCell
                    className={`text-right ${totalReceitaReal >= totalReceitaOrcado ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {brl(totalReceitaReal - totalReceitaOrcado)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          <Card className="mb-4">
            <div className="p-3 border-b font-medium">Despesas</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="conta" ord={ordDespesas}>
                    Conta
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="orcado" ord={ordDespesas} className="text-right">
                    Orçado
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="realizado" ord={ordDespesas} className="text-right">
                    Realizado
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="diferenca" ord={ordDespesas} className="text-right">
                    Diferença
                  </TableHeadOrdenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {despesas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhuma despesa orçada ou realizada neste ano.
                    </TableCell>
                  </TableRow>
                )}
                {ordDespesas.itensOrdenados.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">
                      {l.codigo} {l.nome}
                    </TableCell>
                    <TableCell className="text-right">{brl(l.orcado)}</TableCell>
                    <TableCell className="text-right">{brl(l.realizado)}</TableCell>
                    <TableCell
                      className={`text-right ${l.realizado <= l.orcado ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {brl(l.realizado - l.orcado)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell>Total de Despesas</TableCell>
                  <TableCell className="text-right">{brl(totalDespesaOrcado)}</TableCell>
                  <TableCell className="text-right">{brl(totalDespesaReal)}</TableCell>
                  <TableCell
                    className={`text-right ${totalDespesaReal <= totalDespesaOrcado ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {brl(totalDespesaReal - totalDespesaOrcado)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          <Card className="p-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Resultado orçado</div>
              <div
                className={`text-2xl font-bold ${resultadoOrcado >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {brl(resultadoOrcado)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Resultado realizado</div>
              <div
                className={`text-2xl font-bold ${resultadoReal >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {brl(resultadoReal)}
              </div>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
