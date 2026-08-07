import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  listarMinhasPasskeys,
  iniciarCadastroPasskey,
  confirmarCadastroPasskey,
  removerPasskey,
} from "@/lib/backend/passkeys";
import { trocarMinhaSenha } from "@/lib/backend/auth";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format";
import { Fingerprint, KeyRound, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conta/seguranca")({
  head: () => ({ meta: [{ title: "Segurança da Conta — Gestão Maçônica" }] }),
  component: SegurancaPage,
});

function SegurancaPage() {
  return (
    <>
      <PageHeader
        title="Segurança da Conta"
        description="Gerencie sua senha e os dispositivos (Face ID, Touch ID, Windows Hello) autorizados a entrar sem senha."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <PasskeysCard />
        <TrocarSenhaCard />
      </div>
    </>
  );
}

function PasskeysCard() {
  const qc = useQueryClient();
  const [webauthnDisponivel] = useState(() => browserSupportsWebAuthn());
  const [cadastrando, setCadastrando] = useState(false);
  const [nomeDispositivo, setNomeDispositivo] = useState("");
  const [open, setOpen] = useState(false);

  const { data: passkeys = [] } = useQuery({
    queryKey: ["minhas_passkeys"],
    queryFn: () => listarMinhasPasskeys(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["minhas_passkeys"] });

  const cadastrar = async () => {
    setCadastrando(true);
    try {
      const optionsJSON = await iniciarCadastroPasskey();
      const response = await startRegistration({ optionsJSON });
      await confirmarCadastroPasskey({
        data: { response, nomeDispositivo: nomeDispositivo.trim() || null },
      });
      toast.success("Dispositivo cadastrado.");
      setNomeDispositivo("");
      setOpen(false);
      invalidate();
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        toast.error("Cadastro cancelado.");
      } else {
        toast.error(err instanceof Error ? err.message : "Erro ao cadastrar dispositivo.");
      }
    } finally {
      setCadastrando(false);
    }
  };

  const remover = async (id: string) => {
    try {
      await removerPasskey({ data: { id } });
      toast.success("Dispositivo removido.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="h-4 w-4" /> Face ID / Touch ID / Windows Hello
          </CardTitle>
          <CardDescription>
            Dispositivos autorizados a entrar sem digitar senha, usando a biometria do próprio
            aparelho.
          </CardDescription>
        </div>
        {webauthnDisponivel && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shrink-0">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Cadastrar este dispositivo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar dispositivo</DialogTitle>
                <DialogDescription>
                  Dá um nome pra identificar depois (opcional) e confirme com a biometria do
                  aparelho quando o navegador pedir.
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label>Nome do dispositivo (opcional)</Label>
                <Input
                  value={nomeDispositivo}
                  onChange={(e) => setNomeDispositivo(e.target.value)}
                  placeholder="Meu iPhone"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={cadastrar} disabled={cadastrando}>
                  {cadastrando ? "Confirmando…" : "Cadastrar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {!webauthnDisponivel && (
          <p className="text-sm text-muted-foreground">
            Este navegador/dispositivo não tem suporte a Face ID/Touch ID/Windows Hello.
          </p>
        )}
        {webauthnDisponivel && passkeys.length === 0 && (
          <EmptyState icon={Fingerprint} title="Nenhum dispositivo cadastrado ainda" />
        )}
        {passkeys.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {passkeys.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.nome_dispositivo ?? "Sem nome"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(p.criado_em)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.usado_em ? fmtDate(p.usado_em) : "Nunca usado"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => remover(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function TrocarSenhaCard() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (novaSenha.length < 3) return toast.error("Senha muito curta.");
    if (novaSenha !== confirmacao) return toast.error("As senhas não conferem.");
    setSalvando(true);
    try {
      await trocarMinhaSenha({ data: { novaSenha } });
      toast.success("Senha alterada.");
      setNovaSenha("");
      setConfirmacao("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar senha.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Senha
        </CardTitle>
        <CardDescription>
          Continua funcionando normalmente mesmo com passkeys cadastradas.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div>
          <Label>Nova senha</Label>
          <Input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
        </div>
        <div>
          <Label>Confirmar nova senha</Label>
          <Input
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
        </div>
        <Button onClick={salvar} disabled={salvando || !novaSenha} className="w-fit">
          {salvando ? "Salvando…" : "Alterar senha"}
        </Button>
      </CardContent>
    </Card>
  );
}
