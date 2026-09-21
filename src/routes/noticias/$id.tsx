import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { obterNoticiaPublicaPorIdFn, obterMenuPublicoFn } from "@/lib/site-publico-serverfns";
import { registrarDownloadImagemNoticia } from "@/lib/backend/noticias";
import {
  listarComentariosNoticia,
  criarComentarioNoticia,
  moderarComentarioNoticia,
} from "@/lib/backend/noticias-comentarios";
import { useSession } from "@/lib/auth-hooks";
import { SiteInstitucionalLayout } from "@/components/app/SiteInstitucionalLayout";
import { ConteudoPublicoHtml } from "@/components/app/ConteudoPublicoHtml";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download, FileText, EyeOff, Eye } from "lucide-react";

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
  const qc = useQueryClient();
  const [novoComentario, setNovoComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  // achado #664 — comentários só pra Irmão autenticado (mesmo critério do
  // download da imagem, acima): visitante anônimo nem chega a chamar a
  // server function (ela também barra sozinha via comSessao, mas evitar a
  // chamada já poupa uma viagem ao servidor que sempre daria erro).
  const noticiaId = noticia?.id;
  const { data: comentariosData } = useQuery({
    queryKey: ["comentarios_noticia", noticiaId],
    queryFn: () => listarComentariosNoticia({ data: { noticiaId: noticiaId! } }),
    enabled: !!user && !!noticiaId,
  });

  const invalidarComentarios = () =>
    qc.invalidateQueries({ queryKey: ["comentarios_noticia", noticiaId] });

  const enviarComentario = async () => {
    if (!noticiaId || !novoComentario.trim()) return;
    setEnviandoComentario(true);
    try {
      await criarComentarioNoticia({ data: { noticiaId, texto: novoComentario.trim() } });
      setNovoComentario("");
      invalidarComentarios();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao publicar o comentário.");
    } finally {
      setEnviandoComentario(false);
    }
  };

  const moderar = async (id: string, status: "visivel" | "oculto") => {
    try {
      await moderarComentarioNoticia({ data: { id, status } });
      invalidarComentarios();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao moderar o comentário.");
    }
  };

  // achado #676 — imagem/anexo não vêm mais embutidos como data: URL no
  // loader da página (inflava o HTML sem compressão dinâmica no SSR); agora
  // são servidos sob demanda por rota própria, com Cache-Control (server.ts).
  const urlImagemCapa = noticia ? `/api/publico/noticias/${noticia.id}/imagem` : null;
  const urlAnexo = noticia ? `/api/publico/noticias/${noticia.id}/anexo` : null;

  const baixarImagem = async () => {
    if (!noticia?.temImagemCapa || !urlImagemCapa) return;
    try {
      await registrarDownloadImagemNoticia({ data: { id: noticia.id } });
    } catch {
      // Log é best-effort — não trava o download por causa disso.
    }
    const link = document.createElement("a");
    link.href = urlImagemCapa;
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
          {noticia.temImagemCapa && urlImagemCapa && (
            <div className="mb-6">
              <img
                src={urlImagemCapa}
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
          {noticia.temAnexo && urlAnexo && (
            <div className="mt-6">
              <Button variant="outline" size="sm" asChild>
                <a href={urlAnexo} download={noticia.anexoNomeOriginal ?? undefined}>
                  <FileText className="mr-1.5 h-4 w-4" />
                  Baixar anexo
                  {noticia.anexoNomeOriginal ? `: ${noticia.anexoNomeOriginal}` : ""}
                </a>
              </Button>
            </div>
          )}

          {user && (
            <div className="mt-10 border-t pt-6">
              <h2 className="mb-4 text-xl font-semibold">Comentários</h2>
              <div className="mb-4 space-y-1">
                <Textarea
                  rows={3}
                  maxLength={2000}
                  placeholder="Deixe seu comentário…"
                  value={novoComentario}
                  onChange={(e) => setNovoComentario(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!novoComentario.trim() || enviandoComentario}
                  onClick={() => void enviarComentario()}
                >
                  {enviandoComentario ? "Enviando…" : "Comentar"}
                </Button>
              </div>
              {comentariosData?.comentarios.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
              )}
              <div className="space-y-3">
                {comentariosData?.comentarios.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 ${c.status === "oculto" ? "opacity-50" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium">{c.autorNome ?? "Irmão"}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(c.criadoEm.replace(" ", "T")))}
                      </span>
                    </div>
                    <p className="text-sm">{c.texto}</p>
                    {comentariosData.podeModerar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() =>
                          void moderar(c.id, c.status === "visivel" ? "oculto" : "visivel")
                        }
                      >
                        {c.status === "visivel" ? (
                          <>
                            <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar
                          </>
                        ) : (
                          <>
                            <Eye className="mr-1 h-3.5 w-3.5" /> Reexibir
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SiteInstitucionalLayout>
  );
}
