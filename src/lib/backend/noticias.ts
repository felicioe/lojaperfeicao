import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import {
  comPapelEditorialCms,
  papeisEditorialCms,
  colunasDoEditor,
  type PapeisEditorialCms,
} from "./cms-editorial-authz";

// CMS de notícias/publicações do site institucional (issue #366, ampliado
// pela #391 com colunas e fluxo de aprovação). super_admin continua com
// acesso irrestrito; editor_cms só enxerga/edita a própria coluna e nunca
// publica direto; aprovador_cms enxerga tudo mas só aprova ou rejeita.

export type Noticia = {
  id: string;
  titulo: string;
  resumo: string | null;
  conteudo: string;
  coluna_id: string | null;
  coluna_nome: string | null;
  status: "rascunho" | "aguardando_aprovacao" | "publicado";
  motivo_rejeicao: string | null;
  publicado_em: string | null;
  autor_id: string;
  autor_nome: string | null;
  criado_em: string;
  atualizado_em: string;
};

async function exigirColunaPropria(
  conn: PoolConnection,
  usuarioId: string,
  colunaId: string | null,
): Promise<void> {
  if (!colunaId) throw new Error("Escolha uma coluna — editor_cms não pode publicar sem coluna.");
  const colunas = await colunasDoEditor(conn, usuarioId);
  if (!colunas.includes(colunaId)) {
    throw new Error("Você só pode escrever na(s) coluna(s) atribuída(s) a você.");
  }
}

export type ColunaDisponivel = { id: string; nome: string };

/** Colunas que o autor logado pode escolher ao escrever uma notícia —
 * super_admin/aprovador_cms veem todas, editor_cms só as próprias. Gerir a
 * coluna em si (criar/renomear/excluir/atribuir dono) é exclusivo de
 * super_admin, em cms-editorial.ts; isto aqui é só o combo do formulário. */
