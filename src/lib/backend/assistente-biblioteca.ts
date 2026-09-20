import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { pontuarRelevancia } from "./assistente-ia-util";
import { PECA_SELECT, PODE_VER_CONDICAO } from "./pecas-arquitetura";

// Achado #657 — mesmo espírito do assistente de Legislação (#648), agora
// pra Biblioteca de Peças (trabalhos de arquitetura apresentados em
// sessão). Reaproveita PECA_SELECT/PODE_VER_CONDICAO de
// pecas-arquitetura.ts — CRÍTICO: uma peça restrita por grau (#222/#224)
// não pode vazar seu conteúdo através do assistente pra quem não teria
// acesso a ela na própria tela da Biblioteca.
//
// Extração de PDF NÃO roda aqui (achado de 504 em produção no assistente
// de Legislação, mesma causa raiz evitada aqui desde o início) — só o que
// já estiver em pecas_arquitetura.texto_extraido é usado; o resto cai no
// resumo manual. Ver extracao-texto-ia.ts pro processamento em lote.
const LIMITE_CARACTERES_POR_PECA = 6000;
const LIMITE_PECAS_CONTEXTO = 6;
// "-latest" (não uma versão fixa): a Google descontinua versões pontuais
// do Gemini sem muito aviso — ver mesmo comentário em
// assistente-legislacao.ts.
const MODELO_GEMINI = "gemini-flash-latest";

type PecaParaAssistente = {
  id: string;
  titulo: string;
  tema: string | null;
  resumo: string | null;
  autor_nome: string;
  texto_extraido: string | null;
};

function textoDisponivel(peca: PecaParaAssistente): string {
  return peca.texto_extraido || peca.resumo || "";
}

const perguntarSchema = z.object({
  pergunta: z.string().trim().min(5, "Descreva melhor sua dúvida.").max(1000),
});

export type RespostaAssistenteBiblioteca = {
  resposta: string;
  fontes: { id: string; titulo: string; autor_nome: string }[];
};

export const perguntarAssistenteBiblioteca = createServerFn({ method: "POST" })
  .validator((d: unknown) => perguntarSchema.parse(d))
  .handler(async ({ data }): Promise<RespostaAssistenteBiblioteca> => {
    return comSessao(async (conn) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Assistente de IA ainda não configurado nesta instalação (falta GEMINI_API_KEY na Hostinger).",
        );
      }

      const [rows] = await conn.query<RowDataPacket[]>(
        `${PECA_SELECT} WHERE pa.loja_id = @current_loja_id AND ${PODE_VER_CONDICAO}
         ORDER BY pa.criado_em DESC`,
      );
      const pecas = rows as PecaParaAssistente[];
      if (pecas.length === 0) {
        return {
          resposta: "Ainda não há peças de arquitetura visíveis para você nesta Loja.",
          fontes: [],
        };
      }

      const candidatas = pecas
        .map((peca) => ({
          peca,
          pontuacao: pontuarRelevancia(
            data.pergunta,
            `${peca.titulo} ${peca.tema ?? ""} ${textoDisponivel(peca)}`,
          ),
        }))
        .sort((a, b) => b.pontuacao - a.pontuacao)
        .slice(0, LIMITE_PECAS_CONTEXTO)
        .map((item) => item.peca);

      const blocos = candidatas.map(
        (peca) =>
          `### ${peca.titulo} — por ${peca.autor_nome} (id: ${peca.id})\n${textoDisponivel(peca).slice(0, LIMITE_CARACTERES_POR_PECA)}`,
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
                  text: `Pergunta do irmão: ${data.pergunta}\n\nPeças de arquitetura disponíveis (use apenas estas):\n\n${blocos.join("\n\n")}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction:
              "Você é um assistente que ajuda irmãos maçons a encontrar e entender peças de " +
              "arquitetura (trabalhos apresentados em sessão) já cadastradas na Biblioteca desta " +
              "Loja. Responda SOMENTE com base no conteúdo das peças fornecidas abaixo — nunca " +
              "invente conteúdo que não esteja nelas. Sempre cite o título exato da peça e o autor. " +
              "Isto não é legislação nem norma — é o conteúdo de trabalhos apresentados por irmãos, " +
              "não uma fonte normativa. Se a resposta não estiver nas peças fornecidas, diga " +
              "claramente que não encontrou base nas peças cadastradas. Responda em português do " +
              "Brasil, de forma objetiva e direta.",
          },
        });
      } catch (err) {
        console.error("[assistente-biblioteca] falha ao chamar a API do Gemini:", err);
        throw new Error("Não foi possível consultar o assistente de IA agora. Tente novamente.");
      }

      const texto = resposta.text?.trim();
      if (!texto) throw new Error("O assistente não retornou uma resposta. Tente novamente.");

      const fontes = candidatas
        .filter((peca) => texto.includes(peca.titulo))
        .map((peca) => ({ id: peca.id, titulo: peca.titulo, autor_nome: peca.autor_nome }));

      return { resposta: texto, fontes };
    });
  });
