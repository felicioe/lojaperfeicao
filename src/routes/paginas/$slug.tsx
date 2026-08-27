import { createFileRoute, notFound } from "@tanstack/react-router";
import { obterPaginaPublicaPorSlugFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";

export const Route = createFileRoute("/paginas/$slug")({
  loader: async ({ params }) => {
    const [pagina, menu] = await Promise.allSettled([
      obterPaginaPublicaPorSlugFn({ data: { slug: params.slug } }),
      obterMenuPublicoFn(),
    ]);
    if (pagina.status !== "fulfilled") {
      return { pagina: null, menu: menu.status === "fulfilled" ? menu.value : [], indisponivel: true };
    }
    if (!pagina.value) throw notFound();
    return {
      pagina: pagina.value,
      menu: menu.status === "fulfilled" ? menu.value : [],
      indisponivel: false,
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.pagina
      ? [
          { title: `${loaderData.pagina.titulo} — Associação Adonhiramita` },
          { name: "robots", content: "index, follow" },
        ]
      : [],
  }),
  component: PaginaPublicaPage,
});

function PaginaPublicaPage() {
  const { pagina, menu, indisponivel } = Route.useLoaderData();

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      {indisponivel || !pagina ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta pÃ¡gina estÃ¡ temporariamente indisponÃ­vel. Tente novamente em instantes.
        </div>
      ) : (
        <>
          <h1 className="mb-6 text-3xl font-bold tracking-tight">{pagina.titulo}</h1>
          <ConteudoPublicoHtml html={pagina.conteudo} />
        </>
      )}
    </SiteInstitucionalLayout>
  );
}
