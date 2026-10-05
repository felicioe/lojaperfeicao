import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Conferência de saldo por PDF (issue #720) — a Conciliação Bancária hoje só
// confere o extrato OFX linha a linha. Várias contas (aplicações/RDC, Conta
// Capital na Sicoob) não têm exportação OFX, só PDF — e o PDF deles não traz
// lançamento nenhum, só o saldo numa data. Por isso este fluxo é
// deliberadamente mais simples que o OFX: lê o saldo do PDF, calcula o saldo
// que o sistema tem pra mesma data e mostra a diferença — sem tentar
// vincular/baixar nada.
const PAPEIS = ["admin", "tesoureiro"];

export type SaldoExtraidoPdf = { data: string; saldo: number };

// Achado (testado com os PDFs reais do usuário): os extratos da Sicoob
// (apropriação diária e Conta Capital) são impressos por uma impressora
// virtual (Foxit) direto no internet banking — não têm camada de texto
// nenhuma, só a imagem da página. O `pdf-parse`/pdfjs (usado no resto do
// projeto, ex.: importacao-pdf-sessoes.ts) devolve string vazia nesses
// arquivos — um parser por regex nunca funcionaria aqui. Por isso a
// extração roda via IA (Gemini, já usado nos assistentes de Legislação e
// Biblioteca — mesma GEMINI_API_KEY), mandando o PDF inteiro como
// `inlineData` e pedindo de volta só o JSON estrito abaixo.
// Achado (produção, 2026-10-02 a 2026-10-05): "gemini-flash-latest" vem
// devolvendo 503/UNAVAILABLE ("high demand") de forma persistente, não só
// em picos passageiros. A conta usada aqui é gratuita (decisão do
// usuário — não vale a pena habilitar faturamento só pra isso), então não
// dá pra resolver a causa raiz (cota maior). Mas cada modelo do Gemini
// tem cota gratuita PRÓPRIA — tentar vários em sequência multiplica as
// chances de pelo menos um estar disponível no momento, sem custo nenhum.
// Mesmo correndo o risco pontual de descontinuação que o alias "-latest"
// evita (ver comentário em assistente-legislacao.ts), um resultado por
// qualquer um desses modelos é melhor que nenhum resultado.
const MODELOS_GEMINI = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-lite-latest",
];

const PROMPT_EXTRACAO = `Este arquivo é (ou deveria ser) um extrato bancário da Sicoob, em um dos dois formatos abaixo. Nenhum dos dois lista lançamentos individuais — o que importa é só o saldo consolidado:

1) "Extrato de Apropriação Diária" (conta de aplicação financeira / RDC Automático ou Flexível) — extraia a data e o valor da linha "Saldo disponível em DD/MM/AAAA" (não a linha "Saldo bruto", que ainda inclui IR a descontar).
2) "Extrato da Conta Capital" (subscrição/integralização de capital) — extraia o valor de "SALDO TOTAL"; como data, use a data de emissão do extrato (aparece no cabeçalho, geralmente junto da hora, no formato DD/MM/AAAA).

Responda SOMENTE com um JSON, sem nenhum texto antes ou depois, no formato exato:
{"reconhecido": true, "dataReferencia": "AAAA-MM-DD", "saldo": 1234.56}

Se o arquivo não for nenhum desses dois formatos, ou se você não conseguir identificar os dois campos (data e saldo) com certeza, responda exatamente:
{"reconhecido": false}`;

const respostaIaSchema = z.discriminatedUnion("reconhecido", [
  z.object({ reconhecido: z.literal(true), dataReferencia: z.string(), saldo: z.number() }),
  z.object({ reconhecido: z.literal(false) }),
]);

function ehErroTemporario(err: unknown): boolean {
  const mensagem = err instanceof Error ? err.message : String(err);
  return /"code":\s*503|UNAVAILABLE|overloaded|high demand/i.test(mensagem);
}

