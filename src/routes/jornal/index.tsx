import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { obterEdicoesJornalPublicasFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/jornal/")({
  loader: async () => {
    const [edicoes, menu] = await Promise.allSettled([
      obterEdicoesJornalPublicasFn(),
      obterMenuPublicoFn(),
    ]);
    return {
      edicoes: edicoes.status === "fulfilled" ? edicoes.value : [],
      menu: menu.status === "fulfilled" ? menu.value : [],
    };
  },
  head: () => ({
    meta: [
      { title: "Edições do Jornal — Associação Adonhiramita" },
      {
        name: "description",
        content: "Edições anteriores do jornalzinho de notícias da Associação Adonhiramita.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: EdicoesJornalPage,
});

const fmtData = (d: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(d.replace(" ", "T")));

function EdicoesJornalPage() {
  const { edicoes: edicoesIniciais, menu } = Route.useLoaderData();
  const { data: edicoes = edicoesIniciais } = useQuery({
    queryKey: ["edicoes_jornal_publicas"],
    queryFn: async () => {
      try {
        return await obterEdicoesJornalPublicasFn();
      } catch {
        return edicoesIniciais;
      }
    },
    initialData: edicoesIniciais,
  });

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Edições do Jornal</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Edições anteriores do jornalzinho, reunindo várias notícias por vez.
      </p>
      {edicoes.length === 0 && (
        <p className="text-muted-foreground">Nenhuma edição publicada no momento.</p>
      )}
      <div className="space-y-3">
        {edicoes.map((edicao) => (
          <Link key={edicao.numero} to="/jornal/$numero" params={{ numero: String(edicao.numero) }}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="text-lg">
                  Edição nº {edicao.numero} — {edicao.titulo}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{fmtData(edicao.publicado_em)}</p>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </SiteInstitucionalLayout>
  );
}
