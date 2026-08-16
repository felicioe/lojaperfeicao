import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Toda esta área (emissão/baixa de faturas) é admin/tesoureiro apenas —
// mesma regra de lancamentos_write.
const PAPEIS = ["admin", "tesoureiro"];

export type FaturaAberta = {
  id: string;
  irmao_id: string;
  descricao: string;
  valor: number;
  valor_pago: number;
  data: string;
  data_vencimento: string;
  competencia_mes: string;
  forma_cobranca: "pix" | "boleto" | null;
  pix_chave_id: string | null;
  irmaos: { nome_civil: string; telefone: string | null; celular: string | null } | null;
};

export const listarFaturasAbertas = createServerFn({ method: "GET" }).handler(
  async (): Promise<FaturaAberta[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.irmao_id, l.descricao, l.valor, l.valor_pago, l.data, l.data_vencimento, l.competencia_mes,
                l.forma_cobranca, l.pix_chave_id, i.nome_civil, i.telefone, i.celular
         FROM lancamentos l
         JOIN irmaos i ON i.id = l.irmao_id
         WHERE l.tipo = 'entrada' AND l.is_mensalidade = TRUE AND l.pago = FALSE
         ORDER BY l.data_vencimento`,
      );
      return rows.map((r) => ({
        id: r.id,
        irmao_id: r.irmao_id,
        descricao: r.descricao,
        valor: r.valor,
        valor_pago: r.valor_pago,
        data: r.data,
        data_vencimento: r.data_vencimento,
        competencia_mes: r.competencia_mes,
        forma_cobranca: r.forma_cobranca,
        pix_chave_id: r.pix_chave_id,
        irmaos: { nome_civil: r.nome_civil, telefone: r.telefone, celular: r.celular },
      }));
    });
  },
);

export type MultaJuros = { multa: number; juros: number; dias_atraso: number; total: number };

export const calcularMultaJuros = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ valor: z.number(), vencimento: z.string(), dataReferencia: z.string() }).parse(d),
  )
  .handler(async ({ data }): Promise<MultaJuros> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL calcular_multa_juros(?, ?, ?, @multa, @juros, @dias, @total)", [
        data.valor,
        data.vencimento,
        data.dataReferencia,
      ]);
      const [[out]] = await conn.query<RowDataPacket[]>(
        "SELECT @multa AS multa, @juros AS juros, @dias AS dias_atraso, @total AS total",
      );
      return { multa: out.multa, juros: out.juros, dias_atraso: out.dias_atraso, total: out.total };
    });
  });

const baixarFaturasSchema = z.object({
  lancamentoIds: z.array(z.string().uuid()).min(1),
  contaFinanceiraId: z.string().uuid(),
  formaPagamento: z.string().nullable(),
  dataPagamento: z.string(),
  desconto: z.number(),
  observacoes: z.string().nullable(),
  jurosAdicional: z.number().nonnegative(),
  valorExtra: z.number().nonnegative(),
  planoContaExtraId: z.string().uuid().nullable(),
});

export const baixarFaturas = createServerFn({ method: "POST" })
  .validator((d: unknown) => baixarFaturasSchema.parse(d))
  .handler(async ({ data }): Promise<{ reciboId: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      await conn.query("CALL baixar_faturas(?, ?, ?, ?, ?, ?, ?, ?, ?, @recibo_id)", [
        JSON.stringify(data.lancamentoIds),
        data.contaFinanceiraId,
        data.formaPagamento,
        data.dataPagamento,
        data.desconto,
        data.observacoes,
        data.jurosAdicional,
        data.valorExtra,
        data.planoContaExtraId,
      ]);
      const [[{ recibo_id }]] = await conn.query<RowDataPacket[]>("SELECT @recibo_id AS recibo_id");
      await registrarAuditoria(conn, usuarioIdAtual, "baixar", "recibo", recibo_id, null, data);
      return { reciboId: recibo_id };
    });
  });

// Pagamento parcial (issue #131) — negociação de dívida: recebe menos
// que o total devido e aplica nas faturas selecionadas conforme a
// alocação vinda da tela (sugerida automaticamente, editável pelo
// usuário). Diferente de baixarFaturas (baixa integral, calcula
// multa/juros): aqui não há cálculo automático de multa/juros, só o
// principal da fatura. Fecha a fatura (pago = TRUE) só quando o valor
// aplicado cobre o saldo restante; senão fica em aberto com saldo menor.
const baixarPagamentoParcialSchema = z.object({
  alocacao: z
    .array(z.object({ lancamentoId: z.string().uuid(), valor: z.number().positive() }))
    .min(1),
  contaFinanceiraId: z.string().uuid(),
  formaPagamento: z.string().nullable(),
  dataPagamento: z.string(),
  observacoes: z.string().nullable(),
});

export const baixarPagamentoParcial = createServerFn({ method: "POST" })
  .validator((d: unknown) => baixarPagamentoParcialSchema.parse(d))
  .handler(async ({ data }): Promise<{ reciboId: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      await conn.query("CALL baixar_pagamento_parcial(?, ?, ?, ?, ?, @recibo_id)", [
        JSON.stringify(
          data.alocacao.map((a) => ({ lancamento_id: a.lancamentoId, valor: a.valor })),
        ),
        data.contaFinanceiraId,
        data.formaPagamento,
        data.dataPagamento,
        data.observacoes,
      ]);
      const [[{ recibo_id }]] = await conn.query<RowDataPacket[]>("SELECT @recibo_id AS recibo_id");
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "baixar_parcial",
        "recibo",
        recibo_id,
        null,
        data,
      );
      return { reciboId: recibo_id };
    });
  });

export const listarPreviewLoteMensalidades = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ competencia: z.string() }).parse(d))
  .handler(
    async ({ data }): Promise<{ id: string; nome_civil: string; valor_mensalidade: number }[]> => {
      return comPapel(PAPEIS, async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT i.id, i.nome_civil,
                  COALESCE(
                    (SELECT tv.valor FROM tabela_valores tv
                     WHERE tv.tipo = 'mensalidade' AND tv.org_id IS NULL
                       AND tv.vigencia_inicio <= mes_competencia(?)
                     ORDER BY tv.vigencia_inicio DESC LIMIT 1),
                    i.valor_mensalidade
                  ) AS valor_mensalidade
         FROM irmaos i
         WHERE i.situacao IN ('ativo', 'quite', 'irregular') AND i.valor_mensalidade > 0
           AND NOT EXISTS (
             SELECT 1 FROM lancamentos l WHERE l.irmao_id = i.id AND l.is_mensalidade = TRUE AND l.competencia_mes = ?
           )
         ORDER BY i.nome_civil`,
          [data.competencia, data.competencia],
        );
        return rows as { id: string; nome_civil: string; valor_mensalidade: number }[];
      });
    },
  );

const rateioSchema = z
  .array(z.object({ conta_id: z.string().uuid(), percentual: z.number() }))
  .nullable();

const faturaAvulsaSchema = z.object({
  irmaoId: z.string().uuid(),
  valor: z.number().positive(),
  competenciaMes: z.string(),
  dataVencimento: z.string(),
  descricao: z.string().nullable(),
  rateio: rateioSchema,
});

export const criarFaturaAvulsa = createServerFn({ method: "POST" })
  .validator((d: unknown) => faturaAvulsaSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      await conn.query("CALL criar_fatura_avulsa(?, ?, ?, ?, ?, ?, @lanc_id)", [
        data.irmaoId,
        data.valor,
        data.competenciaMes,
        data.dataVencimento,
        data.descricao,
        data.rateio ? JSON.stringify(data.rateio) : null,
      ]);
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      await registrarAuditoria(conn, usuarioIdAtual, "criar", "fatura_avulsa", lanc_id, null, data);

      const { enviarEmailFaturaEmitida } = await import("../email-dispatch");
      enviarEmailFaturaEmitida(lanc_id as string).catch((err) =>
        console.error("Falha ao enviar e-mail de fatura emitida:", err),
      );

      return { id: lanc_id };
    });
  });
