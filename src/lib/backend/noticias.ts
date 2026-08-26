import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { LOJA_PORTAL_PUBLICO } from "../loja-portal-publico";

// CMS de notícias/publicações do site institucional (issue #366).
// Exclusivo do super_admin (dono do domínio) — decisão do usuário: manter
// o conteúdo do site institucional fora do alcance de um admin comum de
// Loja, diferente de eventos.ts/comunicacoes.ts (que são conteúdo interno,
// não o site público).
const PAPEIS_ESCRITA = ["super_admin"];

/**
 * O portal público (noticias-publica.ts) só lê da Loja hardcoded em
 * loja-portal-publico.ts — enquanto não existir resolução de Loja por
 * requisição (issue #341), um super_admin de outra Loja conseguiria criar
 * e "publicar" notícias aqui que nunca apareceriam em /api/publico/noticias,
 * uma falha silenciosa (achado do review automático da PR #368). Recusa
 * cedo em vez de deixar a Loja errada acumular conteúdo fantasma.
 */
function comPapelPortalPublico<T>(
  fn: (conn: PoolConnection, usuarioId: string, lojaId: string) => Promise<T>,
): Promise<T> {
  return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId, lojaId) => {
    if (lojaId !== LOJA_PORTAL_PUBLICO) {
      throw new Error("Notícias do site só podem ser geridas pela Loja do portal institucional.");
    }
    return fn(conn, usuarioId, lojaId);
  });
}

export type Noticia = {
  id: string;
  titulo: string;
  resumo: string | null;
  conteudo: string;
  status: "rascunho" | "publicado";
  publicado_em: string | null;
  autor_id: string;
  autor_nome: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const listarNoticias = createServerFn({ method: "GET" }).handler(
  async (): Promise<Noticia[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT n.id, n.titulo, n.resumo, n.conteudo, n.status, n.publicado_em,
                n.autor_id, u.email AS autor_nome, n.criado_em, n.atualizado_em
         FROM noticias n
         LEFT JOIN usuarios u ON u.id = n.autor_id AND u.loja_id = @current_loja_id
         WHERE n.loja_id = @current_loja_id
         ORDER BY n.criado_em DESC`,
      );
      return rows as Noticia[];
    });
  },
);

const noticiaSchema = z.object({
  id: z.string().uuid().nullable(),
  // VARCHAR(200) na tabela noticias (migração 0113) — sem o .max() aqui, um
  // título maior passava pela validação e só quebrava no INSERT/UPDATE em
  // modo estrito, com um erro de banco cru em vez de uma mensagem clara.
  titulo: z.string().min(1).max(200),
  resumo: z.string().nullable(),
  conteudo: z.string().min(1),
});

export const salvarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => noticiaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      if (data.id) {
        await conn.query(
          `UPDATE noticias SET titulo=?, resumo=?, conteudo=?
           WHERE id=? AND loja_id = @current_loja_id`,
          [data.titulo, data.resumo, data.conteudo, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "noticia", data.id, null, {
          ...data,
        });
      } else {
        await conn.query(
          `INSERT INTO noticias (loja_id, titulo, resumo, conteudo, autor_id)
           VALUES (?, ?, ?, ?, ?)`,
          [lojaId, data.titulo, data.resumo, data.conteudo, usuarioIdAtual],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "noticia", null, null, {
          ...data,
        });
      }
    });
  });

export const definirStatusNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["rascunho", "publicado"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      // publicado_em só é carimbado na PRIMEIRA publicação — despublicar e
      // publicar de novo não deve fingir que a notícia é mais nova do que é.
      await conn.query(
        `UPDATE noticias
         SET status = ?, publicado_em = IF(? = 'publicado' AND publicado_em IS NULL, NOW(), publicado_em)
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.status, data.status, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        data.status === "publicado" ? "publicar" : "despublicar",
        "noticia",
        data.id,
        null,
        null,
      );
    });
  });

export const excluirNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM noticias WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "noticia", data.id, null, null);
    });
  });
