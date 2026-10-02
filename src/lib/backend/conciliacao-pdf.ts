import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { carregarPdfParse } from "./importacao-pdf-sessoes";

// Conferência de saldo por PDF (issue #720) — a Conciliação Bancária hoje só
// confere o extrato OFX linha a linha. Várias contas (aplicações/RDC, Conta
// Capital na Sicoob) não têm exportação OFX, só PDF — e o PDF deles não traz
// lançamento nenhum, só o saldo numa data (ver comentário em cada parser
// abaixo). Por isso este fluxo é deliberadamente mais simples que o OFX: lê
// o saldo do PDF, calcula o saldo que o sistema tem pra mesma data e mostra
// a diferença — sem tentar vincular/baixar nada.
const PAPEIS = ["admin", "tesoureiro"];

function parseValorBr(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export type SaldoExtraidoPdf = { data: string; saldo: number };

// Dois formatos de extrato Sicoob identificados nos PDFs de exemplo do
// usuário — nenhum dos dois lista lançamentos individuais, só o saldo
// consolidado:
//
// 1) "Extrato de Apropriação Diária" (contas de aplicação/RDC Automático ou
//    Flexível) — a linha que importa é "Saldo disponível em DD/MM/AAAA:
//    VALOR" (há também "Saldo bruto", que ainda inclui IR a descontar —
//    "disponível" é o valor líquido comparável ao saldo do sistema).
// 2) "Extrato da Conta Capital" (subscrição/integralização de capital) — não
//    tem uma linha "em DD/MM/AAAA" explícita pro saldo atual; a data de
//    referência usada é a primeira data DD/MM/AAAA do documento, que nos
//    exemplos é sempre a data de emissão do extrato (cabeçalho, junto do
//    horário) — a mesma data em que "SALDO ATUAL"/"SALDO TOTAL" foram
//    apurados.
//
// Qualquer outro formato (ex.: extrato de conta corrente comum, que já tem
// caminho próprio via OFX) não é reconhecido aqui de propósito — falha com
// mensagem clara em vez de arriscar extrair um número errado.
export function extrairSaldoPdfSicoob(textoBruto: string): SaldoExtraidoPdf {
  if (/EXTRATO DE APROPRIA[ÇC][ÃA]O DI[ÁA]RIA/i.test(textoBruto)) {
    const m = textoBruto.match(
      /Saldo dispon[íi]vel em\s*(\d{2})\/(\d{2})\/(\d{4})\s*:?\s*([\d.,]+)/i,
    );
    if (!m) {
      throw new Error(
        "Não foi possível localizar 'Saldo disponível em DD/MM/AAAA' no PDF de apropriação diária.",
      );
    }
    const [, d, mo, a, valorStr] = m;
    return { data: `${a}-${mo}-${d}`, saldo: parseValorBr(valorStr) };
  }

  if (/EXTRATO DA CONTA CAPITAL/i.test(textoBruto)) {
    const saldoMatch = textoBruto.match(/SALDO TOTAL\s*:?\s*R?\$?\s*([\d.,]+)/i);
    const dataMatch = textoBruto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!saldoMatch || !dataMatch) {
      throw new Error(
        "Não foi possível localizar 'SALDO TOTAL' e a data de emissão no PDF da Conta Capital.",
      );
    }
    const [, d, mo, a] = dataMatch;
    return { data: `${a}-${mo}-${d}`, saldo: parseValorBr(saldoMatch[1]) };
  }

  throw new Error(
    "Formato de PDF não reconhecido. Suportado hoje: extrato de apropriação diária (aplicação/RDC) e extrato da Conta Capital, ambos da Sicoob.",
  );
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
      const PDFParse = await carregarPdfParse();
      const parser = new PDFParse({ data: bytes });
      const resultado = await parser.getText();
      const { data: dataReferencia, saldo: saldoPdf } = extrairSaldoPdfSicoob(resultado.text);

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
