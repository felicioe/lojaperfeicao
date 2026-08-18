import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  obterParametrosFinanceiros,
  salvarParametrosFinanceiros,
} from "@/lib/backend/tesouraria-parametros";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/tesouraria/parametros")({
  head: () => ({ meta: [{ title: "Parâmetros Financeiros — Gestão Maçônica" }] }),
  component: Parametros,
});

function Parametros() {
  const can = useCan();
  const qc = useQueryClient();
  const [form, setForm] = useState<{
    multa_ativa: boolean;
    multa_percentual: number;
    juros_ativo: boolean;
    juros_diario_percentual: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["parametros_financeiros"],
    queryFn: () => obterParametrosFinanceiros(),
  });

  useEffect(() => {
    if (data && !form)
      setForm({
        multa_ativa: data.multa_ativa,
        multa_percentual: data.multa_percentual,
        juros_ativo: data.juros_ativo,
        juros_diario_percentual: data.juros_diario_percentual,
      });
  }, [data, form]);

  if (!form) return <p className="text-muted-foreground">Carregando…</p>;

  const salvar = async () => {
    setSaving(true);
    try {
      await salvarParametrosFinanceiros({ data: form });
      toast.success("Parâmetros salvos.");
      qc.invalidateQueries({ queryKey: ["parametros_financeiros"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Parâmetros Financeiros"
        description="Regras de multa e juros aplicadas na baixa de faturas em atraso."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Multa e juros por atraso</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-2">
            <Switch
              id="param-multa-ativa"
              checked={form.multa_ativa}
              onCheckedChange={(v) => setForm({ ...form, multa_ativa: v })}
              disabled={!can.canManageFinancas}
            />
            <Label htmlFor="param-multa-ativa" className="!m-0">
              Cobrar multa por atraso
            </Label>
          </div>
          <div>
            <Label htmlFor="param-multa-percentual">Multa (% fixo sobre o valor)</Label>
            <Input
              id="param-multa-percentual"
              type="number"
              step="0.01"
              value={form.multa_percentual}
              onChange={(e) => setForm({ ...form, multa_percentual: Number(e.target.value) })}
              disabled={!can.canManageFinancas}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="param-juros-ativo"
              checked={form.juros_ativo}
              onCheckedChange={(v) => setForm({ ...form, juros_ativo: v })}
              disabled={!can.canManageFinancas}
            />
            <Label htmlFor="param-juros-ativo" className="!m-0">
              Cobrar juros por dia de atraso
            </Label>
          </div>
          <div>
            <Label htmlFor="param-juros-diario">Juros diário (% ao dia)</Label>
            <Input
              id="param-juros-diario"
              type="number"
              step="0.0001"
              value={form.juros_diario_percentual}
              onChange={(e) =>
                setForm({ ...form, juros_diario_percentual: Number(e.target.value) })
              }
              disabled={!can.canManageFinancas}
            />
          </div>
          {can.canManageFinancas && (
            <div className="md:col-span-2">
              <Button onClick={salvar} disabled={saving}>
                Salvar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
