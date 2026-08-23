import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  obterLojaAtual,
  salvarDadosInstitucionaisLoja,
  concluirOnboardingLoja,
} from "@/lib/backend/loja-atual";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, Building2, Calculator } from "lucide-react";

export const Route = createFileRoute("/_authenticated/administracao/configuracao-inicial")({
  head: () => ({ meta: [{ title: "Configuração Inicial — Gestão Maçônica" }] }),
  component: ConfiguracaoInicial,
});

type Form = { nome: string; razaoSocial: string; cnpj: string };

// Assistente de primeira configuração (issue #340) — o que a Loja precisa
// pra sair do estado "recém-criada" (só com o seed automático de plano de
// contas/cargos/parâmetros, issue #354) pra realmente operar. Cada item da
// lista aponta para a tela que já existe — não duplica nenhum formulário.
function ConfiguracaoInicial() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [concluindo, setConcluindo] = useState(false);

  const {
    data: loja,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["loja_atual"],
    queryFn: () => obterLojaAtual(),
  });

  useEffect(() => {
    if (loja && !form) {
      setForm({
        nome: loja.nome,
        razaoSocial: loja.razaoSocial ?? "",
        cnpj: loja.cnpj ?? "",
      });
    }
  }, [loja, form]);

  const invalidarLoja = () => {
    qc.invalidateQueries({ queryKey: ["loja_atual"] });
  };

  const salvar = async () => {
    if (!form?.nome.trim()) return toast.error("Informe o nome da Loja.");
    setSalvando(true);
    try {
      await salvarDadosInstitucionaisLoja({
        data: {
          nome: form.nome.trim(),
          razaoSocial: form.razaoSocial || null,
          cnpj: form.cnpj || null,
        },
      });
      toast.success("Dados institucionais salvos.");
      invalidarLoja();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const concluir = async () => {
    setConcluindo(true);
    try {
      await concluirOnboardingLoja();
      toast.success("Configuração inicial concluída.");
      invalidarLoja();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao concluir.");
    } finally {
      setConcluindo(false);
    }
  };

  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Não foi possível carregar os dados da loja.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (!form) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <>
      <PageHeader
        title="Configuração Inicial"
        description="Complete o cadastro da sua Loja antes de convidar os demais usuários."
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Dados institucionais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="loja-nome">Nome da Loja</Label>
            <Input
              id="loja-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="loja-razao-social">Razão social</Label>
            <Input
              id="loja-razao-social"
              value={form.razaoSocial}
              onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
              placeholder="Nome usado em faturas e recibos, se diferente do nome acima"
            />
          </div>
          <div>
            <Label htmlFor="loja-cnpj">CNPJ</Label>
            <Input
              id="loja-cnpj"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={salvar} disabled={salvando}>
              Salvar dados institucionais
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Próximos passos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <PassoLink
            icone={Building2}
            titulo="Logo dos corpos maçônicos e da potência"
            descricao="Cadastre (ou confira) o corpo maçônico e a potência da Loja, com logo — aparecem no cabeçalho e nas faturas impressas."
            to="/orgs"
          />
          <PassoLink
            icone={Landmark}
            titulo="Conta financeira e chave PIX"
            descricao="Cadastre a conta usada para receber mensalidades e emitir faturas com QR code Pix."
            to="/tesouraria/contas"
          />
          <PassoLink
            icone={Calculator}
            titulo="Parâmetros contábeis"
            descricao="O plano de contas e os parâmetros já foram preenchidos automaticamente — confira se fazem sentido para esta Loja."
            to="/contabilidade/parametros"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={concluir}
          disabled={concluindo || loja?.onboardingConcluido}
          variant="outline"
        >
          {loja?.onboardingConcluido ? "Configuração concluída" : "Marcar como concluída"}
        </Button>
      </div>
    </>
  );
}

function PassoLink({
  icone: Icone,
  titulo,
  descricao,
  to,
}: {
  icone: typeof Building2;
  titulo: string;
  descricao: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
    >
      <Icone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-sm font-medium">{titulo}</div>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
    </Link>
  );
}
