import type { RowDataPacket } from "mysql2";
import { withLojaConnection } from "./backend/db";
import { sanitizarRichTextPublico } from "./rich-text-server";
import { LOJA_PORTAL_PUBLICO } from "./loja-portal-publico";

export type PaginaPublica = {
  titulo: string;
  slug: string;
  conteudo: string;
  publicado_em: string;
};

export type PaginaListadaPublica = {
  titulo: string;
  slug: string;
};

/** Índice leve (só título + slug) das páginas publicadas — usado pra montar
 * navegação/sitemap (issue #382) sem baixar o conteúdo de todas. */
export async function listarPaginasPublicas(): Promise<PaginaListadaPublica[]> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT titulo, slug FROM paginas_site
       WHERE loja_id = @current_loja_id AND status = 'publicado'
       ORDER BY titulo`,
    );
    return rows.map((row) => ({ titulo: row.titulo, slug: row.slug }));
  });
}

export async function carregarPaginaPublicaPorSlug(slug: string): Promise<PaginaPublica | null> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT titulo, slug, conteudo, publicado_em FROM paginas_site
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND slug = ?`,
      [slug],
    );
    if (!row) return null;
    return {
      titulo: row.titulo,
      slug: row.slug,
      conteudo: sanitizarRichTextPublico(row.conteudo),
      publicado_em: row.publicado_em,
    };
  });
}
