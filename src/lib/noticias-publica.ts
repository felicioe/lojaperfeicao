import type { RowDataPacket } from "mysql2";
import { withLojaConnection } from "./backend/db";
import { sanitizarRichTextPublico } from "./rich-text-server";
import { LOJA_PORTAL_PUBLICO } from "./loja-portal-publico";

export type NoticiaPublica = {
  id: string;
  titulo: string;
  resumo: string | null;
  conteudo: string;
  publicado_em: string;
};

export type NoticiaPublicaResumo = Omit<NoticiaPublica, "conteudo">;

/** Versão leve de carregarNoticiasPublicas(), sem `conteudo` — usada pela
 * listagem pública /noticias (issue #382), que só mostra título/resumo/data;
 * carregar o corpo inteiro (MEDIUMTEXT) de até 100 notícias só pra listá-las
 * inflava a resposta do loader à toa (achado do review automático da PR
 * #386). O endpoint /api/publico/noticias (consumido pelo site externo
 * antigo) continua usando a versão completa abaixo, que ele de fato precisa. */
export async function listarNoticiasPublicasResumo(): Promise<NoticiaPublicaResumo[]> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, titulo, resumo, publicado_em
       FROM noticias
       WHERE loja_id = @current_loja_id AND status = 'publicado'
       ORDER BY publicado_em DESC
       LIMIT 100`,
    );
    return rows.map((row) => ({
      id: row.id,
      titulo: row.titulo,
      resumo: row.resumo,
      publicado_em: row.publicado_em,
    }));
  });
}

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

/** Detalhe de uma notícia publicada — usado pela rota pública /noticias/:id
 * (issue #382). Mesma regra de status das demais: rascunho nunca sai daqui. */
export async function carregarNoticiaPublicaPorId(id: string): Promise<NoticiaPublica | null> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT id, titulo, resumo, conteudo, publicado_em FROM noticias
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND id = ?`,
      [id],
    );
    if (!row) return null;
    return {
      id: row.id,
      titulo: row.titulo,
      resumo: row.resumo,
      conteudo: sanitizarRichTextPublico(row.conteudo),
      publicado_em: row.publicado_em,
    };
  });
}
