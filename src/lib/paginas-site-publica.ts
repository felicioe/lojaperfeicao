import type { RowDataPacket } from "mysql2";
import { withLojaConnection } from "./backend/db";
import { sanitizarRichTextPublico } from "./rich-text-server";
import { LOJA_PORTAL_PUBLICO } from "./loja-portal-publico";

export type PaginaPublica = {
  titulo: string;
  slug: string;
  conteudo: string;
  publicado_em: string;
  restrita: boolean;
};

export type PaginaListadaPublica = {
  titulo: string;
  slug: string;
};

/** Índice leve (só título + slug) das páginas publicadas — usado pra montar
 * navegação/sitemap (issue #382) sem baixar o conteúdo de todas. Só usado
 * hoje pelo endpoint legado consumido pelo site externo antigo (server.ts),
 * que não tem noção nenhuma de login — página restrita nunca entra aqui,
 * sem exceção (issue #692), pra não vazar título/slug pra quem não pode ver
 * o conteúdo de qualquer jeito. */
export async function listarPaginasPublicas(): Promise<PaginaListadaPublica[]> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT titulo, slug FROM paginas_site
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND restrita = FALSE
       ORDER BY titulo`,
    );
    return rows.map((row) => ({ titulo: row.titulo, slug: row.slug }));
  });
}

// issue #692 — página restrita continua existindo pra quem tem o link
// (diferente da notícia restrita, que some — decisão já confirmada: aqui a
// tela mostra "faça login" em vez de conteúdo). Por isso a query SEMPRE
// carrega a linha (se publicada); quem decide se o CONTEÚDO pode sair é o
// chamador, via `incluirConteudoRestrito` — sem isso, o HTML da página
// restrita iria inteiro pro cliente antes de qualquer checagem de UI,
// mesmo que a tela decidisse não renderizar (mesma lição do achado #676:
// nunca mandar o dado sensível pra fora se a regra pode ser aplicada aqui).
export async function carregarPaginaPublicaPorSlug(
  slug: string,
  incluirConteudoRestrito = false,
): Promise<PaginaPublica | null> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT titulo, slug, conteudo, publicado_em, restrita FROM paginas_site
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND slug = ?`,
      [slug],
    );
    if (!row) return null;
    const restrita = !!row.restrita;
    return {
      titulo: row.titulo,
      slug: row.slug,
      conteudo: restrita && !incluirConteudoRestrito ? "" : sanitizarRichTextPublico(row.conteudo),
      publicado_em: row.publicado_em,
      restrita,
    };
  });
}
