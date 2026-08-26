import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterNoticiasPublicasResumoFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/noticias/")({
  loader: async () => {
    const [noticias, menu] = await Promise.all([
      obterNoticiasPublicasResumoFn(),
      obterMenuPublicoFn(),
    ]);
    return { noticias, menu };
  },
  head: () => ({
    meta: [
      { title: "Notícias — Associação Adonhiramita" },
      {
        name: "description",
        content: "Últimas notícias e publicações da Associação Adonhiramita.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: NoticiasPublicasPage,
});

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(d.replace(" ", "T")));

function NoticiasPublicasPage() {
  const { noticias: noticiasIniciais, menu } = Route.useLoaderData();
  const { data: noticias = noticiasIniciais } = useQuery({
    queryKey: ["noticias_publicas_site"],
    queryFn: () => obterNoticiasPublicasResumoFn(),
    initialData: noticiasIniciais,
  });

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Notícias</h1>
      {noticias.length === 0 && (
        <p className="text-muted-foreground">Nenhuma notícia publicada no momento.</p>
      )}
      <div className="space-y-4">
        {noticias.map((noticia) => (
          <Link key={noticia.id} to="/noticias/$id" params={{ id: noticia.id }}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="text-lg">{noticia.titulo}</CardTitle>
                <p className="text-sm text-muted-foreground">{fmtData(noticia.publicado_em)}</p>
              </CardHeader>
              {noticia.resumo && (
                <CardContent>
                  <p className="text-sm">{noticia.resumo}</p>
                </CardContent>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </SiteInstitucionalLayout>
  );
}
