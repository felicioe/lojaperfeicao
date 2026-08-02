import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PainelShell } from "@/components/app/PainelShell";
import { useIsDesktop } from "@/lib/use-media-query";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Meu Painel — Gestão Maçônica" },
      { name: "description", content: "Meus dados, situação financeira, sessões e frequência." },
    ],
  }),
  component: PainelLayout,
});

function PainelLayout() {
  const isDesktop = useIsDesktop();

  // Desktop: AppShell (em _authenticated/route.tsx) já dá a barra lateral
  // reduzida a "Meu Painel" — aqui é só o conteúdo. Celular/tablet: usa o
  // shell de app (header + abas inferiores), sem a sidebar.
  if (isDesktop) {
    return <Outlet />;
  }

  return (
    <PainelShell>
      <Outlet />
    </PainelShell>
  );
}
