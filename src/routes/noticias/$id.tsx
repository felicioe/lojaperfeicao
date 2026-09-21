import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { obterNoticiaPublicaPorIdFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { registrarDownloadImagemNoticia } from "@/lib/backend/noticias";
import { useSession } from "@/lib/auth-hooks";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileText } from "lucide-react";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/noticias/$id")({
  loader: async ({ params }) => {
    // Só um :id malformado vira 404 aqui — uma falha real do backend (banco
    // fora do ar, erro de schema) precisa propagar como 500, não ser
    // confundida com "notícia não existe" (achado do review automático da
    // PR #386).
    if (!UUID_REGEX.test(params.id)) throw notFound();
    const [noticia, menu] = await Promise.allSettled([
      obterNoticiaPublicaPorIdFn({ data: { id: params.id } }),
      obterMenuPublicoFn(),
    ]);
    if (noticia.status !== "fulfilled") {
      return {
        noticia: null,
        menu: menu.status === "fulfilled" ? menu.value : [],
        indisponivel: true,
      };
    }
    if (!noticia.value) throw notFound();
    return {
      noticia: noticia.value,
      menu: menu.status === "fulfilled" ? menu.value : [],
      indisponivel: false,
    };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.noticia
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
  const { noticia, menu, indisponivel } = Route.useLoaderData();
  // achado #662 — download com log só faz sentido pra quem está logado (o
  // registro de auditoria precisa de um usuário); visitante anônimo do site
  // institucional só vê a imagem, sem o botão de baixar-com-log.
  const { user } = useSession();

  const baixarImagem = async () => {
    if (!noticia?.imagem_capa_url) return;
    try {
      await registrarDownloadImagemNoticia({ data: { id: noticia.id } });
    } catch {
      // Log é best-effort — não trava o download por causa disso.
    }
    const link = document.createElement("a");
    link.href = noticia.imagem_capa_url;
    link.download = `${noticia.titulo}.jpg`;
    link.click();
  };

  return (
    <SiteInstitucionalLayout menuInicial={menu}>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/noticias">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar às notícias
        </Link>
      </Button>
      {indisponivel || !noticia ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta notícia está temporariamente indisponível. Tente novamente em instantes.
        </div>
      ) : (
        <>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">{noticia.titulo}</h1>
          <p className="mb-6 text-sm text-muted-foreground">{fmtData(noticia.publicado_em)}</p>
          {noticia.imagem_capa_url && (
            <div className="mb-6">
              <img
                src={noticia.imagem_capa_url}
                alt={noticia.titulo}
                className="w-full rounded-xl border object-cover"
              />
              {user && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void baixarImagem()}
                >
                  <Download className="mr-1.5 h-4 w-4" /> Baixar imagem
                </Button>
              )}
            </div>
          )}
          <ConteudoPublicoHtml html={noticia.conteudo} />
          {noticia.anexo_url && (
            <div className="mt-6">
              <Button variant="outline" size="sm" asChild>
                <a href={noticia.anexo_url} download={noticia.anexo_nome_original ?? undefined}>
                  <FileText className="mr-1.5 h-4 w-4" />
                  Baixar anexo
                  {noticia.anexo_nome_original ? `: ${noticia.anexo_nome_original}` : ""}
                </a>
              </Button>
            </div>
          )}
        </>
      )}
    </SiteInstitucionalLayout>
  );
}
