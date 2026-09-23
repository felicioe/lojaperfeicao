import type { RowDataPacket } from "mysql2";
import { comSessaoCrua } from "./authz";
import { PODE_VER_CONDICAO } from "./pecas-arquitetura";

// Download autenticado de arquivo pra Documentos (Legislação) e Peças de
// Arquitetura (Biblioteca) — issue #710. Documentos e Peças guardam o PDF
// em base64 numa coluna (arquivo_url, LONGTEXT), sem rota HTTP própria até
// aqui — só Notícias tinha (src/lib/noticias-publica.ts + as rotas
// /api/publico/noticias/:id/imagem|anexo em server.ts), e essa é PÚBLICA
// (sem sessão). Estas duas são diferentes: exigem sessão válida, com a
// MESMA regra de leitura que a tela de origem já usa (comSessaoCrua reusa
// comSessao/checarSessaoEResolverLoja — ver authz.ts).
//
// Servido sob demanda, um arquivo por vez (nunca dentro de uma listagem) —
// mesma lição já registrada em documentos.ts/pecas-arquitetura.ts sobre
// nunca trazer arquivo_url num SELECT de múltiplas linhas.

export type ArquivoBinarioAutenticado = {
  mime: string;
  buffer: Buffer;
  nomeOriginal: string | null;
};

function decodificarDataUrl(dataUrl: unknown): { mime: string; buffer: Buffer } | null {
  if (typeof dataUrl !== "string" || !dataUrl) return null;
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

/** Qualquer Irmão logado — mesma regra de listarDocumentos/obterArquivoDocumento
 * (documentos.ts, comSessao puro, sem checagem de papel). */
export async function carregarArquivoDocumentoAutenticado(
  request: Request,
  id: string,
): Promise<ArquivoBinarioAutenticado | null> {
  return comSessaoCrua(request, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT arquivo_url, arquivo_mime, arquivo_nome_original
         FROM documentos WHERE id = ? AND loja_id = @current_loja_id`,
      [id],
    );
    if (!row) return null;
    const decodificado = decodificarDataUrl(row.arquivo_url);
    if (!decodificado) return null;
    return {
      mime: (row.arquivo_mime as string | null) || decodificado.mime,
      buffer: decodificado.buffer,
      nomeOriginal: (row.arquivo_nome_original as string | null) ?? null,
    };
  });
}

/** Mesma condição PODE_VER_CONDICAO de pecas-arquitetura.ts (grau/situação)
 * — tratamento crítico: nunca vazar peça de grau superior. Peça inexistente
 * OU sem permissão de leitura chegam ao mesmo resultado (null -> 404 em
 * server.ts), pra não revelar a um Irmão de grau inferior que uma peça de
 * grau superior existe. */
export async function carregarArquivoPecaAutenticado(
  request: Request,
  id: string,
): Promise<ArquivoBinarioAutenticado | null> {
  return comSessaoCrua(request, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT pa.arquivo_url, pa.arquivo_mime, pa.arquivo_nome_original
         FROM pecas_arquitetura pa
         JOIN irmaos i ON i.id = pa.autor_id AND i.loja_id = @current_loja_id
        WHERE pa.id = ? AND pa.loja_id = @current_loja_id AND ${PODE_VER_CONDICAO}`,
      [id],
    );
    if (!row) return null;
    const decodificado = decodificarDataUrl(row.arquivo_url);
    if (!decodificado) return null;
    return {
      mime: (row.arquivo_mime as string | null) || decodificado.mime,
      buffer: decodificado.buffer,
      nomeOriginal: (row.arquivo_nome_original as string | null) ?? null,
    };
  });
}
