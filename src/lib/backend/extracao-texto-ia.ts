import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { comPapel } from "./authz";
import { carregarPdfParse } from "./importacao-pdf-sessoes";
import { listarLojasAtivas, withLojaConnection } from "./db";

// Achado (504 em produção, #648/#657): a extração de texto de PDF com
// pdf-parse rodava SÍNCRONA dentro da própria pergunta ao assistente de
// IA — com muitos documentos grandes ainda sem cache, a requisição
// passava do tempo de espera do proxy da Hostinger antes do Node
// terminar de responder. A extração agora só roda aqui, em lotes
// pequenos, fora do caminho crítico da pergunta:
// - via cron (executarExtracaoTextoIA, chamado por /api/cron/extrair-textos-ia)
// - ou sob demanda por um admin/secretário (prepararTextosAssistentesIA,
//   botão "Preparar documentos para o assistente" nas telas de Legislação
//   e Biblioteca de Peças).
// Cada chamada processa um lote pequeno o bastante pra nunca se aproximar
// do timeout do proxy, mesmo que o PDF seja grande.
const LIMITE_POR_FONTE_POR_CHAMADA = 8;

export type ResultadoLoteExtracao = {
  documentosProcessados: number;
  pecasProcessadas: number;
  documentosRestantes: number;
  pecasRestantes: number;
};

async function extrairEGravar(
  conn: PoolConnection,
  tabela: "documentos" | "pecas_arquitetura",
  id: string,
  arquivoUrl: string,
): Promise<boolean> {
  try {
    const base64 = arquivoUrl.split(",")[1];
    if (!base64) return false;
    const bytes = Buffer.from(base64, "base64");
    const PDFParse = await carregarPdfParse();
    const parser = new PDFParse({ data: bytes });
    const resultado = await parser.getText();
    const texto = resultado.text.slice(0, 200_000).trim();
    if (!texto) return false;
    // Nomes de tabela vêm só desta lista fixa (nunca de entrada externa) —
    // interpolação direta é segura aqui, não é dado de usuário.
    await conn.query(
      `UPDATE ${tabela} SET texto_extraido = ? WHERE id = ? AND loja_id = @current_loja_id`,
      [texto, id],
    );
    return true;
  } catch {
    return false;
  }
}

export async function processarLoteExtracaoTextoIA(
  conn: PoolConnection,
): Promise<ResultadoLoteExtracao> {
  const [docsPendentes] = await conn.query<RowDataPacket[]>(
    `SELECT id, arquivo_url FROM documentos
     WHERE loja_id = @current_loja_id
       AND (categoria = 'legislacao' OR categoria LIKE 'legislacao:%')
       AND arquivo_url IS NOT NULL AND arquivo_url <> ''
       AND texto_extraido IS NULL
     LIMIT ?`,
    [LIMITE_POR_FONTE_POR_CHAMADA],
  );
  let documentosProcessados = 0;
  for (const doc of docsPendentes) {
    if (await extrairEGravar(conn, "documentos", doc.id as string, doc.arquivo_url as string)) {
      documentosProcessados++;
    }
  }

  const [pecasPendentes] = await conn.query<RowDataPacket[]>(
    `SELECT id, arquivo_url FROM pecas_arquitetura
     WHERE loja_id = @current_loja_id
       AND arquivo_url IS NOT NULL AND arquivo_url <> ''
       AND texto_extraido IS NULL
     LIMIT ?`,
    [LIMITE_POR_FONTE_POR_CHAMADA],
  );
  let pecasProcessadas = 0;
  for (const peca of pecasPendentes) {
    if (
      await extrairEGravar(conn, "pecas_arquitetura", peca.id as string, peca.arquivo_url as string)
    ) {
      pecasProcessadas++;
    }
  }

  const [[restoDocs]] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM documentos
     WHERE loja_id = @current_loja_id
       AND (categoria = 'legislacao' OR categoria LIKE 'legislacao:%')
       AND arquivo_url IS NOT NULL AND arquivo_url <> '' AND texto_extraido IS NULL`,
  );
  const [[restoPecas]] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM pecas_arquitetura
     WHERE loja_id = @current_loja_id
       AND arquivo_url IS NOT NULL AND arquivo_url <> '' AND texto_extraido IS NULL`,
  );

  return {
    documentosProcessados,
    pecasProcessadas,
    documentosRestantes: Number(restoDocs.total),
    pecasRestantes: Number(restoPecas.total),
  };
}

// Chamado pelo admin/secretário na tela (botão "Preparar documentos para o
// assistente") — processa um lote pequeno da PRÓPRIA loja por vez; o
// front-end chama de novo em sequência até não sobrar nada, mostrando
// progresso (nunca um único request gigante).
export const prepararTextosAssistentesIA = createServerFn({ method: "POST" }).handler(
  async (): Promise<ResultadoLoteExtracao> => {
    return comPapel(["admin", "secretario"], async (conn) => processarLoteExtracaoTextoIA(conn));
  },
);

export type ResultadoExtracaoLoja = ResultadoLoteExtracao & { lojaId: string; lojaSlug: string };

// Chamado pelo endpoint HTTP /api/cron/extrair-textos-ia — itera todas as
// lojas ativas (mesmo padrão de push-dispatch.ts), processando um lote
// pequeno de cada uma a cada disparo do cron. Um erro numa loja não
// derruba o processamento das demais.
export async function executarExtracaoTextoIA(): Promise<{ porLoja: ResultadoExtracaoLoja[] }> {
  const lojas = await listarLojasAtivas();
  const porLoja: ResultadoExtracaoLoja[] = [];
  for (const loja of lojas) {
    try {
      const resultado = await withLojaConnection(loja.id, (conn) =>
        processarLoteExtracaoTextoIA(conn),
      );
      porLoja.push({ lojaId: loja.id, lojaSlug: loja.slug, ...resultado });
    } catch (err) {
      console.error(`[cron:extrair-textos-ia] falha ao processar loja ${loja.slug}:`, err);
      porLoja.push({
        lojaId: loja.id,
        lojaSlug: loja.slug,
        documentosProcessados: 0,
        pecasProcessadas: 0,
        documentosRestantes: -1,
        pecasRestantes: -1,
      });
    }
  }
  return { porLoja };
}
