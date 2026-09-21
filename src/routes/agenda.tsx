import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterAgendaPublicaFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { getSessao } from "@/lib/backend/auth";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

// issue #691 — Agenda mostra tipo de sessão, grau e títulos de trabalhos:
// dado interno demais pra ficar público (o gate real, contra chamada direta
// do serverFn, está em obterAgendaPublicaFn — aqui só decide o que
// RENDERIZAR). `autenticado` é resolvido no loader (SSR), não só no
// componente, pra não piscar o conteúdo antes de checar sessão.
export const Route = createFileRoute("/agenda")({
  loader: async () => {
    const [agenda, menu, sessao] = await Promise.allSettled([
      obterAgendaPublicaFn(),
      obterMenuPublicoFn(),
      getSessao(),
    ]);
    return {
      agenda: agenda.status === "fulfilled" ? agenda.value : [],
      menu: menu.status === "fulfilled" ? menu.value : [],
      autenticado: sessao.status === "fulfilled" && !!sessao.value,
    };
  },
  head: () => ({
    meta: [
      { title: "Agenda — Associação Adonhiramita" },
      {
        name: "description",
        content: "Próximas sessões e atividades da Associação Adonhiramita.",
      },
    ],
  }),
  component: AgendaPublicaPage,
});

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(d.replace(" ", "T")),
  );

function AgendaPublicaPage() {
  const { agenda: agendaInicial, menu, autenticado } = Route.useLoaderData();
  const { data: agenda = agendaInicial } = useQuery({
    queryKey: ["agenda_publica_site"],
    queryFn: async () => {
      try {
        return await obterAgendaPublicaFn();
      } catch {
        return agendaInicial;
      }
    },
    initialData: agendaInicial,
    enabled: autenticado,
  });

  if (!autenticado) {
    return (
      <SiteInstitucionalLayout menuInicial={menu}>
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Agenda</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              A agenda é uma área restrita a Irmãos. Faça login para ver as próximas sessões.
            </p>
            <Button asChild>
              <Link to="/auth" search={{ redirect: "/agenda" }}>
                Entrar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </SiteInstitucionalLayout>
    );
  }

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Agenda</h1>
      {agenda.length === 0 && (
        <p className="text-muted-foreground">Nenhuma atividade programada no momento.</p>
      )}
      <div className="space-y-4">
        {agenda.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-lg">
                {item.tipo} {item.nome_grau ? `— ${item.nome_grau}` : ""}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{fmtData(item.data)}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {item.observacao && <ConteudoPublicoHtml html={item.observacao} />}
              {item.trabalhos.length > 0 && (
                <div>
                  <h2 className="mb-1 text-sm font-semibold">Trabalhos</h2>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {item.trabalhos.map((trabalho, idx) => (
                      <li key={idx}>
                        {trabalho.titulo}
                        {trabalho.nome_historico
                          ? ` — Apresentação: ${trabalho.nome_historico}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </SiteInstitucionalLayout>
  );
}