// Sobrecarga transitória do lado do Google — não do PDF em si. Só uma
// retentativa curta por modelo: com vários modelos na lista (cada um com
// cota própria), vale mais trocar de modelo do que insistir várias vezes
// no mesmo que já respondeu sobrecarregado. Qualquer outro erro (ex.:
// chave inválida) falha na hora, sem retentativa nem troca de modelo.
async function gerarConteudoComRetentativa<T>(chamar: () => Promise<T>): Promise<T> {
  const MAX_TENTATIVAS = 2;
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await chamar();
    } catch (err) {
      if (!ehErroTemporario(err) || tentativa >= MAX_TENTATIVAS) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function extrairSaldoPdfViaIA(bytes: Buffer): Promise<SaldoExtraidoPdf> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Conferência de saldo por PDF requer GEMINI_API_KEY configurada nesta instalação.",
    );
  }
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  const gerarComModelo = (model: string) =>
    gerarConteudoComRetentativa(() =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "application/pdf", data: bytes.toString("base64") } },
              { text: PROMPT_EXTRACAO },
            ],
          },
        ],
        config: { responseMimeType: "application/json" },
      }),
    );
  let resposta: Awaited<ReturnType<typeof gerarComModelo>> | undefined;
  let ultimoErro: unknown;
  for (const modelo of MODELOS_GEMINI) {
    try {
      resposta = await gerarComModelo(modelo);
      break;
    } catch (err) {
      ultimoErro = err;
      // Erro real (ex.: chave inválida) não melhora trocando de modelo —
      // só sobrecarga transitória justifica seguir tentando o próximo.
      if (!ehErroTemporario(err)) break;
    }
  }
  if (!resposta) {
    console.error(
      "[conciliacao-pdf] falha ao chamar a API do Gemini em todos os modelos:",
      ultimoErro,
    );
    throw new Error(
      "O serviço de IA está indisponível no momento (alta demanda). Tente novamente em alguns instantes.",
    );
  }

  const erroFormato =
    "Formato de PDF não reconhecido. Suportado hoje: extrato de apropriação diária (aplicação/RDC) e extrato da Conta Capital, ambos da Sicoob.";
  let json: unknown;
  try {
    json = JSON.parse((resposta.text ?? "").trim());
  } catch {
    throw new Error(erroFormato);
  }
  const parsed = respostaIaSchema.safeParse(json);
  if (!parsed.success || !parsed.data.reconhecido) throw new Error(erroFormato);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.dataReferencia)) throw new Error(erroFormato);
  return { data: parsed.data.dataReferencia, saldo: parsed.data.saldo };
}

// Saldo que o sistema tem pra uma conta numa data — mesma base de cálculo
// usada em obterResumoConciliacaoOfx (tesouraria-conciliacao.ts), mas sem a
// parte dependente de OFX (que aqui não existe): saldo inicial da conta +
// recibos + todo lançamento avulso pago (entrada/saída/transferência) até a
// data de referência, qualquer que seja o vínculo de conciliação dele.
export async function calcularSaldoSistemaNaData(
  conn: import("mysql2/promise").PoolConnection,
  contaId: string,
  dataReferencia: string,
): Promise<number | null> {
  const [[linha]] = await conn.query<RowDataPacket[]>(
    `SELECT cf.saldo_inicial + COALESCE(SUM(eventos.valor_sinal), 0) AS saldo
     FROM contas_financeiras cf
     LEFT JOIN (
       SELECT r.conta_financeira_id, r.valor_total AS valor_sinal
       FROM recibos r
       WHERE r.loja_id = @current_loja_id AND r.data <= ?

       UNION ALL

       SELECT l.conta_id,
              CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
       FROM lancamentos l
       WHERE l.loja_id = @current_loja_id
         AND l.pago = TRUE AND l.conta_id IS NOT NULL AND l.data_pagamento <= ?
         AND NOT EXISTS (
           SELECT 1 FROM recibo_itens ri
           WHERE ri.loja_id = l.loja_id AND ri.lancamento_id = l.id
         )

       UNION ALL

       SELECT l.conta_destino_id, l.valor
       FROM lancamentos l
       WHERE l.loja_id = @current_loja_id
         AND l.pago = TRUE AND l.tipo = 'transferencia'
         AND l.conta_destino_id IS NOT NULL AND l.data_pagamento <= ?
         AND NOT EXISTS (
           SELECT 1 FROM recibo_itens ri
           WHERE ri.loja_id = l.loja_id AND ri.lancamento_id = l.id
         )
     ) eventos ON eventos.conta_financeira_id = cf.id
     WHERE cf.loja_id = @current_loja_id AND cf.id = ?
     GROUP BY cf.id, cf.saldo_inicial`,
    [dataReferencia, dataReferencia, dataReferencia, contaId],
  );
  return linha?.saldo == null ? null : Number(linha.saldo);
}

