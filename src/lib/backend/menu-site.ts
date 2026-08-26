import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import { comPapelPortalPublico } from "./portal-publico-authz";

// Editor de menu de navegação do site institucional (issue #381). Mesmo
// padrão de páginas/notícias/agenda pública: exclusivo do super_admin.

export type TipoDestinoMenu = "pagina" | "agenda" | "noticias" | "link_externo";

export type ItemMenuSite = {
  id: string;
  parent_id: string | null;
  label: string;
  tipo_destino: TipoDestinoMenu;
  destino: string;
  ordem: number;
  visivel: boolean;
};

export const listarMenuSite = createServerFn({ method: "GET" }).handler(
  async (): Promise<ItemMenuSite[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, parent_id, label, tipo_destino, destino, ordem, visivel
         FROM menu_site
         WHERE loja_id = @current_loja_id
         ORDER BY parent_id IS NOT NULL, ordem ASC`,
      );
      return rows as ItemMenuSite[];
    });
  },
);

const itemSchema = z.object({
  id: z.string().uuid().nullable(),
  parentId: z.string().uuid().nullable(),
  label: z.string().trim().min(1).max(100),
  tipoDestino: z.enum(["pagina", "agenda", "noticias", "link_externo"]),
  destino: z.string().trim().min(1).max(500),
});

export const salvarItemMenuSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => itemSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      if (data.parentId !== null && data.parentId === data.id) {
        throw new Error("Um item não pode ser submenu de si mesmo.");
      }

      if (data.id) {
        await conn.query(
          `UPDATE menu_site SET parent_id=?, label=?, tipo_destino=?, destino=?
           WHERE id=? AND loja_id = @current_loja_id`,
          [data.parentId, data.label, data.tipoDestino, data.destino, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "menu_site", data.id, null, {
          ...data,
        });
      } else {
        const [[{ proximaOrdem }]] = await conn.query<RowDataPacket[]>(
          `SELECT COALESCE(MAX(ordem), -1) + 1 AS proximaOrdem
           FROM menu_site
           WHERE loja_id = @current_loja_id
             AND parent_id <=> ?`,
          [data.parentId],
        );
        await conn.query(
          `INSERT INTO menu_site (loja_id, parent_id, label, tipo_destino, destino, ordem)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [lojaId, data.parentId, data.label, data.tipoDestino, data.destino, proximaOrdem],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "menu_site", null, null, {
          ...data,
        });
      }
    });
  });

export const alternarVisivelItemMenuSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), visivel: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      await conn.query(
        "UPDATE menu_site SET visivel = ? WHERE id = ? AND loja_id = @current_loja_id",
        [data.visivel, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        data.visivel ? "mostrar" : "ocultar",
        "menu_site",
        data.id,
        null,
        null,
      );
    });
  });

export const excluirItemMenuSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      // ON DELETE CASCADE (migração 0120) já leva os submenus junto.
      await conn.query("DELETE FROM menu_site WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "menu_site", data.id, null, null);
    });
  });

const moverSchema = z.object({ id: z.string().uuid(), direcao: z.enum(["cima", "baixo"]) });

export const moverItemMenuSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => moverSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      const [[atual]] = await conn.query<RowDataPacket[]>(
        "SELECT id, parent_id, ordem FROM menu_site WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (!atual) throw new Error("Item de menu não encontrado.");

      const [[vizinho]] = await conn.query<RowDataPacket[]>(
        `SELECT id, ordem FROM menu_site
         WHERE loja_id = @current_loja_id AND parent_id <=> ?
           AND ordem ${data.direcao === "cima" ? "<" : ">"} ?
         ORDER BY ordem ${data.direcao === "cima" ? "DESC" : "ASC"}
         LIMIT 1`,
        [atual.parent_id, atual.ordem],
      );
      if (!vizinho) return; // já é o primeiro/último — nada a fazer.

      await conn.query("UPDATE menu_site SET ordem = ? WHERE id = ?", [vizinho.ordem, atual.id]);
      await conn.query("UPDATE menu_site SET ordem = ? WHERE id = ?", [atual.ordem, vizinho.id]);
      await registrarAuditoria(conn, usuarioIdAtual, "reordenar", "menu_site", data.id, null, {
        direcao: data.direcao,
      });
    });
  });
