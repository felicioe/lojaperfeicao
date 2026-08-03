import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contarFaturas, zerarFaturas } from "@/lib/backend/tesouraria-faturas";
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

  const { data } = useQuery({
    queryKey: ["faturas_total"],
    queryFn: () => contarFaturas(),
    enabled: can.canManageFinancas,
  });
  const total = data?.total ?? 0;

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
      const { total: apagadas } = await zerarFaturas();
      toast.success(`${apagadas} fatura(s) apagada(s).`);
      qc.invalidateQueries({ queryKey: ["faturas_total"] });
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
        description="Equivalente ao menu do sistema legado que limpava as faturas para relançamento."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturas (mensalidades)</CardTitle>
          <CardDescription>
            {total} fatura(s) no total, entre abertas e já pagas/recebidas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={total === 0}>
                <Trash2 className="h-4 w-4 mr-1" /> Zerar faturas
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Zerar {total} fatura(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  Apaga todas as faturas — abertas e já pagas/recebidas — junto com a provisão
                  contábil de cada uma e, para as pagas, o recibo emitido e o lançamento contábil da
                  baixa. Contas, plano de contas, fornecedores e demais cadastros não são afetados.
                  Essa ação não pode ser desfeita.
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