const conferirSchema = z.object({
  contaId: z.string().uuid(),
  arquivoBase64: z.string().min(1),
  nomeArquivo: z.string().min(1).max(255),
});

export type ConferenciaSaldoPdf = {
  id: string;
  dataReferencia: string;
  saldoPdf: number;
  saldoSistema: number | null;
  diferenca: number | null;
};

export const conferirSaldoPdf = createServerFn({ method: "POST" })
  .validator((d: unknown) => conferirSchema.parse(d))
  .handler(async ({ data }): Promise<ConferenciaSaldoPdf> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual, lojaId) => {
      const [contas] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM contas_financeiras WHERE id = ? AND loja_id = @current_loja_id",
        [data.contaId],
      );
      if (!contas.length) throw new Error("Conta financeira não encontrada nesta Loja.");

      let bytes: Buffer;
      try {
        bytes = Buffer.from(data.arquivoBase64, "base64");
      } catch {
        throw new Error("Arquivo inválido.");
      }
      const { data: dataReferencia, saldo: saldoPdf } = await extrairSaldoPdfViaIA(bytes);

      const saldoSistema = await calcularSaldoSistemaNaData(conn, data.contaId, dataReferencia);
      const diferenca =
        saldoSistema == null ? null : Math.round((saldoPdf - saldoSistema) * 100) / 100;

      const id = crypto.randomUUID();
      await conn.query(
        `INSERT INTO conferencias_saldo_pdf
           (id, loja_id, conta_financeira_id, data_referencia, saldo_pdf, saldo_sistema, diferenca, nome_arquivo, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          lojaId,
          data.contaId,
          dataReferencia,
          saldoPdf,
          saldoSistema,
          diferenca,
          data.nomeArquivo,
          usuarioIdAtual,
        ],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "conferir_saldo_pdf",
        "conferencia_saldo_pdf",
        id,
        null,
        { contaId: data.contaId, dataReferencia, saldoPdf, saldoSistema, diferenca },
      );

      return { id, dataReferencia, saldoPdf, saldoSistema, diferenca };
    });
  });

export type ConferenciaSaldoPdfHistorico = ConferenciaSaldoPdf & {
  nomeArquivo: string;
  criadoEm: string;
};

export const listarConferenciasSaldoPdf = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ConferenciaSaldoPdfHistorico[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, data_referencia, saldo_pdf, saldo_sistema, diferenca, nome_arquivo, criado_em
         FROM conferencias_saldo_pdf
         WHERE loja_id = @current_loja_id AND conta_financeira_id = ?
         ORDER BY criado_em DESC LIMIT 20`,
        [data.contaId],
      );
      return rows.map((r) => ({
        id: r.id,
        dataReferencia: String(r.data_referencia),
        saldoPdf: Number(r.saldo_pdf),
        saldoSistema: r.saldo_sistema == null ? null : Number(r.saldo_sistema),
        diferenca: r.diferenca == null ? null : Number(r.diferenca),
        nomeArquivo: r.nome_arquivo,
        criadoEm: String(r.criado_em),
      }));
    });
  });
