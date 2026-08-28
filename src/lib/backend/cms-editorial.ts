import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import { comPapelPortalPublico } from "./portal-publico-authz";

// Gestão de colunas de notícia e atribuição de editor_cms/aprovador_cms
// (issue #391) — exclusiva de super_admin, igual ao resto do CMS do site
// institucional: quem pode designar um colunista e dizer o que ele mexe é o
// mesmo super_admin que hoje é o único a mexer em Notícias/Páginas.

export type ColunaNoticia = {
  id: string;
  nome: string;
  editor_usuario_id: string | null;
  editor_nome: string | null;
  criado_em: string;
};

export const listarColunasNoticia = createServerFn({ method: "GET" }).handler(
  async (): Promise<ColunaNoticia[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.nome, c.criado_em, ec.usuario_id AS editor_usuario_id,
                u.nome_completo AS editor_nome
         FROM noticias_colunas c
         LEFT JOIN editor_cms_colunas ec ON ec.coluna_id = c.id
         LEFT JOIN usuarios u ON u.id = ec.usuario_id AND u.loja_id = @current_loja_id
         WHERE c.loja_id = @current_loja_id
         ORDER BY c.nome`,
      );
      return rows as ColunaNoticia[];
    });
  },
);

const colunaSchema = z.object({
  id: z.string().uuid().nullable(),
  nome: z.string().trim().min(1).max(120),
});

export const salvarColunaNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => colunaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      const [[emUso]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM noticias_colunas WHERE loja_id = @current_loja_id AND nome = ? AND id <> ?",
        [data.nome, data.id ?? ""],
      );
      if (emUso) throw new Error(`Já existe uma coluna chamada "${data.nome}".`);

      if (data.id) {
        await conn.query(
          "UPDATE noticias_colunas SET nome = ? WHERE id = ? AND loja_id = @current_loja_id",
          [data.nome, data.id],
        );
        await registrarAuditoria(
          conn,
          usuarioIdAtual,
          "atualizar",
          "noticia_coluna",
          data.id,
          null,
          {
            nome: data.nome,
          },
        );
      } else {
        await conn.query("INSERT INTO noticias_colunas (loja_id, nome) VALUES (?, ?)", [
          lojaId,
          data.nome,
        ]);
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "noticia_coluna", null, null, {
          nome: data.nome,
        });
      }
    });
  });

export const excluirColunaNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      // ON DELETE SET NULL em noticias.coluna_id: as notícias já escritas não
      // somem, só ficam sem coluna (voltam a ser geridas só por super_admin/
      // aprovador_cms, igual ao conteúdo de antes desta feature existir).
      await conn.query("DELETE FROM noticias_colunas WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "excluir",
        "noticia_coluna",
        data.id,
        null,
        null,
      );
    });
  });

export type UsuarioCms = {
  id: string;
  nome_completo: string | null;
  email: string;
  papeis: string[];
};

/** Todos os usuários da Loja do portal — a tela usa `papeis` pra separar
 * quem já é editor_cms/aprovador_cms (mostra atribuição) de quem ainda não
 * é (mostra botão de conceder). Concessão do papel em si é exclusiva de
 * super_admin (concederPapelCms/revogarPapelCms abaixo) — diferente dos
 * demais papéis de Loja, geridos por qualquer admin na tela Usuários. */
export const listarUsuariosLoja = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsuarioCms[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT u.id, u.nome_completo, u.email, GROUP_CONCAT(DISTINCT up.papel) AS papeis
         FROM usuarios u
         LEFT JOIN usuarios_papeis up ON up.usuario_id = u.id AND up.loja_id = @current_loja_id
         WHERE u.loja_id = @current_loja_id AND u.ativo = 1
         GROUP BY u.id, u.nome_completo, u.email
         ORDER BY u.nome_completo`,
      );
      return rows.map((r) => ({
        ...r,
        papeis: r.papeis ? String(r.papeis).split(",") : [],
      })) as UsuarioCms[];
    });
  },
);

const papelCmsSchema = z.object({
  usuarioId: z.string().uuid(),
  papel: z.enum(["editor_cms", "aprovador_cms"]),
});

export const concederPapelCms = createServerFn({ method: "POST" })
  .validator((d: unknown) => papelCmsSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      const [[alvo]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM usuarios WHERE id = ? AND loja_id = @current_loja_id",
        [data.usuarioId],
      );
      if (!alvo) throw new Error("Usuário não encontrado nesta loja.");
      await conn.query(
        "INSERT IGNORE INTO usuarios_papeis (loja_id, usuario_id, papel) VALUES (?, ?, ?)",
        [lojaId, data.usuarioId, data.papel],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "conceder_papel",
        "usuario",
        data.usuarioId,
        null,
        {
          papel: data.papel,
        },
      );
    });
  });

