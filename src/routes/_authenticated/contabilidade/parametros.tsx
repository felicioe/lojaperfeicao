import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  obterParametrosContabeis,
  salvarParametrosContabeis,
  PAPEL_INFO,
  PAPEIS_CONTABEIS,
  type PapelContabil,
} from "@/lib/backend/parametros-contabeis";
import { listarPlanoContas } from "@/lib/backend/plano-contas";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contabilidade/parametros")({
  head: () => ({ meta: [{ title: "Parâmetros Contábeis — Gestão Maçônica" }] }),
  component: ParametrosContabeis,
});

function ParametrosContabeis() {
  const qc = useQueryClient();
  const [selecoes, setSelecoes] = useState<Record<PapelContabil, string>>(
    () => Object.fromEntries(PAPEIS_CONTABEIS.map((p) => [p, ""])) as Record<PapelContabil, string>,
  );
  const [carregouInicial, setCarregouInicial] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: parametros = [] } = useQuery({
    queryKey: ["parametros_contabeis"],
    queryFn: () => obterParametrosContabeis(),
  });
  const { data: contas = [] } = useQuery({
    queryKey: ["plano_contas_all"],
    queryFn: () => listarPlanoContas(),
  });

  // Preenche a seleção a partir do que já está configurado — só na primeira
  // carga, pra não sobrescrever o que o usuário está editando quando o
  // React Query revalida a query em segundo plano.
  useEffect(() => {
    if (carregouInicial) return;
    if (parametros.length === 0) return;
    setSelecoes((atual) => {
      const proximo = { ...atual };
      for (const p of parametros) proximo[p.papel] = p.planoContaId;
      return proximo;
    });
    setCarregouInicial(true);
  }, [parametros, carregouInicial]);

  const contasPorPapel = (papel: PapelContabil) => {
    const info = PAPEL_INFO[papel];
    return contas.filter(
      (c) => c.analitica && (info.permiteInativa || c.ativo) && c.tipo === info.tipo,
    );
  };

  const faltando = PAPEIS_CONTABEIS.filter((p) => !selecoes[p]);
  const tudoPreenchido = faltando.length === 0;

  const salvar = async () => {
    if (!tudoPreenchido) {
      return toast.error("Configure todos os papéis contábeis antes de salvar.");
    }
    setSalvando(true);
    try {
      await salvarParametrosContabeis({
        data: {
          itens: PAPEIS_CONTABEIS.map((papel) => ({ papel, planoContaId: selecoes[papel] })),
        },
      });
      toast.success("Parâmetros contábeis salvos.");
      qc.invalidateQueries({ queryKey: ["parametros_contabeis"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Parâmetros Contábeis"
        description="Mapeia cada papel usado pelas rotinas financeiras (mensalidades, fornecedores, multas e juros…) para uma conta do plano desta Loja."
      />

      {!tudoPreenchido && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/50 bg-warning-muted p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {faltando.length} papel{faltando.length > 1 ? "éis" : ""} ainda sem conta configurada:{" "}
            {faltando.map((p) => PAPEL_INFO[p].label).join(", ")}. Baixas e fechamentos que dependem
            deles vão recusar até serem configurados.
          </span>
        </div>
      )}

      <div className="grid gap-3">
        {PAPEIS_CONTABEIS.map((papel) => {
          const info = PAPEL_INFO[papel];
          const opcoes = contasPorPapel(papel);
          const configurado = !!selecoes[papel];
          return (
            <Card key={papel}>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_20rem] sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`parametro-${papel}`} className="text-sm font-semibold">
                      {info.label}
                    </Label>
                    {configurado ? (
                      <Badge variant="outline" className="gap-1 text-success-foreground">
                        <CheckCircle2 className="h-3 w-3" /> Configurado
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Não configurado</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{info.descricao}</p>
                </div>
                <div>
                  <Select
                    value={selecoes[papel] || undefined}
                    onValueChange={(v) => setSelecoes((atual) => ({ ...atual, [papel]: v }))}
                  >
                    <SelectTrigger id={`parametro-${papel}`}>
                      <SelectValue placeholder="Selecione a conta…" />
                    </SelectTrigger>
                    <SelectContent>
                      {opcoes.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Nenhuma conta analítica ativa deste tipo
                        </div>
                      )}
                      {opcoes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.codigo} — {c.nome}
                          {!c.ativo && " (inativa)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={salvar} disabled={salvando || !tudoPreenchido}>
          {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Salvar parâmetros
        </Button>
      </div>
    </>
  );
}
