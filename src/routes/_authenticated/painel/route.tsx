import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PainelShell } from "@/components/app/PainelShell";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Meu Painel — Gestão Maçônica" },
      { name: "description", content: "Meus dados, situação financeira, sessões e frequência." },
    ],
  }),
  component: () => (
    <PainelShell>
      <Outlet />
    </PainelShell>
  ),
});
