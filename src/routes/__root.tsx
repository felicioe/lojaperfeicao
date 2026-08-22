import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { useTheme } from "../lib/use-theme";
import { useServiceWorker } from "../lib/use-service-worker";
import { useSession } from "../lib/auth-hooks";
import { obterLojaAtual } from "../lib/backend/loja-atual";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente atualizar a página ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0f172a" },
      { title: "SGLFM" },
      {
        name: "description",
        content:
          "Sistema de gestão para lojas maçônicas: cadastro de irmãos, tesouraria e contabilidade.",
      },
      { property: "og:title", content: "SGLFM" },
      {
        property: "og:description",
        content:
          "Sistema de gestão para lojas maçônicas: cadastro de irmãos, tesouraria e contabilidade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "SGLFM" },
      {
        name: "twitter:description",
        content:
          "Sistema de gestão para lojas maçônicas: cadastro de irmãos, tesouraria e contabilidade.",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/brand/sglfm-mark.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Título da aba (issue #340): "SGLFM" fora de sessão (páginas públicas, onde
// nenhuma Loja é conhecida ainda) ou o nome da Loja de quem está logado — em
// vez do nome fixo de uma instalação específica. Precisa ser um componente
// à parte: seus hooks usam useQuery, e só o que está DENTRO do
// QueryClientProvider (abaixo, no retorno de RootComponent) tem acesso a
// ele — chamar useQuery direto em RootComponent quebra, porque o Provider é
// criado pelo próprio retorno dele, não um ancestral.
function TituloDaAba() {
  const location = useLocation();
  const { user } = useSession();
  const { data: loja } = useQuery({
    queryKey: ["loja_atual"],
    queryFn: () => obterLojaAtual(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    document.title = loja?.nome || "SGLFM";
  }, [location.pathname, loja?.nome]);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useTheme();
  useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <TituloDaAba />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {/* Montado uma vez aqui (não em AppShell/PainelShell) pra também cobrir
          páginas fora da área autenticada (/auth, /trocar-senha,
          /aceite-termos, /google-concluir) — toasts de erro de login,
          por exemplo, não apareciam nelas antes disso. */}
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
