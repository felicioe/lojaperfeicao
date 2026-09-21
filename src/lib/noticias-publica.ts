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

// achado #662 — imagem/anexo só entram no detalhe de UMA notícia (esta
// consulta busca uma linha só, é seguro trazer junto); a listagem/resumo
// acima NÃO traz isso, mesma lição do achado #655 (arquivo binário nunca
// numa lista de várias linhas).
export type NoticiaPublicaDetalhe = NoticiaPublica & {
  imagem_capa_url: string | null;
  anexo_url: string | null;
  anexo_nome_original: string | null;
  anexo_mime: string | null;
};

// Filtro de títulos placeholder aplicado no próprio SQL (WHERE), não depois de
// carregar as linhas: aplicar em JS depois do LIMIT 100 fazia notícias-teste
// ocuparem vaga no topo do corte e sumirem notícias reais mais antigas da
// listagem (achado do review automático).
const CONDICAO_TITULO_APTO = `LOWER(TRIM(titulo)) NOT IN ('teste', 'test')`;

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
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND ${CONDICAO_TITULO_APTO}
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
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND ${CONDICAO_TITULO_APTO}
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
export async function carregarNoticiaPublicaPorId(
  id: string,
): Promise<NoticiaPublicaDetalhe | null> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT id, titulo, resumo, conteudo, publicado_em,
              imagem_capa_url, anexo_url, anexo_nome_original, anexo_mime
       FROM noticias
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND id = ? AND ${CONDICAO_TITULO_APTO}`,
      [id],
    );
    if (!row) return null;
    return {
      id: row.id,
      titulo: row.titulo,
      resumo: row.resumo,
      conteudo: sanitizarRichTextPublico(row.conteudo),
      publicado_em: row.publicado_em,
      imagem_capa_url: row.imagem_capa_url || null,
      anexo_url: row.anexo_url || null,
      anexo_nome_original: row.anexo_nome_original,
      anexo_mime: row.anexo_mime,
    };
  });
}
