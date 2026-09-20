import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { pontuarRelevancia } from "./assistente-ia-util";

// Achado #648 — assistente de IA que responde dúvidas de irmãos citando os
// documentos já cadastrados no repositório (documentos.ts), em vez de
// decorativo. Provedor: Google Gemini (decisão do usuário — GEMINI_API_KEY
// na Hostinger), não Anthropic.
//
// Escopo ampliado (pedido do usuário após o merge de #648): pesquisa TODAS
// as pastas do repositório (Legislação, Documentos da Loja, Tratados,
// Ensino, Documentos Históricos, Rituais Antigos, Formulários, Tabela de
// Valores, História do Rito) — não só "legislacao" — daí o pré-filtro por
// termos abaixo rodar sobre o acervo inteiro da loja, sem filtro de
// categoria no SQL.
const LIMITE_CARACTERES_POR_DOCUMENTO = 6000;
const LIMITE_DOCUMENTOS_CONTEXTO = 6;
// "-latest" (não uma versão fixa tipo "gemini-2.5-flash"): a Google
// descontinua versões pontuais do Gemini sem muito aviso — usar o alias
// "latest" evita quebrar o assistente cada vez que isso acontecer.
const MODELO_GEMINI = "gemini-flash-latest";

type DocumentoParaAssistente = {
  id: string;
  titulo: string;
  conteudo: string;
  texto_extraido: string | null;
};

// achado (504 em produção): a extração de PDF com pdf-parse rodava
// SÍNCRONA dentro desta mesma requisição na primeira pergunta que usasse
// cada documento — com vários PDFs grandes ainda sem cache, isso passava
// do tempo de espera do proxy da Hostinger antes do Node responder.
// Extração agora só acontece em lote, fora do caminho da pergunta (ver
// extracao-texto-ia.ts, cron/admin) — aqui só lê o que já está em cache;
// documento ainda não processado usa o resumo manual (conteudo) mesmo.
function textoDisponivel(documento: DocumentoParaAssistente): string {
  return documento.texto_extraido || documento.conteudo;
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
        `SELECT id, titulo, conteudo, texto_extraido FROM documentos
         WHERE loja_id = @current_loja_id`,
      );
      const documentos = rows as DocumentoParaAssistente[];
      if (documentos.length === 0) {
        return {
          resposta: "Ainda não há documentos cadastrados no repositório desta Loja.",
          fontes: [],
        };
      }

      const candidatos = documentos
        .map((documento) => ({
          documento,
          pontuacao: pontuarRelevancia(
            data.pergunta,
            `${documento.titulo} ${textoDisponivel(documento)}`,
          ),
        }))
        .sort((a, b) => b.pontuacao - a.pontuacao)
        .slice(0, LIMITE_DOCUMENTOS_CONTEXTO)
        .map((item) => item.documento);

      const blocos = candidatos.map(
        (documento) =>
          `### ${documento.titulo} (id: ${documento.id})\n${textoDisponivel(documento).slice(0, LIMITE_CARACTERES_POR_DOCUMENTO)}`,
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
              "Você é um assistente que responde dúvidas de irmãos maçons com base no repositório de " +
              "documentos desta Loja — legislação e regulamentos, mas também documentos administrativos, " +
              "tratados, material de ensino, documentos históricos, rituais antigos, formulários e " +
              "tabelas de valores, conforme o que for fornecido abaixo. Responda SOMENTE com base nos " +
              "documentos fornecidos — nunca invente artigo, número ou conteúdo normativo. Sempre cite o " +
              "título exato do documento usado e, quando fizer diferença pra resposta, diga de qual pasta " +
              "ele é (ex.: Legislação, Documentos da Loja). Se a resposta não estiver nos documentos " +
              "fornecidos, diga claramente que não encontrou base no repositório cadastrado e recomende " +
              "consultar a Secretaria ou a Diretoria da Loja. Responda em português do Brasil, de forma " +
              "objetiva e direta.",
          },
        });
      } catch (err) {
        console.error("[assistente-legislacao] falha ao chamar a API do Gemini:", err);
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
