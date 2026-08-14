import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Meu Painel — Gestão Maçônica" },
      { name: "description", content: "Meus dados, situação financeira, sessões e frequência." },
    ],
  }),
  component: Outlet,
});
