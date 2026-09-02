import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  listarContasAnaliticas,
  obterSaldoAnteriorConta,
  listarItensRazao,
  listarItensRazaoVariasContas,
  type ItemRazao,
} from "@/lib/backend/contabilidade";
import { PageHeader } from "@/components/app/AppShell";
import { TabelaPaginacao } from "@/components/app/TabelaPaginacao";
import { ExportarRelatorio } from "@/components/app/ExportarRelatorio";
import { BarraFiltros, CampoFiltroCompacto, SeparadorFiltro } from "@/components/app/BarraFiltros";
import { Button } from "@/components/ui/button";
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
import { useMemo, useRef, useState } from "react";
import { brl, fmtDate, toISODate } from "@/lib/format";
import { usePaginacao } from "@/lib/use-paginacao";
import type { ColunaRelatorio } from "@/lib/relatorio-export";

// Parâmetros opcionais na URL (issue #405) — permite chegar aqui já filtrado
// a partir de outra tela (DRE: clicar numa conta abre o Razão dela no mesmo
// período), sem duplicar a visão "lançamentos de uma conta num período" que
// já existe aqui.
const razaoSearchSchema = z.object({
  contaId: z.string().uuid().optional(),
  de: z.string().optional(),
  ate: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/contabilidade/razao")({
  head: () => ({ meta: [{ title: "Razão Contábil — Gestão Maçônica" }] }),
  validateSearch: (search) => razaoSearchSchema.parse(search),
  component: Razao,
});

const CLASSE_LABEL: Record<string, string> = {
  ativo: "Ativo",
  passivo: "Passivo",
  patrimonio_liquido: "Patrimônio Líquido",
  receita: "Receita",
  despesa: "Despesa",
};
const ORDEM_CLASSE = ["ativo", "passivo", "patrimonio_liquido", "receita", "despesa"];

const COLUNAS: ColunaRelatorio[] = [
  { chave: "conta", titulo: "Conta" },
  { chave: "data", titulo: "Data" },
  { chave: "descricao", titulo: "Descrição" },
  { chave: "contraparte", titulo: "Irmão / contraparte" },
  { chave: "contrapartida", titulo: "Conta de contrapartida" },
  { chave: "debito", titulo: "Débito", formato: "moeda" },
  { chave: "credito", titulo: "Crédito", formato: "moeda" },
  { chave: "saldo", titulo: "Saldo", formato: "moeda" },
];

function primeiroDiaDoAno() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), 0, 1));
}

function linhaComSaldo(itens: ItemRazao[], saldoInicial: number) {
  let saldo = saldoInicial;
  return itens.map((i) => {
    saldo += i.tipo === "debito" ? Number(i.valor) : -Number(i.valor);
    return { ...i, saldo };
  });
}