export const listarColunasDisponiveis = createServerFn({ method: "GET" }).handler(
  async (): Promise<ColunaDisponivel[]> => {
    return comPapelEditorialCms(async (conn, usuarioId) => {
      const papeis = await papeisEditorialCms(conn, usuarioId);
      if (papeis.superAdmin || papeis.aprovador) {
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT id, nome FROM noticias_colunas WHERE loja_id = @current_loja_id ORDER BY nome",
        );
        return rows as ColunaDisponivel[];
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.nome FROM noticias_colunas c
         JOIN editor_cms_colunas ec ON ec.coluna_id = c.id AND ec.usuario_id = ?
         WHERE c.loja_id = @current_loja_id ORDER BY c.nome`,
        [usuarioId],
      );
      return rows as ColunaDisponivel[];
    });
  },
);

export const listarNoticias = createServerFn({ method: "GET" }).handler(
  async (): Promise<Noticia[]> => {
    return comPapelEditorialCms(async (conn, usuarioId) => {
      const papeis = await papeisEditorialCms(conn, usuarioId);
      const somenteColunaPropria = !papeis.superAdmin && !papeis.aprovador;
      const filtroColuna = somenteColunaPropria
        ? "AND n.coluna_id IN (SELECT coluna_id FROM editor_cms_colunas WHERE usuario_id = ?)"
        : "";
      const params = somenteColunaPropria ? [usuarioId] : [];
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT n.id, n.titulo, n.resumo, n.conteudo, n.coluna_id, c.nome AS coluna_nome,
                n.status, n.motivo_rejeicao, n.publicado_em,
                n.autor_id, u.email AS autor_nome, n.criado_em, n.atualizado_em
         FROM noticias n
         LEFT JOIN usuarios u ON u.id = n.autor_id AND u.loja_id = @current_loja_id
         LEFT JOIN noticias_colunas c ON c.id = n.coluna_id
         WHERE n.loja_id = @current_loja_id ${filtroColuna}
         ORDER BY n.criado_em DESC`,
        params,
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
  colunaId: z.string().uuid().nullable(),
});

async function exigirRascunhoProprio(
  conn: PoolConnection,
  usuarioId: string,
  id: string,
  papeis: PapeisEditorialCms,
): Promise<void> {
  if (papeis.superAdmin) return;
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT coluna_id, status FROM noticias WHERE id = ? AND loja_id = @current_loja_id",
    [id],
  );
  if (!row) throw new Error("Notícia não encontrada.");
  const colunas = await colunasDoEditor(conn, usuarioId);
  if (!row.coluna_id || !colunas.includes(row.coluna_id)) {
    throw new Error("Você só pode mexer na(s) coluna(s) atribuída(s) a você.");
  }
  if (row.status !== "rascunho") {
    throw new Error(
      "Esta notícia já foi enviada para aprovação ou publicada — só dá pra editar rascunho.",
    );
  }
}

export const salvarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => noticiaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual, lojaId) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (papeis.aprovador && !papeis.superAdmin) {
        throw new Error("aprovador_cms só aprova ou rejeita — não edita conteúdo.");
      }
      const editorRestrito = !papeis.superAdmin;

      if (data.id) {
        if (editorRestrito) await exigirRascunhoProprio(conn, usuarioIdAtual, data.id, papeis);
        if (editorRestrito) await exigirColunaPropria(conn, usuarioIdAtual, data.colunaId);
        await conn.query(
          `UPDATE noticias SET titulo=?, resumo=?, conteudo=?, coluna_id=?, motivo_rejeicao=NULL
           WHERE id=? AND loja_id = @current_loja_id`,
          [data.titulo, data.resumo, data.conteudo, data.colunaId, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "noticia", data.id, null, {
          ...data,
        });
      } else {
        if (editorRestrito) await exigirColunaPropria(conn, usuarioIdAtual, data.colunaId);
        await conn.query(
          `INSERT INTO noticias (loja_id, titulo, resumo, conteudo, coluna_id, autor_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [lojaId, data.titulo, data.resumo, data.conteudo, data.colunaId, usuarioIdAtual],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "noticia", null, null, {
          ...data,
        });
      }
    });
  });

const idSchema = z.object({ id: z.string().uuid() });

/** super_admin publica/despublica direto, sem passar por aprovação — o
 * estado 'aguardando_aprovacao' é só pra quem não é super_admin. */
export const definirStatusNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["rascunho", "publicado"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) {
        throw new Error("Só o super administrador publica ou despublica direto, sem aprovação.");
      }
      // publicado_em só é carimbado na PRIMEIRA publicação — despublicar e
      // publicar de novo não deve fingir que a notícia é mais nova do que é.
      await conn.query(
        `UPDATE noticias
         SET status = ?, motivo_rejeicao = NULL,
             publicado_em = IF(? = 'publicado' AND publicado_em IS NULL, NOW(), publicado_em)
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

/** editor_cms manda o próprio rascunho pra revisão — não publica, só tira do
 * rascunho e põe na fila de quem aprova. */
export const enviarNoticiaParaAprovacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) await exigirRascunhoProprio(conn, usuarioIdAtual, data.id, papeis);
      await conn.query(
        "UPDATE noticias SET status = 'aguardando_aprovacao', motivo_rejeicao = NULL WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "enviar_para_aprovacao",
        "noticia",
        data.id,
        null,
        null,
      );
    });
  });

async function exigirAguardandoAprovacao(conn: PoolConnection, id: string): Promise<void> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT status FROM noticias WHERE id = ? AND loja_id = @current_loja_id",
    [id],
  );
  if (!row) throw new Error("Notícia não encontrada.");
  if (row.status !== "aguardando_aprovacao") {
    throw new Error("Esta notícia não está aguardando aprovação.");
  }
}

export const aprovarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin && !papeis.aprovador) {
        throw new Error("Só super_admin ou aprovador_cms aprovam notícia.");
      }
      await exigirAguardandoAprovacao(conn, data.id);
      await conn.query(
        `UPDATE noticias
         SET status = 'publicado', motivo_rejeicao = NULL,
             publicado_em = IF(publicado_em IS NULL, NOW(), publicado_em)
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.id],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "aprovar", "noticia", data.id, null, null);
    });
  });

const rejeitarSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(1).max(500),
});

export const rejeitarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => rejeitarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin && !papeis.aprovador) {
        throw new Error("Só super_admin ou aprovador_cms rejeitam notícia.");
      }
      await exigirAguardandoAprovacao(conn, data.id);
      await conn.query(
        "UPDATE noticias SET status = 'rascunho', motivo_rejeicao = ? WHERE id = ? AND loja_id = @current_loja_id",
        [data.motivo, data.id],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "rejeitar", "noticia", data.id, null, {
        motivo: data.motivo,
      });
    });
  });

export const excluirNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) {
        if (papeis.aprovador) throw new Error("aprovador_cms não exclui notícia.");
        await exigirRascunhoProprio(conn, usuarioIdAtual, data.id, papeis);
      }
      await conn.query("DELETE FROM noticias WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "noticia", data.id, null, null);
    });
  });
