import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  obterParametrosEmail,
  salvarParametrosEmail,
  enviarEmailDeTeste,
} from "@/lib/backend/email-parametros";
import { PageHeader } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCan } from "@/lib/auth-hooks";
import { Loader2, Mail, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/administracao/email")({
  head: () => ({ meta: [{ title: "E-mail — Gestão Maçônica" }] }),
  component: EmailPage,
});

function EmailPage() {
  const podeEditar = useCan().isAdmin;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["parametros-email"],
    queryFn: () => obterParametrosEmail(),
  });

  const [host, setHost] = useState("");
  const [porta, setPorta] = useState("465");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [remetenteNome, setRemetenteNome] = useState("");
  const [remetenteEmail, setRemetenteEmail] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    if (!data) return;
    setHost(data.host);
    setPorta(String(data.porta));
    setUsuario(data.usuario);
    setRemetenteNome(data.remetenteNome);
    setRemetenteEmail(data.remetenteEmail);
  }, [data]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const { aviso } = await salvarParametrosEmail({
        data: {
          host,
          porta: Number(porta),
          usuario,
          senha,
          remetenteNome,
          remetenteEmail,
        },
      });
      // Só limpa o campo depois de salvar: se der erro, o que foi digitado
      // continua na tela para corrigir, em vez de precisar redigitar.
      setSenha("");
      toast.success("Parâmetros salvos. Use o teste abaixo para confirmar.");
      if (aviso) toast.warning(aviso, { duration: 15000 });
      await queryClient.invalidateQueries({ queryKey: ["parametros-email"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    try {
      const { destinatario } = await enviarEmailDeTeste();
      toast.success(`E-mail de teste enviado para ${destinatario}. Confira a caixa de entrada.`, {
        duration: 10000,
      });
    } catch (err) {
      // A mensagem do servidor SMTP vem inteira: é ela que distingue senha
      // recusada de host errado, e sem ela sobra "não funcionou".
      toast.error(err instanceof Error ? err.message : "Falha no teste.", { duration: 15000 });
    } finally {
      setTestando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="E-mail"
        description="Caixa de saída usada para enviar faturas, comunicados e relatórios desta Loja."
      />

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Configuração em uso:</span>
          {data?.origem === "loja" && <Badge>Parâmetros desta Loja</Badge>}
          {data?.origem === "servidor" && <Badge variant="secondary">Padrão da plataforma</Badge>}
          {data?.origem === "nenhuma" && <Badge variant="destructive">Nenhuma</Badge>}
        </div>
        {data?.origem === "servidor" && (
          <p className="text-xs text-muted-foreground">
            Enquanto esta Loja não tiver parâmetros próprios, os e-mails saem pela caixa padrão da
            plataforma. Preencha abaixo para usar a caixa da Loja.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Servidor de saída (SMTP)</Label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.hostinger.com"
              autoComplete="off"
              disabled={!podeEditar}
            />
            <p className="text-xs text-muted-foreground mt-1">
              O endereço exato está no painel da hospedagem, na tela da conta de e-mail.
            </p>
          </div>

          <div>
            <Label>Porta</Label>
            <Input
              value={porta}
              onChange={(e) => setPorta(e.target.value)}
              placeholder="465"
              inputMode="numeric"
              disabled={!podeEditar}
            />
            <p className="text-xs text-muted-foreground mt-1">465 com SSL, 587 com STARTTLS.</p>
          </div>

          <div>
            <Label>Usuário</Label>
            <Input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="secretaria@sualoja.org.br"
              autoComplete="off"
              disabled={!podeEditar}
            />
            <p className="text-xs text-muted-foreground mt-1">
              O endereço <strong>completo</strong> da caixa, com o domínio.
            </p>
          </div>

          <div className="sm:col-span-2">
            <Label>Senha da caixa de e-mail</Label>
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              // "new-password" e não "off": o Chrome ignora "off" em campos
              // de senha, mas respeita este — sem ele o navegador oferece a
              // senha de LOGIN do usuário para a caixa de e-mail da Loja.
              autoComplete="new-password"
              placeholder={
                data?.senhaConfigurada ? "•••••••• (deixe vazio para manter)" : "Senha da caixa"
              }
              disabled={!podeEditar}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Guardada cifrada. Nunca é exibida de volta — deixe vazio para manter a atual.
            </p>
          </div>

          <div>
            <Label>Nome do remetente (opcional)</Label>
            <Input
              value={remetenteNome}
              onChange={(e) => setRemetenteNome(e.target.value)}
              placeholder="Loja de Perfeição"
              autoComplete="off"
              disabled={!podeEditar}
            />
          </div>

          <div>
            <Label>E-mail do remetente (opcional)</Label>
            <Input
              value={remetenteEmail}
              onChange={(e) => setRemetenteEmail(e.target.value)}
              placeholder="mesmo do usuário, se vazio"
              autoComplete="off"
              disabled={!podeEditar}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se for de outro domínio que o usuário, a maioria dos servidores recusa o envio.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={salvar} disabled={!podeEditar || salvando}>
            {salvando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-1" />
            )}
            Salvar
          </Button>
          <Button variant="outline" onClick={testar} disabled={!podeEditar || testando}>
            {testando ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Enviar e-mail de teste
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O teste envia uma mensagem real para o e-mail da sua conta. Se falhar, a resposta do
          servidor aparece inteira — é ela que distingue senha recusada de servidor errado.
        </p>
      </Card>
    </div>
  );
}
