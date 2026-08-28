import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { LOJA_PORTAL_PUBLICO } from "../loja-portal-publico";

// Autorização do fluxo editorial de Notícias e Páginas do Site (issue #391)
// — distinta de comPapelPortalPublico (portal-publico-authz.ts), que continua
// exclusiva de super_admin e segue sendo usada por Agenda Pública e Menu do
// Site (fora do escopo de editor_cms/aprovador_cms nesta v1).
//
// super_admin: acesso irrestrito, como sempre.
// editor_cms: só enxerga/edita o que foi atribuído a ele (editor_cms_colunas
//   e editor_cms_paginas) — checagem de posse fica por conta de cada função
//   de noticias.ts/paginas-site.ts, este módulo só garante o papel e a Loja.
// aprovador_cms: enxerga tudo, mas só aprova/rejeita — nunca edita conteúdo.
const PAPEIS_EDITORIAL_CMS = ["super_admin", "editor_cms", "aprovador_cms"];

export type PapeisEditorialCms = {
  superAdmin: boolean;
  editor: boolean;
  aprovador: boolean;
};

/** Mesmo motivo de comPapelPortalPublico: os três papéis agem sobre o site
 * institucional, que é sempre o da Loja hardcoded em loja-portal-publico.ts. */
export function comPapelEditorialCms<T>(
  fn: (conn: PoolConnection, usuarioId: string, lojaId: string) => Promise<T>,
): Promise<T> {
  return comPapel(PAPEIS_EDITORIAL_CMS, async (conn, usuarioId, lojaId) => {
    if (lojaId !== LOJA_PORTAL_PUBLICO) {
      throw new Error("Este recurso só pode ser gerido pela Loja do portal institucional.");
    }
    return fn(conn, usuarioId, lojaId);
  });
}

export async function papeisEditorialCms(
  conn: PoolConnection,
  usuarioId: string,
): Promise<PapeisEditorialCms> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT has_role(?, 'super_admin') AS super_admin,
            has_role(?, 'editor_cms') AS editor,
            has_role(?, 'aprovador_cms') AS aprovador`,
    [usuarioId, usuarioId, usuarioId],
  );
  return { superAdmin: !!row.super_admin, editor: !!row.editor, aprovador: !!row.aprovador };
}

/** IDs das colunas de notícia atribuídas a este usuário — vazio se ele não
 * tiver nenhuma (editor_cms recém-criado, ainda sem atribuição). */
export async function colunasDoEditor(conn: PoolConnection, usuarioId: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT coluna_id FROM editor_cms_colunas WHERE usuario_id = ?",
    [usuarioId],
  );
  return rows.map((r) => r.coluna_id as string);
}

/** IDs das páginas do site atribuídas a este usuário. */
export async function paginasDoEditor(conn: PoolConnection, usuarioId: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT pagina_id FROM editor_cms_paginas WHERE usuario_id = ?",
    [usuarioId],
  );
  return rows.map((r) => r.pagina_id as string);
}
