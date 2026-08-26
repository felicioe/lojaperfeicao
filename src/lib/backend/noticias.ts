import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// CMS de notícias/publicações do site institucional (issue #366). Mesmos
// papéis de escrita de eventos.ts/comunicacoes.ts — quem já cuida da
// comunicação institucional da Loja.
const PAPEIS_ESCRITA = ["admin", "secretario"];

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
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
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
  titulo: z.string().min(1),
  resumo: z.string().nullable(),
  conteudo: z.string().min(1),
});

export const salvarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => noticiaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual, lojaId) => {
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
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
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
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM noticias WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "noticia", data.id, null, null);
    });
  });
