import type { RowDataPacket } from "mysql2";
import { withLojaConnection } from "./backend/db";
import { sanitizarRichTextPublico } from "./rich-text-server";

// Mesma Loja seed hardcoded do endpoint de agenda pública (ver
// agenda-publica.ts) — o portal institucional é hoje um site só.
const LOJA_PORTAL_PUBLICO = "00000000-0000-4000-8000-000000000001";

export type NoticiaPublica = {
  id: string;
  titulo: string;
  resumo: string | null;
  conteudo: string;
  publicado_em: string;
};

export async function carregarNoticiasPublicas(): Promise<NoticiaPublica[]> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, titulo, resumo, conteudo, publicado_em
       FROM noticias
       WHERE loja_id = @current_loja_id AND status = 'publicado'
       ORDER BY publicado_em DESC
       LIMIT 100`,
    );
    return rows.map((row) => ({
      id: row.id,
      titulo: row.titulo,
      resumo: row.resumo,
      conteudo: sanitizarRichTextPublico(row.conteudo),
      publicado_em: row.publicado_em,
    }));
  });
}
