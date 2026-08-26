import { createFileRoute, notFound } from "@tanstack/react-router";
import { obterPaginaPublicaPorSlugFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";

export const Route = createFileRoute("/paginas/$slug")({
  loader: async ({ params }) => {
    const pagina = await obterPaginaPublicaPorSlugFn({ data: { slug: params.slug } });
    if (!pagina) throw notFound();
    return pagina;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.titulo} — Associação Adonhiramita` },
          { name: "robots", content: "index, follow" },
        ]
      : [],
  }),
  component: PaginaPublicaPage,
});

function PaginaPublicaPage() {
  const pagina = Route.useLoaderData();

  return (
    <SiteInstitucionalLayout>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">{pagina.titulo}</h1>
      <ConteudoPublicoHtml html={pagina.conteudo} />
    </SiteInstitucionalLayout>
  );
}
