import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contarMovimentoFinanceiro, resetarFinanceiro } from "@/lib/backend/administracao-reset";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

const FRASE_CONFIRMACAO = "RESETAR";

export const Route = createFileRoute("/_authenticated/administracao/resetar-financeiro")({
  head: () => ({ meta: [{ title: "Resetar Financeiro — Gestão Maçônica" }] }),
  component: ResetarFinanceiroPage,
});

function ResetarFinanceiroPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [zerando, setZerando] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");

  const { data } = useQuery({
    queryKey: ["movimento_financeiro_total"],
    queryFn: () => contarMovimentoFinanceiro(),
    enabled: can.isAdmin,
  });
  const total = data?.total ?? 0;

  if (!can.isAdmin) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas administradores podem acessar esta função.
      </Card>
    );
  }

  const confirmar = async () => {
    setZerando(true);
    try {
      const { total: apagados } = await resetarFinanceiro();
      toast.success(`${apagados} lançamento(s) apagado(s). Financeiro resetado.`);
      qc.invalidateQueries({ queryKey: ["movimento_financeiro_total"] });
      setConfirmacao("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resetar o financeiro.");
    } finally {
      setZerando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Resetar Financeiro"
        description="Equivalente ao menu do sistema legado que zerava tudo para começar os lançamentos do zero."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimento financeiro</CardTitle>
          <CardDescription>{total} lançamento(s) no total, de todos os tipos.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog
            onOpenChange={(aberto) => {
              if (!aberto) setConfirmacao("");
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={total === 0}>
                <Trash2 className="h-4 w-4 mr-1" /> Resetar financeiro
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resetar todo o financeiro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Apaga todo o movimento financeiro — faturas, contas a pagar, tronco de
                  beneficência, transferências e demais lançamentos, de qualquer tipo ou status —
                  junto com recibos, parcelamentos, o livro razão/diário contábil, a conciliação
                  bancária (OFX), o orçamento anual e os fechamentos de exercício. Os cadastros
                  básicos (irmãos, corpos maçônicos, gestões, sessões, fornecedores/clientes, plano
                  de contas, contas financeiras, usuários, parâmetros financeiros e os modelos de
                  despesas recorrentes) não são afetados. Essa ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="confirmacao-reset">
                  Digite <strong>{FRASE_CONFIRMACAO}</strong> para confirmar
                </Label>
                <Input
                  id="confirmacao-reset"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmar}
                  disabled={zerando || confirmacao !== FRASE_CONFIRMACAO}
                >
                  {zerando ? "Resetando…" : "Resetar financeiro"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  );
}
