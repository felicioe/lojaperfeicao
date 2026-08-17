import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// Área de administração da PLATAFORMA (issue #339) — separada da
// Administração da Loja (/administracao), que é outro cargo e outro escopo.
//
// O redirecionamento aqui é conveniência de navegação, não segurança: quem
// souber a URL não entra em nada, porque toda função de servidor desta área
// passa por comSuperAdmin (authz.ts). Isso é o que impede o acesso; isto
// aqui só evita mostrar uma tela quebrada para quem não é super-admin.
export const Route = createFileRoute("/_authenticated/admin-saas")({
  head: () => ({ meta: [{ title: "Plataforma — Gestão Maçônica" }] }),
  beforeLoad: ({ context }) => {
    if (!context.usuario.papeis.includes("super_admin")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: Outlet,
});