export const revogarPapelCms = createServerFn({ method: "POST" })
  .validator((d: unknown) => papelCmsSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      await conn.query(
        "DELETE FROM usuarios_papeis WHERE usuario_id = ? AND loja_id = @current_loja_id AND papel = ?",
        [data.usuarioId, data.papel],
      );
      // Revogar editor_cms sem soltar a atribuição deixaria a tela de
      // colunas/páginas mostrando dono de um usuário que não é mais editor —
      // e a coluna ficaria travada sem ninguém poder reatribuí-la a outro
      // sem primeiro adivinhar que precisa limpar isto à mão no banco.
      if (data.papel === "editor_cms") {
        await conn.query(
          "DELETE FROM editor_cms_colunas WHERE usuario_id = ? AND loja_id = @current_loja_id",
          [data.usuarioId],
        );
        await conn.query(
          "DELETE FROM editor_cms_paginas WHERE usuario_id = ? AND loja_id = @current_loja_id",
          [data.usuarioId],
        );
      }
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "revogar_papel",
        "usuario",
        data.usuarioId,
        null,
        {
          papel: data.papel,
        },
      );
    });
  });

const atribuirColunaSchema = z.object({
  colunaId: z.string().uuid(),
  usuarioId: z.string().uuid(),
});

export const atribuirColunaNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => atribuirColunaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      const [[ehEditor]] = await conn.query<RowDataPacket[]>(
        "SELECT 1 FROM usuarios_papeis WHERE usuario_id = ? AND loja_id = @current_loja_id AND papel = 'editor_cms'",
        [data.usuarioId],
      );
      if (!ehEditor) throw new Error("Este usuário precisa ter o papel Editor CMS primeiro.");

      // PRIMARY KEY em coluna_id: reatribuir troca o dono (1 editor por
      // coluna, decisão do usuário na issue #391).
      await conn.query(
        `INSERT INTO editor_cms_colunas (coluna_id, usuario_id, loja_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id)`,
        [data.colunaId, data.usuarioId, lojaId],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atribuir",
        "editor_cms_coluna",
        data.colunaId,
        null,
        { usuario_id: data.usuarioId },
      );
    });
  });

export const desatribuirColunaNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ colunaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      await conn.query(
        "DELETE FROM editor_cms_colunas WHERE coluna_id = ? AND loja_id = @current_loja_id",
        [data.colunaId],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "desatribuir",
        "editor_cms_coluna",
        data.colunaId,
        null,
        null,
      );
    });
  });

const atribuirPaginaSchema = z.object({
  paginaId: z.string().uuid(),
  usuarioId: z.string().uuid(),
});

export type AtribuicaoPagina = {
  pagina_id: string;
  usuario_id: string;
  nome_completo: string | null;
};

/** Mapa página → editor_cms atribuído, pra tela de atribuição cruzar com
 * listarPaginasSite (que já traz título/slug de cada página). */
export const listarAtribuicoesPaginas = createServerFn({ method: "GET" }).handler(
  async (): Promise<AtribuicaoPagina[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT ep.pagina_id, ep.usuario_id, u.nome_completo
         FROM editor_cms_paginas ep
         JOIN usuarios u ON u.id = ep.usuario_id AND u.loja_id = @current_loja_id
         WHERE ep.loja_id = @current_loja_id`,
      );
      return rows as AtribuicaoPagina[];
    });
  },
);

export const atribuirPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => atribuirPaginaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      const [[ehEditor]] = await conn.query<RowDataPacket[]>(
        "SELECT 1 FROM usuarios_papeis WHERE usuario_id = ? AND loja_id = @current_loja_id AND papel = 'editor_cms'",
        [data.usuarioId],
      );
      if (!ehEditor) throw new Error("Este usuário precisa ter o papel Editor CMS primeiro.");

      await conn.query(
        `INSERT INTO editor_cms_paginas (pagina_id, usuario_id, loja_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id)`,
        [data.paginaId, data.usuarioId, lojaId],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atribuir",
        "editor_cms_pagina",
        data.paginaId,
        null,
        { usuario_id: data.usuarioId },
      );
    });
  });

export const desatribuirPaginaSite = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ paginaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      await conn.query(
        "DELETE FROM editor_cms_paginas WHERE pagina_id = ? AND loja_id = @current_loja_id",
        [data.paginaId],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "desatribuir",
        "editor_cms_pagina",
        data.paginaId,
        null,
        null,
      );
    });
  });
