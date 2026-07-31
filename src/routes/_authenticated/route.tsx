import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessao } from "@/lib/backend/auth";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const usuario = await getSessao();
    if (!usuario) throw redirect({ to: "/auth" });
    // LGPD: contas criadas pelo admin (ou já existentes antes desta
    // migration) ainda não aceitaram a Política de Privacidade — barra o
    // acesso ao resto do sistema até aceitar.
    if (!usuario.consentimentoLgpdEm) throw redirect({ to: "/aceite-termos" });
    return { usuario };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
