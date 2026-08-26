import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { obterNoticiaPublicaPorIdFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/noticias/$id")({
  loader: async ({ params }) => {
    const noticia = await obterNoticiaPublicaPorIdFn({ data: { id: params.id } }).catch(() => null);
    if (!noticia) throw notFound();
    return noticia;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.titulo} — Associação Adonhiramita` },
          { name: "description", content: loaderData.resumo ?? loaderData.titulo },
          { name: "robots", content: "index, follow" },
        ]
      : [],
  }),
  component: NoticiaPublicaPage,
});

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(d.replace(" ", "T")));

function NoticiaPublicaPage() {
  const noticia = Route.useLoaderData();

  return (
    <SiteInstitucionalLayout>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/noticias">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar às notícias
        </Link>
      </Button>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{noticia.titulo}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{fmtData(noticia.publicado_em)}</p>
      <ConteudoPublicoHtml html={noticia.conteudo} />
    </SiteInstitucionalLayout>
  );
}
