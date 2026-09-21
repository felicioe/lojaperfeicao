import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSessao } from "@/lib/backend/auth";
import { obterNoticiasPublicasResumoFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

// Antes desta issue (#382), "/" sempre redirecionava pro dashboard interno —
// fazia sentido quando só existia o sistema logado. Agora "/" é a home
// pública do site institucional embutido pra quem não está logado; quem já
// tem sessão continua caindo direto no dashboard, como sempre.
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      const usuario = await getSessao();
      if (usuario) throw redirect({ to: "/dashboard" });
    } catch (error) {
      // O portal institucional deve continuar disponível mesmo quando o
      // banco estiver temporariamente indisponível. Redirecionamentos são
      // respostas de controle do roteador e precisam continuar propagando.
      if (isRedirectResponse(error)) throw error;
      console.error("Falha ao verificar a sessão na home pública:", error);
    }
  },
  loader: async () => {
    const [noticias, menu] = await Promise.allSettled([
      obterNoticiasPublicasResumoFn(),
      obterMenuPublicoFn(),
    ]);
    return {
      noticias: noticias.status === "fulfilled" ? noticias.value.slice(0, 3) : [],
      menu: menu.status === "fulfilled" ? menu.value : [],
    };
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

function isRedirectResponse(error: unknown): boolean {
  return (
    error instanceof Response ||
    (typeof error === "object" && error !== null && "isRedirect" in error)
  );
}

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(d.replace(" ", "T")));

function HomePublica() {
  const { noticias, menu } = Route.useLoaderData();
  const { data } = useQuery({
    queryKey: ["home_publica_site"],
    queryFn: async () => {
      const noticiasAtuais = await obterNoticiasPublicasResumoFn().catch(() => noticias);
      return { noticias: noticiasAtuais.slice(0, 3) };
    },
    initialData: { noticias },
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
        {/* issue #691 — a agenda (tipo de sessão, grau, trabalhos) é área
            restrita a Irmãos; quem chega nesta home pública é sempre
            visitante anônimo (beforeLoad acima redireciona qualquer sessão
            ativa pra /dashboard antes de renderizar isto), então o preview
            que existia aqui SEMPRE vazava esse dado pra anônimo. Vira só um
            convite pra entrar — sem nenhum dado de sessão. */}
        <section>
          <h2 className="mb-3 text-xl font-semibold">Área do Irmão</h2>
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                Agenda de sessões e conteúdo restrito ficam disponíveis depois do login.
              </div>
              <Button size="sm" asChild>
                <Link to="/auth" search={{ redirect: "/agenda" }}>
                  Entrar
                </Link>
              </Button>
            </CardContent>
          </Card>
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