function TabelaItensRazao({ linhas }: { linhas: (ItemRazao & { saldo: number })[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Irmão / contraparte</TableHead>
          <TableHead>Conta de contrapartida</TableHead>
          <TableHead className="text-right">Débito</TableHead>
          <TableHead className="text-right">Crédito</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
              Nenhum lançamento no período.
            </TableCell>
          </TableRow>
        )}
        {linhas.map((l) => (
          <TableRow key={l.id}>
            <TableCell>{fmtDate(l.lancamentos_contabeis.data)}</TableCell>
            <TableCell>{l.descricao ?? l.lancamentos_contabeis.descricao}</TableCell>
            <TableCell>
              {l.contraparte ? (
                <div>
                  <div className="font-medium">{l.contraparte}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.contraparte_tipo === "irmao" ? "Irmão" : "Terceiro"}
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{l.contrapartida ?? "—"}</TableCell>
            <TableCell className="text-right">{l.tipo === "debito" ? brl(l.valor) : ""}</TableCell>
            <TableCell className="text-right">{l.tipo === "credito" ? brl(l.valor) : ""}</TableCell>
            <TableCell className="text-right font-medium">{brl(l.saldo)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Razao() {
  const busca = Route.useSearch();
  const [modo, setModo] = useState<"individual" | "grupo">("individual");
  const [contaId, setContaId] = useState(busca.contaId ?? "");
  const [de, setDe] = useState(busca.de ?? primeiroDiaDoAno());
  const [ate, setAte] = useState(busca.ate ?? toISODate(new Date()));
  const deDefaultRef = useRef(de);
  const ateDefaultRef = useRef(ate);
  const [classesSelecionadas, setClassesSelecionadas] = useState<Set<string>>(
    () => new Set(ORDEM_CLASSE),
  );
  const [buscaConta, setBuscaConta] = useState("");

  const { data: contas = [] } = useQuery({
    queryKey: ["plano_contas_analiticas"],
    queryFn: () => listarContasAnaliticas(),
  });

  // ---------- Modo "Conta individual" (comportamento original) ----------
  const { data: saldoAnterior = 0 } = useQuery({
    queryKey: ["razao_saldo_anterior", contaId, de],
    enabled: modo === "individual" && !!contaId,
    queryFn: () => obterSaldoAnteriorConta({ data: { contaId, antesDe: de } }),
  });
  const { data: itensIndividual = [] } = useQuery({
    queryKey: ["razao_itens", contaId, de, ate],
    enabled: modo === "individual" && !!contaId,
    queryFn: () => listarItensRazao({ data: { contaId, de, ate } }),
  });
  const linhasIndividual = useMemo(
    () => linhaComSaldo(itensIndividual, saldoAnterior),
    [itensIndividual, saldoAnterior],
  );
  const { itensPagina, pagina, totalPaginas, totalItens, tamanhoPagina, setPagina } =
    usePaginacao(linhasIndividual);
  const totalDebitoIndividual = itensIndividual
    .filter((i) => i.tipo === "debito")
    .reduce((s, i) => s + Number(i.valor), 0);
  const totalCreditoIndividual = itensIndividual
    .filter((i) => i.tipo === "credito")
    .reduce((s, i) => s + Number(i.valor), 0);

  // ---------- Modo "Grupo de contas" ----------
  const { data: contasComRazao = [] } = useQuery({
    queryKey: ["razao_varias_contas", de, ate],
    enabled: modo === "grupo",
    queryFn: () => listarItensRazaoVariasContas({ data: { contaIds: null, de, ate } }),
  });
  const buscaNormalizada = buscaConta.trim().toLowerCase();
  const contasFiltradas = contasComRazao.filter((c) => {
    if (!classesSelecionadas.has(c.tipo)) return false;
    if (!buscaNormalizada) return true;
    return (
      c.codigo.toLowerCase().includes(buscaNormalizada) ||
      c.nome.toLowerCase().includes(buscaNormalizada)
    );
  });
  const toggleClasse = (classe: string) => {
    setClassesSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(classe)) novo.delete(classe);
      else novo.add(classe);
      return novo;
    });
  };

  const temFiltroAtivoGrupo =
    de !== deDefaultRef.current ||
    ate !== ateDefaultRef.current ||
    classesSelecionadas.size !== ORDEM_CLASSE.length ||
    buscaConta.trim() !== "";

  const limparFiltrosGrupo = () => {
    setDe(deDefaultRef.current);
    setAte(ateDefaultRef.current);
    setClassesSelecionadas(new Set(ORDEM_CLASSE));
    setBuscaConta("");
  };

  const linhasExportacao = useMemo(() => {
    if (modo === "individual") {
      return linhasIndividual.map((l) => ({
        conta: contas.find((c) => c.id === contaId)
          ? `${contas.find((c) => c.id === contaId)!.codigo} — ${contas.find((c) => c.id === contaId)!.nome}`
          : "",
        data: fmtDate(l.lancamentos_contabeis.data),
        descricao: l.descricao ?? l.lancamentos_contabeis.descricao,
        contraparte: l.contraparte ?? "",
        contrapartida: l.contrapartida ?? "",
        debito: l.tipo === "debito" ? l.valor : "",
        credito: l.tipo === "credito" ? l.valor : "",
        saldo: l.saldo,
      }));
    }
    return contasFiltradas.flatMap((c) =>
      linhaComSaldo(c.itens, c.saldoAnterior).map((l) => ({
        conta: `${c.codigo} — ${c.nome}`,
        data: fmtDate(l.lancamentos_contabeis.data),
        descricao: l.descricao ?? l.lancamentos_contabeis.descricao,
        contraparte: l.contraparte ?? "",
        contrapartida: l.contrapartida ?? "",
        debito: l.tipo === "debito" ? l.valor : "",
        credito: l.tipo === "credito" ? l.valor : "",
        saldo: l.saldo,
      })),
    );
  }, [modo, linhasIndividual, contasFiltradas, contas, contaId]);

  return (
    <>
      <PageHeader
        title="Razão Contábil"
        description="Movimentação pelo regime de caixa, com saldo acumulado — de uma conta, de um grupo, ou de todas."
        actions={
          <ExportarRelatorio titulo="Razão Contábil" colunas={COLUNAS} linhas={linhasExportacao} />
        }
      />

      <Card className="mb-4 p-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={modo === "individual" ? "default" : "outline"}
          onClick={() => setModo("individual")}
        >
          Conta individual
        </Button>
        <Button
          type="button"
          size="sm"
          variant={modo === "grupo" ? "default" : "outline"}
          onClick={() => setModo("grupo")}
        >
          Grupo de contas / Tudo
        </Button>
      </Card>

      {modo === "individual" ? (
        <>
          <Card className="mb-4 p-4 grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label htmlFor="razao-conta">Conta</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger id="razao-conta">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} — {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="razao-de">De</Label>
              <Input id="razao-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="razao-ate">Até</Label>
              <Input
                id="razao-ate"
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
          </Card>

          {contaId && (
            <>
              <div className="grid gap-4 md:grid-cols-3 mb-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Saldo anterior</div>
                  <div className="text-xl font-semibold">{brl(saldoAnterior)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Débitos do período</div>
                  <div className="text-xl font-semibold">{brl(totalDebitoIndividual)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Créditos do período</div>
                  <div className="text-xl font-semibold">{brl(totalCreditoIndividual)}</div>
                </Card>
              </div>

              <Card>
                <TabelaItensRazao linhas={itensPagina} />
                <TabelaPaginacao
                  pagina={pagina}
                  totalPaginas={totalPaginas}
                  totalItens={totalItens}
                  tamanhoPagina={tamanhoPagina}
                  setPagina={setPagina}
                />
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          <BarraFiltros temFiltroAtivo={temFiltroAtivoGrupo} onLimpar={limparFiltrosGrupo}>
            <CampoFiltroCompacto label="De" htmlFor="razao-grupo-de">
              <Input
                id="razao-grupo-de"
                type="date"
                className="h-8 w-[150px]"
                value={de}
                onChange={(e) => setDe(e.target.value)}
              />
            </CampoFiltroCompacto>
            <CampoFiltroCompacto label="Até" htmlFor="razao-grupo-ate">
              <Input
                id="razao-grupo-ate"
                type="date"
                className="h-8 w-[150px]"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
              />
            </CampoFiltroCompacto>
            <SeparadorFiltro />
            {ORDEM_CLASSE.map((classe) => (
              <Button
                key={classe}
                type="button"
                size="sm"
                variant={classesSelecionadas.has(classe) ? "default" : "outline"}
                onClick={() => toggleClasse(classe)}
              >
                {CLASSE_LABEL[classe]}
              </Button>
            ))}
            <SeparadorFiltro />
            <CampoFiltroCompacto label="Buscar conta" htmlFor="razao-grupo-busca">
              <Input
                id="razao-grupo-busca"
                placeholder="Código ou nome…"
                className="h-8 w-[180px]"
                value={buscaConta}
                onChange={(e) => setBuscaConta(e.target.value)}
              />
            </CampoFiltroCompacto>
          </BarraFiltros>

          {contasFiltradas.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground">
              Nenhuma conta com movimento no período, com os filtros atuais.
            </Card>
          )}

          {contasFiltradas.map((c) => {
            const linhasConta = linhaComSaldo(c.itens, c.saldoAnterior);
            const debitoConta = c.itens
              .filter((i) => i.tipo === "debito")
              .reduce((s, i) => s + Number(i.valor), 0);
            const creditoConta = c.itens
              .filter((i) => i.tipo === "credito")
              .reduce((s, i) => s + Number(i.valor), 0);
            return (
              <Card key={c.contaId} className="mb-4">
                <div className="p-3 border-b flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm text-muted-foreground mr-2">{c.codigo}</span>
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({CLASSE_LABEL[c.tipo]})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Saldo anterior: <span className="font-medium">{brl(c.saldoAnterior)}</span> ·
                    Débito: <span className="font-medium">{brl(debitoConta)}</span> · Crédito:{" "}
                    <span className="font-medium">{brl(creditoConta)}</span>
                  </div>
                </div>
                <TabelaItensRazao linhas={linhasConta} />
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}
