import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessao } from "@/lib/backend/auth";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const usuario = await getSessao();
    if (!usuario) throw redirect({ to: "/auth" });
    return { usuario };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
