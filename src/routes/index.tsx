import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSessao } from "@/lib/backend/auth";
import {
  obterAgendaPublicaFn,
  obterNoticiasPublicasResumoFn,
  obterMenuPublicoFn,
} from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Antes desta issue (#382), "/" sempre redirecionava pro dashboard interno —
// fazia sentido quando só existia o sistema logado. Agora "/" é a home
// pública do site institucional embutido pra quem não está logado; quem já
// tem sessão continua caindo direto no dashboard, como sempre.
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const usuario = await getSessao();
    if (usuario) throw redirect({ to: "/dashboard" });
  },
  loader: async () => {
    const [agenda, noticias, menu] = await Promise.all([
      obterAgendaPublicaFn(),
      obterNoticiasPublicasResumoFn(),
      obterMenuPublicoFn(),
    ]);
    return { agenda: agenda.slice(0, 3), noticias: noticias.slice(0, 3), menu };
  },
  head: () => ({
    meta: [
      { title: "Associação Adonhiramita" },
      {
        name: "description",
        content: "Site institucional da Associação Adonhiramita — agenda, notícias e páginas.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: HomePublica,
});

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(d.replace(" ", "T")));

function HomePublica() {
  const { agenda, noticias, menu } = Route.useLoaderData();
  const { data } = useQuery({
    queryKey: ["home_publica_site"],
    queryFn: async () => ({
      agenda: (await obterAgendaPublicaFn()).slice(0, 3),
      noticias: (await obterNoticiasPublicasResumoFn()).slice(0, 3),
    }),
    initialData: { agenda, noticias },
  });

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      <section className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Associação Adonhiramita</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Bem-vindo ao site institucional. Confira abaixo a agenda e as últimas notícias.
        </p>
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Próxima agenda</h2>
            <Button variant="link" size="sm" asChild>
              <Link to="/agenda">Ver tudo</Link>
            </Button>
          </div>
          <div className="space-y-3">
            {data.agenda.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma atividade programada.</p>
            )}
            {data.agenda.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {item.tipo} {item.nome_grau ? `— ${item.nome_grau}` : ""}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{fmtData(item.data)}</p>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Últimas notícias</h2>
            <Button variant="link" size="sm" asChild>
              <Link to="/noticias">Ver tudo</Link>
            </Button>
          </div>
          <div className="space-y-3">
            {data.noticias.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma notícia publicada.</p>
            )}
            {data.noticias.map((noticia) => (
              <Link key={noticia.id} to="/noticias/$id" params={{ id: noticia.id }}>
                <Card className="transition-colors hover:border-primary">
                  <CardHeader>
                    <CardTitle className="text-base">{noticia.titulo}</CardTitle>
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
        </section>
      </div>
    </SiteInstitucionalLayout>
  );
}
