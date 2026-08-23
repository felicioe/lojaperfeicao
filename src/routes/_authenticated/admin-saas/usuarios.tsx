import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listarUsuariosPlataforma } from "@/lib/backend/saas-usuarios";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableHeadOrdenavel } from "@/components/app/TableHeadOrdenavel";
import { useOrdenacao } from "@/lib/use-ordenacao";
import { ROLE_LABEL } from "@/lib/format";
import { Loader2, Search, UsersRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin-saas/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Plataforma" }] }),
  component: UsuariosPlataforma,
});

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function UsuariosPlataforma() {
  const [busca, setBusca] = useState("");
  const {
    data: usuarios = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["saas-usuarios"],
    queryFn: () => listarUsuariosPlataforma(),
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter(
      (u) =>
        u.email.toLowerCase().includes(termo) ||
        (u.nome_completo ?? "").toLowerCase().includes(termo) ||
        u.loja_nome.toLowerCase().includes(termo),
    );
  }, [usuarios, busca]);

  const ord = useOrdenacao(filtrados, {
    email: (u) => u.email,
    nome: (u) => u.nome_completo ?? "",
    loja: (u) => u.loja_nome,
    ultimo: (u) => u.ultimo_acesso ?? "",
    situacao: (u) => (u.ativo ? 1 : 0),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuários"
        description="Contas de todas as Lojas atendidas pela plataforma. Esta tela mostra só metadado de conta — não dá acesso a dado interno de nenhuma Loja."
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por e-mail, nome ou Loja"
          className="pl-8"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <EmptyState
              icon={UsersRound}
              title="Não foi possível carregar os usuários"
              description="Falha ao buscar os dados. Tente novamente."
              action={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Tentar novamente
                </Button>
              }
            />
          ) : isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeadOrdenavel campo="email" ord={ord}>
                    E-mail
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="nome" ord={ord}>
                    Nome
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="loja" ord={ord}>
                    Loja
                  </TableHeadOrdenavel>
                  <TableHead>Papéis</TableHead>
                  <TableHeadOrdenavel campo="ultimo" ord={ord}>
                    Último acesso
                  </TableHeadOrdenavel>
                  <TableHeadOrdenavel campo="situacao" ord={ord}>
                    Situação
                  </TableHeadOrdenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ord.itensOrdenados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      {busca ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado."}
                    </TableCell>
                  </TableRow>
                )}
                {ord.itensOrdenados.map((u) => (
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
                    <TableCell className="text-xs">
                      {u.ultimo_acesso ? dataHora(u.ultimo_acesso) : "nunca"}
                    </TableCell>
                    <TableCell>
                      {u.ativo ? (
                        <Badge variant="secondary">Ativo</Badge>
                      ) : (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
