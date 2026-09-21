import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  obterEdicaoJornalPublicaPorNumeroFn,
  obterMenuPublicoFn,
} from "@/lib/site-publico-serverfns";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/jornal/$numero")({
  loader: async ({ params }) => {
    const numero = Number(params.numero);
    // Só um :numero malformado vira 404 — falha real do backend (banco fora
    // do ar) precisa propagar como 500, mesmo raciocínio de /noticias/:id.
    if (!Number.isInteger(numero) || numero <= 0) throw notFound();
    const [edicao, menu] = await Promise.allSettled([
      obterEdicaoJornalPublicaPorNumeroFn({ data: { numero } }),
      obterMenuPublicoFn(),
    ]);
    if (edicao.status !== "fulfilled") {
      return {
        edicao: null,
        menu: menu.status === "fulfilled" ? menu.value : [],
        indisponivel: true,
      };
    }
    if (!edicao.value) throw notFound();
    return {
      edicao: edicao.value,
      menu: menu.status === "fulfilled" ? menu.value : [],
      indisponivel: false,
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.edicao
      ? [
          {
            title: `Edição nº ${loaderData.edicao.numero} — ${loaderData.edicao.titulo} — Associação Adonhiramita`,
          },
          { name: "robots", content: "index, follow" },
        ]
      : [],
  }),
  component: EdicaoJornalPage,
});

function EdicaoJornalPage() {
  const { edicao, menu, indisponivel } = Route.useLoaderData();

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/jornal">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar às edições
        </Link>
      </Button>
      {indisponivel || !edicao ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta edição está temporariamente indisponível. Tente novamente em instantes.
        </div>
      ) : (
        // HTML já sanitizado/montado no momento da publicação (jornal.ts,
        // mesmo caminho seguro-por-construção de ConteudoPublicoHtml) — não
        // é rich-text de usuário solto, é o mesmo template do e-mail.
        <div dangerouslySetInnerHTML={{ __html: edicao.html }} />
      )}
    </SiteInstitucionalLayout>
  );
}
