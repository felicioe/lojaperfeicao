import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import { comSessao } from "./authz";
import { papeisEditorialCms, colunasDoEditor } from "./cms-editorial-authz";

// Comentários em notícias publicadas (issue #664) — "como se fosse um blog",
// só pra Irmãos autenticados (não aparece pro visitante anônimo do site
// institucional, mesmo critério já usado pro botão de baixar imagem em
// noticias/$id.tsx). Decisões adotadas (issue tinha 3 perguntas em aberto):
//   1. Quem comenta: qualquer irmão com usuário vinculado (mesmo critério
//      de enquetes.ts — não filtra por `situacao`, só exige o vínculo).
//   2. Moderação reativa: comentário aparece na hora, editor/super_admin
//      oculta depois se for o caso (não fica pendente de aprovação prévia).
//   3. Notificação de novo comentário: fora de escopo nesta v1 — não foi
//      pedido explicitamente e puxaria e-mail/push por comentário, que é
//      uma escolha de produto própria (quem é avisado, com que frequência).

export type ComentarioNoticia = {
  id: string;
  autorId: string;
  autorNome: string | null;
  texto: string;
  status: "visivel" | "oculto";
  criadoEm: string;
};

const idNoticiaSchema = z.object({ noticiaId: z.string().uuid() });

/** Lista os comentários de UMA notícia publicada + se quem pergunta pode
 * moderar (super_admin sempre; editor_cms só se a notícia for de uma
 * coluna atribuída a ele). Quem não pode moderar nunca recebe os
 * comentários com status 'oculto' — eles não voltam a existir pro
 * visitante comum depois de ocultados. */
export const listarComentariosNoticia = createServerFn({ method: "GET" })
  .validator((d: unknown) => idNoticiaSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [[noticia]] = await conn.query<RowDataPacket[]>(
        "SELECT coluna_id, status FROM noticias WHERE id = ? AND loja_id = ?",
        [data.noticiaId, lojaId],
      );
      if (!noticia || noticia.status !== "publicado") {
        throw new Error("Notícia não encontrada.");
      }

      const papeis = await papeisEditorialCms(conn, usuarioId);
      let podeModerar = papeis.superAdmin;
      if (!podeModerar && papeis.editor) {
        const colunas = await colunasDoEditor(conn, usuarioId);
        podeModerar = !!noticia.coluna_id && colunas.includes(noticia.coluna_id as string);
      }

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.autor_id, i.nome_civil AS autor_nome, c.texto, c.status, c.criado_em
         FROM noticias_comentarios c
         JOIN irmaos i ON i.id = c.autor_id AND i.loja_id = c.loja_id
         WHERE c.noticia_id = ? AND c.loja_id = ? ${podeModerar ? "" : "AND c.status = 'visivel'"}
         ORDER BY c.criado_em ASC`,
        [data.noticiaId, lojaId],
      );

      return {
        podeModerar,
        comentarios: rows.map((r) => ({
          id: r.id as string,
          autorId: r.autor_id as string,
          autorNome: r.autor_nome as string | null,
          texto: r.texto as string,
          status: r.status as "visivel" | "oculto",
          criadoEm: r.criado_em as string,
        })) satisfies ComentarioNoticia[],
      };
    });
  });

const criarComentarioSchema = z.object({
  noticiaId: z.string().uuid(),
  texto: z.string().min(1).max(2000),
});

export const criarComentarioNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarComentarioSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [[meuIrmao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = ?",
        [usuarioId, lojaId],
      );
      if (!meuIrmao) {
        throw new Error("Seu usuário ainda não está vinculado a um cadastro de irmão.");
      }

      const [[noticia]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM noticias WHERE id = ? AND loja_id = ? AND status = 'publicado'",
        [data.noticiaId, lojaId],
      );
      if (!noticia) throw new Error("Notícia não encontrada.");

      const id = randomUUID();
      await conn.query(
        `INSERT INTO noticias_comentarios (id, loja_id, noticia_id, autor_id, texto)
         VALUES (?, ?, ?, ?, ?)`,
        [id, lojaId, data.noticiaId, meuIrmao.id, data.texto.trim()],
      );
      return { id };
    });
  });

const moderarComentarioSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["visivel", "oculto"]),
});

export const moderarComentarioNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => moderarComentarioSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [[comentario]] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.status, c.texto, n.coluna_id
         FROM noticias_comentarios c
         JOIN noticias n ON n.id = c.noticia_id AND n.loja_id = c.loja_id
         WHERE c.id = ? AND c.loja_id = ?`,
        [data.id, lojaId],
      );
      if (!comentario) throw new Error("Comentário não encontrado.");

      const papeis = await papeisEditorialCms(conn, usuarioId);
      let podeModerar = papeis.superAdmin;
      if (!podeModerar && papeis.editor) {
        const colunas = await colunasDoEditor(conn, usuarioId);
        podeModerar = !!comentario.coluna_id && colunas.includes(comentario.coluna_id as string);
      }
      if (!podeModerar) {
        throw new Error("Você não tem permissão para moderar comentários desta notícia.");
      }

      await conn.query(
        "UPDATE noticias_comentarios SET status = ?, moderado_por = ? WHERE id = ? AND loja_id = ?",
        [data.status, usuarioId, data.id, lojaId],
      );
      await registrarAuditoria(
        conn,
        usuarioId,
        data.status === "oculto" ? "ocultar" : "reexibir",
        "comentario_noticia",
        data.id,
        { status: comentario.status, texto: comentario.texto },
        { status: data.status },
      );
    });
  });
