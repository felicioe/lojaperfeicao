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

// achado #676 (auditoria de performance mobile) — imagem/anexo NÃO entram
// mais no detalhe da notícia como data: URL embutida no HTML/loader da
// página: uma imagem de até 8MB (ou anexo de até 30MB) vira ~33% maior em
// base64 e, sem compressão dinâmica do SSR (achado confirmado — ver PR da
// issue #676), esse peso ia inteiro, sem compressão, em toda visita/
// compartilhamento da página. Agora só um booleano ("tem_imagem_capa"/
// "tem_anexo", mesma lição do achado #655/#662 — nunca trazer o binário
// numa resposta que não seja sob demanda) e o conteúdo real é servido por
// rota própria (/api/publico/noticias/:id/imagem|anexo, em server.ts), com
// Cache-Control e sem duplicar o payload da página.
export type NoticiaPublicaDetalhe = NoticiaPublica & {
  temImagemCapa: boolean;
  temAnexo: boolean;
  anexoNomeOriginal: string | null;
};

const MIME_IMAGEM_PUBLICA = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/;
const MIME_ANEXO_PUBLICO = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,(.+)$/;

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
      `SELECT id, titulo, resumo, conteudo, publicado_em, anexo_nome_original,
              (imagem_capa_url IS NOT NULL AND imagem_capa_url <> '') AS tem_imagem_capa,
              (anexo_url IS NOT NULL AND anexo_url <> '') AS tem_anexo
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
      temImagemCapa: !!row.tem_imagem_capa,
      temAnexo: !!row.tem_anexo,
      anexoNomeOriginal: row.anexo_nome_original,
    };
  });
}

/** Conteúdo binário da imagem de capa, sob demanda — servido por
 * /api/publico/noticias/:id/imagem (server.ts). Mesmo raciocínio de
 * obterImagemEAnexoNoticia (noticias.ts): busca de UMA linha só, nunca
 * numa lista. */
export async function carregarImagemCapaNoticiaPublica(
  id: string,
): Promise<{ mime: string; buffer: Buffer } | null> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT imagem_capa_url FROM noticias
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND id = ?`,
      [id],
    );
    const dataUrl = row?.imagem_capa_url as string | undefined;
    if (!dataUrl) return null;
    const match = MIME_IMAGEM_PUBLICA.exec(dataUrl);
    if (!match) return null;
    return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
  });
}

/** Conteúdo binário do anexo (PDF ou imagem), sob demanda — servido por
 * /api/publico/noticias/:id/anexo (server.ts). */
export async function carregarAnexoNoticiaPublica(
  id: string,
): Promise<{ mime: string; buffer: Buffer; nomeOriginal: string | null } | null> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT anexo_url, anexo_nome_original FROM noticias
       WHERE loja_id = @current_loja_id AND status = 'publicado' AND id = ?`,
      [id],
    );
    const dataUrl = row?.anexo_url as string | undefined;
    if (!dataUrl) return null;
    const match = MIME_ANEXO_PUBLICO.exec(dataUrl);
    if (!match) return null;
    return {
      mime: match[1],
      buffer: Buffer.from(match[2], "base64"),
      nomeOriginal: (row?.anexo_nome_original as string | null) ?? null,
    };
  });
}
