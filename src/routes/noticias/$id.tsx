import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { obterNoticiaPublicaPorIdFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/noticias/$id")({
  loader: async ({ params }) => {
    // Só um :id malformado vira 404 aqui — uma falha real do backend (banco
    // fora do ar, erro de schema) precisa propagar como 500, não ser
    // confundida com "notícia não existe" (achado do review automático da
    // PR #386).
    if (!UUID_REGEX.test(params.id)) throw notFound();
    const [noticia, menu] = await Promise.all([
      obterNoticiaPublicaPorIdFn({ data: { id: params.id } }),
      obterMenuPublicoFn(),
    ]);
    if (!noticia) throw notFound();
    return { noticia, menu };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.noticia.titulo} — Associação Adonhiramita` },
          { name: "description", content: loaderData.noticia.resumo ?? loaderData.noticia.titulo },
          { name: "robots", content: "index, follow" },
        ]
      : [],
  }),
  component: NoticiaPublicaPage,
});

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(d.replace(" ", "T")));

function NoticiaPublicaPage() {
  const { noticia, menu } = Route.useLoaderData();

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
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
