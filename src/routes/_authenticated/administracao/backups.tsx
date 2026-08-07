import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listarBackupsGerados, gerarBackupAgora, baixarBackup } from "@/lib/backend/backups";
import { PageHeader, EmptyState } from "@/components/app/AppShell";
import { Card } from "@/components/ui/card";
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
import { fmtDate } from "@/lib/format";
import { useCan } from "@/lib/auth-hooks";
import { Archive, Download, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/administracao/backups")({
  head: () => ({ meta: [{ title: "Backups — Gestão Maçônica" }] }),
  component: BackupsPage,
});

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function baixarArquivo(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function BackupsPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [gerando, setGerando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ["backups_gerados"],
    queryFn: () => listarBackupsGerados(),
    enabled: can.isAdmin,
  });

  if (!can.isAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas administradores podem acessar esta função.
      </Card>
    );
  }

  const gerar = async () => {
    setGerando(true);
    try {
      await gerarBackupAgora();
      toast.success("Backup gerado.");
      qc.invalidateQueries({ queryKey: ["backups_gerados"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar backup.");
    } finally {
      setGerando(false);
    }
  };

  const baixar = async (id: string) => {
    setBaixando(id);
    try {
      const { nomeArquivo, conteudo } = await baixarBackup({ data: { id } });
      baixarArquivo(nomeArquivo, conteudo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar backup.");
    } finally {
      setBaixando(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Backups"
        description="Backup completo do banco de dados, gerado automaticamente todo dia (cron) ou sob demanda. Mantém só os últimos 7."
        actions={
          <Button onClick={gerar} disabled={gerando}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> {gerando ? "Gerando…" : "Gerar backup agora"}
          </Button>
        }
      />
      <Card>
        {!isLoading && backups.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="Nenhum backup gerado ainda"
            description='Clique em "Gerar backup agora" ou configure o cron job do hPanel (ver .env.example).'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gerado em</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Tabelas</TableHead>
                <TableHead>Linhas</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {backups.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{fmtDate(b.criado_em)}</TableCell>
                  <TableCell>
                    <Badge variant={b.origem === "cron" ? "secondary" : "outline"}>
                      {b.origem === "cron" ? "Automático" : "Manual"}
                    </Badge>
                  </TableCell>
                  <TableCell>{b.total_tabelas}</TableCell>
                  <TableCell>{b.total_linhas}</TableCell>
                  <TableCell>{tamanhoLegivel(b.tamanho_bytes)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => baixar(b.id)}
                      disabled={baixando === b.id}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
