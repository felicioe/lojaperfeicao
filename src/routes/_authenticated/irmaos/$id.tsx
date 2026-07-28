import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { IrmaoForm } from "@/components/app/IrmaoForm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useCan } from "@/lib/auth-hooks";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/irmaos/$id")({
  head: () => ({ meta: [{ title: "Irmão — Gestão Maçônica" }] }),
  component: IrmaoDetail,
});

function IrmaoDetail() {
  const { id } = useParams({ from: "/_authenticated/irmaos/$id" });
  const nav = useNavigate();
  const can = useCan();
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["irmao", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("irmaos").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!data) return <p>Irmão não encontrado.</p>;

  return (
    <>
      <PageHeader
        title={data.nome_civil}
        description={data.nome_simbolico ? `∴ ${data.nome_simbolico}` : undefined}
        actions={
          can.isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Excluir</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir irmão?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação removerá o cadastro e presenças relacionadas. Lançamentos financeiros ficarão sem vínculo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      const { error } = await supabase.from("irmaos").delete().eq("id", id);
                      if (error) return toast.error(error.message);
                      toast.success("Excluído.");
                      nav({ to: "/irmaos" });
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
      />
      <IrmaoForm
        initial={data}
        submitting={saving}
        onSubmit={async (d) => {
          setSaving(true);
          const { error } = await supabase.from("irmaos").update(d).eq("id", id);
          setSaving(false);
          if (error) return toast.error(error.message);
          toast.success("Salvo.");
          refetch();
        }}
      />
    </>
  );
}
