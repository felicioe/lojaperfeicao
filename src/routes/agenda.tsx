import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterAgendaPublicaFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/agenda")({
  loader: async () => {
    const [agenda, menu] = await Promise.all([obterAgendaPublicaFn(), obterMenuPublicoFn()]);
    return { agenda, menu };
  },
  head: () => ({
    meta: [
      { title: "Agenda — Associação Adonhiramita" },
      {
        name: "description",
        content: "Próximas sessões e atividades da Associação Adonhiramita.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: AgendaPublicaPage,
});

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(d.replace(" ", "T")),
  );

function AgendaPublicaPage() {
  const { agenda: agendaInicial, menu } = Route.useLoaderData();
  const { data: agenda = agendaInicial } = useQuery({
    queryKey: ["agenda_publica_site"],
    queryFn: () => obterAgendaPublicaFn(),
    initialData: agendaInicial,
  });

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
                  <h3 className="mb-1 text-sm font-semibold">Trabalhos</h3>
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
