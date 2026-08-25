import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  obterBannerPlataforma,
  atualizarBannerPlataforma,
  type BannerPlataforma,
} from "@/lib/backend/saas-configuracoes";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin-saas/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Plataforma" }] }),
  component: ConfiguracoesPlataforma,
});

const TIPO_LABEL: Record<BannerPlataforma["tipo"], string> = {
  info: "Informativo",
  aviso: "Aviso",
  critico: "Crítico",
};

function ConfiguracoesPlataforma() {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<BannerPlataforma | null>(null);

  const { data: banner } = useQuery({
    queryKey: ["plataforma-banner"],
    queryFn: () => obterBannerPlataforma(),
  });

  useEffect(() => {
    if (banner && !form) setForm(banner);
  }, [banner, form]);

  const salvar = async () => {
    if (!form) return;
    setSalvando(true);
    try {
      await atualizarBannerPlataforma({ data: form });
      toast.success("Banner atualizado.");
      qc.invalidateQueries({ queryKey: ["plataforma-banner"] });
      qc.invalidateQueries({ queryKey: ["saas-auditoria"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar o banner.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configurações"
        description="Parâmetros que valem para todas as Lojas atendidas pela plataforma."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banner de manutenção/aviso</CardTitle>
          <CardDescription>
            Mensagem exibida no topo da tela para todos os usuários de todas as Lojas, enquanto
            estiver ativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!form ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Switch
                  id="banner-ativo"
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                />
                <Label htmlFor="banner-ativo">Banner ativo</Label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="banner-tipo">Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v as BannerPlataforma["tipo"] })}
                >
                  <SelectTrigger id="banner-tipo" className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_LABEL) as BannerPlataforma["tipo"][]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="banner-mensagem">Mensagem</Label>
                <Textarea
                  id="banner-mensagem"
                  value={form.mensagem}
                  onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                  maxLength={500}
                  placeholder="Ex.: Manutenção programada hoje das 22h às 23h — o sistema pode ficar indisponível."
                />
              </div>

              <Button onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
