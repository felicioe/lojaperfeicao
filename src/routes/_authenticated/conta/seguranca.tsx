import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  listarMinhasPasskeys,
  iniciarCadastroPasskey,
  confirmarCadastroPasskey,
  removerPasskey,
} from "@/lib/backend/passkeys";
import {
  meuTotpStatus,
  iniciarAtivacaoTotp,
  confirmarAtivacaoTotp,
  desativarMeuTotp,
  regenerarCodigosBackup,
} from "@/lib/backend/totp";
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
import { Fingerprint, KeyRound, Plus, Trash2, ShieldCheck, RotateCw, Copy } from "lucide-react";

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
        <Totp2FACard />
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

function Totp2FACard() {
  const qc = useQueryClient();
  const [ativacaoAberta, setAtivacaoAberta] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Dialog compartilhado pra mostrar códigos de backup — tanto na primeira
  // ativação quanto ao regenerar (a ativação em si já pode ter fechado,
  // então não dá pra reaproveitar o Dialog de ativação pra essa etapa).
  const [codigosParaMostrar, setCodigosParaMostrar] = useState<string[] | null>(null);

  const [acaoComCodigo, setAcaoComCodigo] = useState<"desativar" | "regenerar" | null>(null);
  const [codigoAcao, setCodigoAcao] = useState("");

  const { data: status } = useQuery({
    queryKey: ["meu_totp_status"],
    queryFn: () => meuTotpStatus(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["meu_totp_status"] });

  const abrirAtivacao = async () => {
    setAtivacaoAberta(true);
    setCodigo("");
    setCarregando(true);
    try {
      const resultado = await iniciarAtivacaoTotp();
      setSecret(resultado.secret);
      const dataUrl = await QRCode.toDataURL(resultado.otpauthUrl, { margin: 1, width: 220 });
      setQrDataUrl(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar ativação.");
      setAtivacaoAberta(false);
    } finally {
      setCarregando(false);
    }
  };

  const confirmar = async () => {
    setCarregando(true);
    try {
      const resultado = await confirmarAtivacaoTotp({ data: { codigo } });
      setAtivacaoAberta(false);
      setCodigosParaMostrar(resultado.codigosBackup);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido.");
    } finally {
      setCarregando(false);
    }
  };

  const confirmarAcao = async () => {
    setCarregando(true);
    try {
      if (acaoComCodigo === "desativar") {
        await desativarMeuTotp({ data: { codigo: codigoAcao } });
        toast.success("2FA desativado.");
        setAcaoComCodigo(null);
        invalidate();
      } else if (acaoComCodigo === "regenerar") {
        const resultado = await regenerarCodigosBackup({ data: { codigo: codigoAcao } });
        setAcaoComCodigo(null);
        setCodigosParaMostrar(resultado.codigosBackup);
        invalidate();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código inválido.");
    } finally {
      setCarregando(false);
      setCodigoAcao("");
    }
  };

  const copiarCodigos = () => {
    if (codigosParaMostrar) navigator.clipboard.writeText(codigosParaMostrar.join("\n"));
    toast.success("Códigos copiados.");
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Autenticação de dois fatores (2FA)
          </CardTitle>
          <CardDescription>
            Código gerado por app autenticador (Google Authenticator, Authy...), opcional, além da
            senha.
          </CardDescription>
        </div>
        {!status?.ativo && (
          <Dialog open={ativacaoAberta} onOpenChange={setAtivacaoAberta}>
            <DialogTrigger asChild>
              <Button size="sm" className="shrink-0" onClick={abrirAtivacao}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Ativar 2FA
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ativar 2FA</DialogTitle>
                <DialogDescription>
                  Escaneie o QR code com seu app autenticador e digite o código de 6 dígitos gerado.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                {qrDataUrl && <img src={qrDataUrl} alt="QR code do 2FA" className="rounded" />}
                <p className="break-all text-center text-xs text-muted-foreground">
                  Não consegue escanear? Digite manualmente: <br />
                  <span className="font-mono">{secret}</span>
                </p>
                <div className="w-full">
                  <Label>Código de 6 dígitos</Label>
                  <Input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="000000"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAtivacaoAberta(false)}>
                  Cancelar
                </Button>
                <Button onClick={confirmar} disabled={carregando || codigo.length !== 6}>
                  {carregando ? "Confirmando…" : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {status?.ativo ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              2FA ativado — {status.codigosBackupRestantes} código(s) de backup restante(s).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAcaoComCodigo("regenerar")}>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Gerar novos códigos de backup
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAcaoComCodigo("desativar")}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Desativar 2FA
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Desativado — só a senha (ou passkey, se cadastrada) é exigida no login.
          </p>
        )}
      </CardContent>

      <Dialog open={acaoComCodigo !== null} onOpenChange={(v) => !v && setAcaoComCodigo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acaoComCodigo === "desativar" ? "Desativar 2FA" : "Gerar novos códigos de backup"}
            </DialogTitle>
            <DialogDescription>
              {acaoComCodigo === "regenerar" &&
                "Os códigos de backup antigos deixam de funcionar. "}
              Confirme com um código atual do seu app autenticador (ou um código de backup).
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Código</Label>
            <Input
              value={codigoAcao}
              onChange={(e) => setCodigoAcao(e.target.value)}
              placeholder="000000"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcaoComCodigo(null)}>
              Cancelar
            </Button>
            <Button
              variant={acaoComCodigo === "desativar" ? "destructive" : "default"}
              onClick={confirmarAcao}
              disabled={carregando || !codigoAcao}
            >
              {carregando ? "Confirmando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={codigosParaMostrar !== null}
        onOpenChange={(v) => !v && setCodigosParaMostrar(null)}
      >
        <DialogContent>
          {codigosParaMostrar && (
            <CodigosBackupConteudo
              codigos={codigosParaMostrar}
              onCopiar={copiarCodigos}
              onFechar={() => setCodigosParaMostrar(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CodigosBackupConteudo({
  codigos,
  onCopiar,
  onFechar,
}: {
  codigos: string[];
  onCopiar: () => void;
  onFechar: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>2FA ativado — guarde seus códigos de backup</DialogTitle>
        <DialogDescription>
          Use um destes códigos se perder acesso ao app autenticador. Cada um funciona uma única
          vez. Eles não serão mostrados de novo.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm">
        {codigos.map((c) => (
          <div key={c}>{c}</div>
        ))}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCopiar}>
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
        </Button>
        <Button onClick={onFechar}>Já salvei, concluir</Button>
      </DialogFooter>
    </>
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
