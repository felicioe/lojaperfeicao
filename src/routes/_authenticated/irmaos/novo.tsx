import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { criarIrmao } from "@/lib/server/irmaos";
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
          try {
            await criarIrmao({ data: d });
            toast.success("Irmão cadastrado.");
            nav({ to: "/irmaos" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro ao cadastrar.");
          } finally {
            setSaving(false);
          }
        }}
      />
    </>
  );
}
