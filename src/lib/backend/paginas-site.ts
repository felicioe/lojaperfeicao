import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import {
  comPapelEditorialCms,
  papeisEditorialCms,
  paginasDoEditor,
  type PapeisEditorialCms,
} from "./cms-editorial-authz";

// CMS de páginas de conteúdo do site institucional (issue #380, ampliado
// pela #391 com fluxo de aprovação) — "Quem Somos", "História", "Contato"
// etc. Mesmo modelo de noticias.ts: super_admin irrestrito, editor_cms só
// nas páginas atribuídas a ele e nunca publica direto, aprovador_cms só
// aprova/rejeita.

// Só letras minúsculas, números e hífen — vira parte da URL pública
// (/paginas/:slug, issue #382), então não pode ter espaço, acento ou barra.
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type PaginaSite = {
  id: string;
  titulo: string;
  slug: string;
  conteudo: string;
  status: "rascunho" | "aguardando_aprovacao" | "publicado";
  motivo_rejeicao: string | null;
  publicado_em: string | null;
  autor_id: string;
  autor_nome: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const listarPaginasSite = createServerFn({ method: "GET" }).handler(
  async (): Promise<PaginaSite[]> => {
    return comPapelEditorialCms(async (conn, usuarioId) => {
      const papeis = await papeisEditorialCms(conn, usuarioId);
      const somentePropria = !papeis.superAdmin && !papeis.aprovador;
      const filtro = somentePropria
        ? "AND p.id IN (SELECT pagina_id FROM editor_cms_paginas WHERE usuario_id = ?)"
        : "";
      const params = somentePropria ? [usuarioId] : [];
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT p.id, p.titulo, p.slug, p.conteudo, p.status, p.motivo_rejeicao, p.publicado_em,
                p.autor_id, u.email AS autor_nome, p.criado_em, p.atualizado_em
         FROM paginas_site p
         LEFT JOIN usuarios u ON u.id = p.autor_id AND u.loja_id = @current_loja_id
         WHERE p.loja_id = @current_loja_id ${filtro}
         ORDER BY p.criado_em DESC`,
        params,
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

async function exigirPaginaPropriaEmRascunho(
  conn: PoolConnection,
  usuarioId: string,
  id: string,
): Promise<void> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT status FROM paginas_site WHERE id = ? AND loja_id = @current_loja_id",
    [id],
  );
  if (!row) throw new Error("Página não encontrada.");
  const paginas = await paginasDoEditor(conn, usuarioId);
  if (!paginas.includes(id)) {
    throw new Error("Você só pode mexer na(s) página(s) atribuída(s) a você.");
  }
  if (row.status !== "rascunho") {
    throw new Error(
      "Esta página já foi enviada para aprovação ou publicada — só dá pra editar rascunho.",
    );
  }
}

export const salvarPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => paginaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual, lojaId) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (papeis.aprovador && !papeis.superAdmin) {
        throw new Error("aprovador_cms só aprova ou rejeita — não edita conteúdo.");
      }
      const editorRestrito = !papeis.superAdmin;

      // Uma página NOVA só pode nascer por super_admin: editor_cms escreve
      // dentro de páginas já criadas e atribuídas a ele (diferente de
      // Notícias, onde ele mesmo escolhe a coluna ao criar) — decisão de
      // manter a estrutura do site (quais páginas existem) fora do alcance
      // de quem só devia preencher o conteúdo de uma já combinada.
      if (!data.id && editorRestrito) {
        throw new Error("Só o super administrador cria páginas novas.");
      }
      if (data.id && editorRestrito) {
        await exigirPaginaPropriaEmRascunho(conn, usuarioIdAtual, data.id);
      }

      const [[emUso]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM paginas_site WHERE loja_id = @current_loja_id AND slug = ? AND id <> ?",
        [data.slug, data.id ?? ""],
      );
      if (emUso) throw new Error(`Já existe uma página com o endereço "${data.slug}".`);

      if (data.id) {
        await conn.query(
          `UPDATE paginas_site SET titulo=?, slug=?, conteudo=?, motivo_rejeicao=NULL
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

const idSchema = z.object({ id: z.string().uuid() });

export const definirStatusPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["rascunho", "publicado"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) {
        throw new Error("Só o super administrador publica ou despublica direto, sem aprovação.");
      }
      // publicado_em só é carimbado na PRIMEIRA publicação — mesmo padrão
      // de noticias.ts (definirStatusNoticia).
      await conn.query(
        `UPDATE paginas_site
         SET status = ?, motivo_rejeicao = NULL,
             publicado_em = IF(? = 'publicado' AND publicado_em IS NULL, NOW(), publicado_em)
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

export const enviarPaginaSiteParaAprovacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) await exigirPaginaPropriaEmRascunho(conn, usuarioIdAtual, data.id);
      await conn.query(
        "UPDATE paginas_site SET status = 'aguardando_aprovacao', motivo_rejeicao = NULL WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "enviar_para_aprovacao",
        "pagina_site",
        data.id,
        null,
        null,
      );
    });
  });

async function exigirAguardandoAprovacao(conn: PoolConnection, id: string): Promise<void> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT status FROM paginas_site WHERE id = ? AND loja_id = @current_loja_id",
    [id],
  );
  if (!row) throw new Error("Página não encontrada.");
  if (row.status !== "aguardando_aprovacao") {
    throw new Error("Esta página não está aguardando aprovação.");
  }
}

export const aprovarPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin && !papeis.aprovador) {
        throw new Error("Só super_admin ou aprovador_cms aprovam página.");
      }
      await exigirAguardandoAprovacao(conn, data.id);
      await conn.query(
        `UPDATE paginas_site
         SET status = 'publicado', motivo_rejeicao = NULL,
             publicado_em = IF(publicado_em IS NULL, NOW(), publicado_em)
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.id],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "aprovar", "pagina_site", data.id, null, null);
    });
  });

const rejeitarSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(1).max(500),
});

export const rejeitarPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => rejeitarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin && !papeis.aprovador) {
        throw new Error("Só super_admin ou aprovador_cms rejeitam página.");
      }
      await exigirAguardandoAprovacao(conn, data.id);
      await conn.query(
        "UPDATE paginas_site SET status = 'rascunho', motivo_rejeicao = ? WHERE id = ? AND loja_id = @current_loja_id",
        [data.motivo, data.id],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "rejeitar", "pagina_site", data.id, null, {
        motivo: data.motivo,
      });
    });
  });

export const excluirPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) {
        throw new Error("Só o super administrador exclui página do site.");
      }
      await conn.query("DELETE FROM paginas_site WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "pagina_site", data.id, null, null);
    });
  });
