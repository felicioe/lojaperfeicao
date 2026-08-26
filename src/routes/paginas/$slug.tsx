import { createFileRoute, notFound } from "@tanstack/react-router";
import { obterPaginaPublicaPorSlugFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";

export const Route = createFileRoute("/paginas/$slug")({
  loader: async ({ params }) => {
    const [pagina, menu] = await Promise.all([
      obterPaginaPublicaPorSlugFn({ data: { slug: params.slug } }),
      obterMenuPublicoFn(),
    ]);
    if (!pagina) throw notFound();
    return { pagina, menu };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.pagina.titulo} — Associação Adonhiramita` },
          { name: "robots", content: "index, follow" },
        ]
      : [],
  }),
  component: PaginaPublicaPage,
});

function PaginaPublicaPage() {
  const { pagina, menu } = Route.useLoaderData();

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">{pagina.titulo}</h1>
      <ConteudoPublicoHtml html={pagina.conteudo} />
    </SiteInstitucionalLayout>
  );
}
