import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import { comPapelPortalPublico } from "./portal-publico-authz";

// CMS de páginas de conteúdo do site institucional (issue #380) — "Quem
// Somos", "História", "Contato" etc. Mesmo padrão de noticias.ts: exclusivo
// do super_admin, texto rico sanitizado só na leitura pública.

// Só letras minúsculas, números e hífen — vira parte da URL pública
// (/paginas/:slug, issue #382), então não pode ter espaço, acento ou barra.
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type PaginaSite = {
  id: string;
  titulo: string;
  slug: string;
  conteudo: string;
  status: "rascunho" | "publicado";
  publicado_em: string | null;
  autor_id: string;
  autor_nome: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const listarPaginasSite = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaginaSite[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT p.id, p.titulo, p.slug, p.conteudo, p.status, p.publicado_em,
                p.autor_id, u.email AS autor_nome, p.criado_em, p.atualizado_em
         FROM paginas_site p
         LEFT JOIN usuarios u ON u.id = p.autor_id AND u.loja_id = @current_loja_id
         WHERE p.loja_id = @current_loja_id
         ORDER BY p.criado_em DESC`,
      );
      return rows as PaginaSite[];
    });
  },
);

const paginaSchema = z.object({
  id: z.string().uuid().nullable(),
  titulo: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(200)
    .regex(SLUG_REGEX, "Use só letras minúsculas, números e hífen (ex.: quem-somos)."),
  conteudo: z.string().min(1),
});

export const salvarPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => paginaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      const [[emUso]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM paginas_site WHERE loja_id = @current_loja_id AND slug = ? AND id <> ?",
        [data.slug, data.id ?? ""],
      );
      if (emUso) throw new Error(`Já existe uma página com o endereço "${data.slug}".`);

      if (data.id) {
        await conn.query(
          `UPDATE paginas_site SET titulo=?, slug=?, conteudo=?
           WHERE id=? AND loja_id = @current_loja_id`,
          [data.titulo, data.slug, data.conteudo, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "pagina_site", data.id, null, {
          ...data,
        });
      } else {
        await conn.query(
          `INSERT INTO paginas_site (loja_id, titulo, slug, conteudo, autor_id)
           VALUES (?, ?, ?, ?, ?)`,
          [lojaId, data.titulo, data.slug, data.conteudo, usuarioIdAtual],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "pagina_site", null, null, {
          ...data,
        });
      }
    });
  });

export const definirStatusPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["rascunho", "publicado"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      // publicado_em só é carimbado na PRIMEIRA publicação — mesmo padrão
      // de noticias.ts (definirStatusNoticia).
      await conn.query(
        `UPDATE paginas_site
         SET status = ?, publicado_em = IF(? = 'publicado' AND publicado_em IS NULL, NOW(), publicado_em)
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.status, data.status, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        data.status === "publicado" ? "publicar" : "despublicar",
        "pagina_site",
        data.id,
        null,
        null,
      );
    });
  });

export const excluirPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM paginas_site WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "pagina_site", data.id, null, null);
    });
  });
