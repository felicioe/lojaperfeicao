import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { comSessao } from "./authz";
import { carregarPdfParse } from "./importacao-pdf-sessoes";

// Achado #648 — assistente de IA que responde dúvidas de irmãos citando a
// Legislação já cadastrada (pasta "legislacao"/"legislacao:<ano>" em
// documentos.ts), em vez de decorativo. Provedor: Google Gemini (decisão do
// usuário — GEMINI_API_KEY na Hostinger), não Anthropic.
//
// Sem embeddings/busca vetorial: pré-filtro por contagem de termos da
// pergunta no título/resumo (barato, sem IA) escolhe os candidatos mais
// prováveis antes de extrair/enviar qualquer PDF — evita extrair o acervo
// inteiro e mandar tudo pro modelo a cada pergunta.
const LIMITE_CARACTERES_POR_DOCUMENTO = 6000;
const LIMITE_DOCUMENTOS_CONTEXTO = 6;
const MODELO_GEMINI = "gemini-2.5-flash";

type DocumentoLegislacao = {
  id: string;
  titulo: string;
  conteudo: string;
  arquivo_url: string | null;
  texto_extraido: string | null;
};

function normalizar(texto: string): string {
  return texto.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function pontuarRelevancia(pergunta: string, texto: string): number {
  const termos = normalizar(pergunta)
    .split(/\W+/)
    .filter((termo) => termo.length > 2);
  const textoNormalizado = normalizar(texto);
  return termos.reduce((soma, termo) => soma + (textoNormalizado.includes(termo) ? 1 : 0), 0);
}

// Extrai o texto do PDF (base64 embutido em arquivo_url) e cacheia em
// documentos.texto_extraido (migração 0155). PDF escaneado sem texto,
// corrompido, ou sem arquivo algum: cai de volta no resumo manual
// (documentos.conteudo) — nunca falha a pergunta inteira por causa de um
// único documento problemático.
async function obterTextoDocumento(
  conn: PoolConnection,
  documento: DocumentoLegislacao,
): Promise<string> {
  if (documento.texto_extraido) return documento.texto_extraido;
  if (!documento.arquivo_url) return documento.conteudo;
  try {
    const base64 = documento.arquivo_url.split(",")[1];
    if (!base64) return documento.conteudo;
    const bytes = Buffer.from(base64, "base64");
    const PDFParse = await carregarPdfParse();
    const parser = new PDFParse({ data: bytes });
    const resultado = await parser.getText();
    const texto = resultado.text.slice(0, 200_000);
    if (texto.trim()) {
      await conn.query(
        "UPDATE documentos SET texto_extraido = ? WHERE id = ? AND loja_id = @current_loja_id",
        [texto, documento.id],
      );
    }
    return texto.trim() || documento.conteudo;
  } catch {
    return documento.conteudo;
  }
}

const perguntarSchema = z.object({
  pergunta: z.string().trim().min(5, "Descreva melhor sua dúvida.").max(1000),
});

export type RespostaAssistenteLegislacao = {
  resposta: string;
  fontes: { id: string; titulo: string }[];
};

export const perguntarAssistenteLegislacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => perguntarSchema.parse(d))
  .handler(async ({ data }): Promise<RespostaAssistenteLegislacao> => {
    return comSessao(async (conn) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Assistente de IA ainda não configurado nesta instalação (falta GEMINI_API_KEY na Hostinger).",
        );
      }

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, titulo, conteudo, arquivo_url, texto_extraido FROM documentos
         WHERE loja_id = @current_loja_id
           AND (categoria = 'legislacao' OR categoria LIKE 'legislacao:%')`,
      );
      const documentos = rows as DocumentoLegislacao[];
      if (documentos.length === 0) {
        return {
          resposta: "Ainda não há documentos cadastrados na pasta Legislação desta Loja.",
          fontes: [],
        };
      }

      const candidatos = documentos
        .map((documento) => ({
          documento,
          pontuacao: pontuarRelevancia(data.pergunta, `${documento.titulo} ${documento.conteudo}`),
        }))
        .sort((a, b) => b.pontuacao - a.pontuacao)
        .slice(0, LIMITE_DOCUMENTOS_CONTEXTO)
        .map((item) => item.documento);

      const blocos = await Promise.all(
        candidatos.map(async (documento) => {
          const texto = await obterTextoDocumento(conn, documento);
          return `### ${documento.titulo} (id: ${documento.id})\n${texto.slice(0, LIMITE_CARACTERES_POR_DOCUMENTO)}`;
        }),
      );

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      let resposta;
      try {
        resposta = await ai.models.generateContent({
          model: MODELO_GEMINI,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Pergunta do irmão: ${data.pergunta}\n\nDocumentos disponíveis (use apenas estes):\n\n${blocos.join("\n\n")}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction:
              "Você é um assistente que responde dúvidas de irmãos maçons sobre a legislação e os " +
              "regulamentos cadastrados nesta Loja. Responda SOMENTE com base nos documentos fornecidos " +
              "abaixo — nunca invente artigo, número ou conteúdo normativo. Sempre cite o título exato do " +
              "documento usado. Se a resposta não estiver nos documentos fornecidos, diga claramente que " +
              "não encontrou base na legislação cadastrada e recomende consultar a Secretaria ou a " +
              "Diretoria da Loja. Responda em português do Brasil, de forma objetiva e direta.",
          },
        });
      } catch {
        throw new Error("Não foi possível consultar o assistente de IA agora. Tente novamente.");
      }

      const texto = resposta.text?.trim();
      if (!texto) throw new Error("O assistente não retornou uma resposta. Tente novamente.");

      const fontes = candidatos
        .filter((documento) => texto.includes(documento.titulo))
        .map((documento) => ({ id: documento.id, titulo: documento.titulo }));

      return { resposta: texto, fontes };
    });
  });
