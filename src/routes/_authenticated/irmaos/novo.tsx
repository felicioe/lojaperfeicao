import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/AppShell";
import { IrmaoForm } from "@/components/app/IrmaoForm";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/irmaos/novo")({
  head: () => ({ meta: [{ title: "Novo Irmão — Gestão Maçônica" }] }),
  component: NovoIrmao,
});

function NovoIrmao() {
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  return (
    <>
      <PageHeader title="Novo Irmão" description="Cadastre um novo irmão da loja." />
      <IrmaoForm
        submitting={saving}
        onSubmit={async (d) => {
          setSaving(true);
          const { error } = await supabase.from("irmaos").insert(d);
          setSaving(false);
          if (error) return toast.error(error.message);
          toast.success("Irmão cadastrado.");
          nav({ to: "/irmaos" });
        }}
      />
    </>
  );
}
