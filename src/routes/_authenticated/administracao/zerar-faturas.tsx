import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarFaturasAbertas, zerarFaturasAbertas } from "@/lib/backend/tesouraria-faturas";
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
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/administracao/zerar-faturas")({
  head: () => ({ meta: [{ title: "Zerar Faturas — Gestão Maçônica" }] }),
  component: ZerarFaturasPage,
});

function ZerarFaturasPage() {
  const can = useCan();
  const qc = useQueryClient();
  const [zerando, setZerando] = useState(false);

  const { data: abertas = [] } = useQuery({
    queryKey: ["faturas_abertas"],
    queryFn: () => listarFaturasAbertas(),
    enabled: can.canManageFinancas,
  });

  if (!can.canManageFinancas) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Apenas administradores e tesoureiros podem acessar esta função.
      </Card>
    );
  }

  const confirmar = async () => {
    setZerando(true);
    try {
      const { total } = await zerarFaturasAbertas();
      toast.success(`${total} fatura(s) em aberto apagada(s).`);
      qc.invalidateQueries({ queryKey: ["faturas_abertas"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao zerar faturas.");
    } finally {
      setZerando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Zerar Faturas"
        description="Equivalente ao menu do sistema legado que limpava as faturas pendentes para relançamento."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturas em aberto</CardTitle>
          <CardDescription>
            {abertas.length} fatura(s) em aberto no momento (mensalidades pendentes).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={abertas.length === 0}>
                <Trash2 className="h-4 w-4 mr-1" /> Zerar faturas em aberto
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Zerar {abertas.length} fatura(s) em aberto?</AlertDialogTitle>
                <AlertDialogDescription>
                  Apaga todas as faturas em aberto (e a provisão contábil correspondente de cada
                  uma), para você relançar do zero. Faturas já baixadas (pagas), contas, plano de
                  contas e demais cadastros não são afetados. Essa ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmar} disabled={zerando}>
                  {zerando ? "Zerando…" : "Zerar faturas"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </>
  );
}
