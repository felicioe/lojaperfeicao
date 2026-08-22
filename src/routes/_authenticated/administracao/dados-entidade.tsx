import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { obterConfiguracoesLgpd, salvarConfiguracoesLgpd } from "@/lib/backend/configuracoes-lgpd";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/administracao/dados-entidade")({
  head: () => ({ meta: [{ title: "Dados da Entidade — Gestão Maçônica" }] }),
  component: DadosEntidade,
});

type Form = { nome_entidade: string; cnpj: string; email_dpo: string };

function DadosEntidade() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data } = useQuery({
    queryKey: ["configuracoes_lgpd"],
    queryFn: () => obterConfiguracoesLgpd(),
  });

  useEffect(() => {
    if (data && !form)
      setForm({
        nome_entidade: data.nome_entidade ?? "",
        cnpj: data.cnpj ?? "",
        email_dpo: data.email_dpo ?? "",
      });
  }, [data, form]);

  if (!form) return <p className="text-muted-foreground">Carregando…</p>;

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfiguracoesLgpd({
        data: {
          nome_entidade: form.nome_entidade || null,
          cnpj: form.cnpj || null,
          email_dpo: form.email_dpo || null,
        },
      });
      toast.success("Dados da entidade salvos.");
      qc.invalidateQueries({ queryKey: ["configuracoes_lgpd"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Dados da Entidade"
        description="Nome e CNPJ da Loja (usados também no cabeçalho institucional e nas faturas/recibos impressos) e o e-mail do encarregado/DPO, exibido na Política de Privacidade (LGPD)."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Política de Privacidade</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="entidade-nome-da-loja-associacao">Nome da Loja/Associação</Label>
            <Input
              id="entidade-nome-da-loja-associacao"
              value={form.nome_entidade}
              onChange={(e) => setForm({ ...form, nome_entidade: e.target.value })}
              placeholder="Ex.: Associação Adonhiramita"
            />
          </div>
          <div>
            <Label htmlFor="entidade-cnpj">CNPJ</Label>
            <Input
              id="entidade-cnpj"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div>
            <Label htmlFor="entidade-e-mail-do-encarregado">E-mail do encarregado/DPO</Label>
            <Input
              id="entidade-e-mail-do-encarregado"
              type="email"
              value={form.email_dpo}
              onChange={(e) => setForm({ ...form, email_dpo: e.target.value })}
              placeholder="privacidade@exemplo.org.br"
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={salvar} disabled={salvando}>
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
