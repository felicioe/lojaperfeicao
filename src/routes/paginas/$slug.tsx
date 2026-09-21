import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { obterPaginaPublicaPorSlugFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { getSessao } from "@/lib/backend/auth";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

// issue #692 — página do CMS marcada como "restrita" (ex.: /paginas/
// publicacoes) só mostra o conteúdo pra Irmão autenticado; sem sessão, uma
// tela de login no lugar. `autenticado` é resolvido no loader (SSR, mesmo
// padrão de agenda.tsx) pra não piscar conteúdo antes de checar sessão —
// e o conteúdo em si já vem vazio do servidor nesse caso (ver
// carregarPaginaPublicaPorSlug), então não tem nada sensível pra esconder
// aqui, só decidir o que renderizar.
export const Route = createFileRoute("/paginas/$slug")({
  loader: async ({ params }) => {
    const [pagina, menu, sessao] = await Promise.allSettled([
      obterPaginaPublicaPorSlugFn({ data: { slug: params.slug } }),
      obterMenuPublicoFn(),
      getSessao(),
    ]);
    if (pagina.status !== "fulfilled") {
      return {
        pagina: null,
        menu: menu.status === "fulfilled" ? menu.value : [],
        indisponivel: true,
        autenticado: false,
      };
    }
    if (!pagina.value) throw notFound();
    return {
      pagina: pagina.value,
      menu: menu.status === "fulfilled" ? menu.value : [],
      indisponivel: false,
      autenticado: sessao.status === "fulfilled" && !!sessao.value,
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.pagina
      ? [
          { title: `${loaderData.pagina.titulo} — Associação Adonhiramita` },
          ...(loaderData.pagina.restrita ? [] : [{ name: "robots", content: "index, follow" }]),
        ]
      : [],
  }),
  component: PaginaPublicaPage,
});

function PaginaPublicaPage() {
  const { pagina, menu, indisponivel, autenticado } = Route.useLoaderData();

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      {indisponivel || !pagina ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta página está temporariamente indisponível. Tente novamente em instantes.
        </div>
      ) : pagina.restrita && !autenticado ? (
        <>
          <h1 className="mb-6 text-3xl font-bold tracking-tight">{pagina.titulo}</h1>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Esta página é uma área restrita a Irmãos. Faça login para ver o conteúdo.
              </p>
              <Button asChild>
                <Link to="/auth" search={{ redirect: `/paginas/${pagina.slug}` }}>
                  Entrar
                </Link>
              </Button>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <h1 className="mb-6 text-3xl font-bold tracking-tight">{pagina.titulo}</h1>
          <ConteudoPublicoHtml html={pagina.conteudo} />
        </>
      )}
    </SiteInstitucionalLayout>
  );
}
