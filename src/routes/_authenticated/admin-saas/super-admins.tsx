import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listarSuperAdmins,
  promoverSuperAdmin,
  revogarSuperAdmin,
  type SuperAdminInfo,
} from "@/lib/backend/saas-super-admins";
import { listarUsuariosPlataforma } from "@/lib/backend/saas-usuarios";
import { ROLE_LABEL } from "@/lib/format";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert, ShieldCheck, ShieldMinus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-saas/super-admins")({
  head: () => ({ meta: [{ title: "Super-admins — Plataforma" }] }),
  component: SuperAdminsPage,
});

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

type AcaoPendente = { tipo: "promover" | "revogar"; usuarioId: string; email: string };

function SuperAdminsPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [acao, setAcao] = useState<AcaoPendente | null>(null);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [codigoTotp, setCodigoTotp] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const { data: superAdmins = [], isLoading: carregandoSuperAdmins } = useQuery({
    queryKey: ["saas-super-admins"],
    queryFn: () => listarSuperAdmins(),
  });
  const { data: usuarios = [] } = useQuery({
    queryKey: ["saas-usuarios"],
    queryFn: () => listarUsuariosPlataforma(),
  });

  const jaSaoSuperAdmin = useMemo(() => new Set(superAdmins.map((s) => s.id)), [superAdmins]);
  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios
      .filter((u) => !jaSaoSuperAdmin.has(u.id))
      .filter(
        (u) =>
          !termo ||
          u.email.toLowerCase().includes(termo) ||
          (u.nome_completo ?? "").toLowerCase().includes(termo) ||
          u.loja_nome.toLowerCase().includes(termo),
      )
      .slice(0, 20);
  }, [usuarios, jaSaoSuperAdmin, busca]);

  const fecharDialog = () => {
    setAcao(null);
    setSenhaAtual("");
    setCodigoTotp("");
  };

  const confirmar = async () => {
    if (!acao) return;
    setConfirmando(true);
    try {
      const payload = { usuarioId: acao.usuarioId, senhaAtual, codigoTotp };
      if (acao.tipo === "promover") {
        await promoverSuperAdmin({ data: payload });
        toast.success(`${acao.email} agora é super-admin.`);
      } else {
        await revogarSuperAdmin({ data: payload });
        toast.success(`Papel de super-admin revogado de ${acao.email}.`);
      }
      qc.invalidateQueries({ queryKey: ["saas-super-admins"] });
      qc.invalidateQueries({ queryKey: ["saas-usuarios"] });
      qc.invalidateQueries({ queryKey: ["saas-auditoria"] });
      fecharDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar a ação.");
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Super-admins"
        description="Quem administra a plataforma inteira — não confundir com administrador de Loja. Promover ou revogar exige confirmar sua senha e o segundo fator."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Super-admins atuais</CardTitle>
          <CardDescription>{superAdmins.length} conta(s) com este papel.</CardDescription>
        </CardHeader>
        <CardContent>
          {carregandoSuperAdmins ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Loja de origem</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {superAdmins.map((s: SuperAdminInfo) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.email}</TableCell>
                    <TableCell>{s.nome_completo ?? "—"}</TableCell>
                    <TableCell>{s.loja_nome}</TableCell>
                    <TableCell className="text-xs">{dataHora(s.desde)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={superAdmins.length <= 1}
                        title={
                          superAdmins.length <= 1
                            ? "Não é possível revogar o único super-admin da plataforma."
                            : undefined
                        }
                        onClick={() =>
                          setAcao({ tipo: "revogar", usuarioId: s.id, email: s.email })
                        }
                      >
                        <ShieldMinus className="mr-1.5 h-3.5 w-3.5" /> Revogar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promover um usuário</CardTitle>
          <CardDescription>
            Busque uma conta de qualquer Loja atendida pela plataforma para conceder o papel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por e-mail, nome ou Loja"
              className="pl-8"
            />
          </div>
          {busca.trim() && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Papéis na Loja</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidatos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {candidatos.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>{u.nome_completo ?? "—"}</TableCell>
                    <TableCell>{u.loja_nome}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.papeis.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {u.papeis.map((p) => (
                          <Badge key={p} variant="outline">
                            {ROLE_LABEL[p] ?? p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAcao({ tipo: "promover", usuarioId: u.id, email: u.email })
                        }
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Promover
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={acao !== null} onOpenChange={(v) => !v && fecharDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              {acao?.tipo === "promover" ? "Promover a super-admin" : "Revogar super-admin"}
            </DialogTitle>
            <DialogDescription>
              {acao?.tipo === "promover"
                ? `${acao.email} passa a administrar a plataforma inteira — cadastro de Lojas, usuários de todas as Lojas e este mesmo painel.`
                : `${acao?.email} deixa de administrar a plataforma. Continua com os papéis que já tiver na Loja dele(a).`}{" "}
              Confirme com sua senha atual e um código do seu 2FA.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sa-senha-atual">Sua senha atual</Label>
              <Input
                id="sa-senha-atual"
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="sa-codigo-totp">Código do 2FA</Label>
              <Input
                id="sa-codigo-totp"
                value={codigoTotp}
                onChange={(e) => setCodigoTotp(e.target.value)}
                placeholder="000000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharDialog}>
              Cancelar
            </Button>
            <Button
              variant={acao?.tipo === "revogar" ? "destructive" : "default"}
              onClick={confirmar}
              disabled={confirmando || !senhaAtual || !codigoTotp}
            >
              {confirmando ? "Confirmando…" : acao?.tipo === "promover" ? "Promover" : "Revogar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
