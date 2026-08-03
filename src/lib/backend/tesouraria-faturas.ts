import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// Toda esta área (emissão/baixa de faturas) é admin/tesoureiro apenas —
// mesma regra de lancamentos_write.
const PAPEIS = ["admin", "tesoureiro"];

export type FaturaAberta = {
  id: string;
  irmao_id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  competencia_mes: string;
  irmaos: { nome_civil: string; telefone: string | null; celular: string | null } | null;
};

export const listarFaturasAbertas = createServerFn({ method: "GET" }).handler(
  async (): Promise<FaturaAberta[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.irmao_id, l.descricao, l.valor, l.data_vencimento, l.competencia_mes,
                i.nome_civil, i.telefone, i.celular
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
        data_vencimento: r.data_vencimento,
        competencia_mes: r.competencia_mes,
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
});

export const baixarFaturas = createServerFn({ method: "POST" })
  .validator((d: unknown) => baixarFaturasSchema.parse(d))
  .handler(async ({ data }): Promise<{ reciboId: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL baixar_faturas(?, ?, ?, ?, ?, ?, @recibo_id)", [
        JSON.stringify(data.lancamentoIds),
        data.contaFinanceiraId,
        data.formaPagamento,
        data.dataPagamento,
        data.desconto,
        data.observacoes,
      ]);
      const [[{ recibo_id }]] = await conn.query<RowDataPacket[]>("SELECT @recibo_id AS recibo_id");
      return { reciboId: recibo_id };
    });
  });

export const listarPreviewLoteMensalidades = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ competencia: z.string() }).parse(d))
  .handler(
    async ({ data }): Promise<{ id: string; nome_civil: string; valor_mensalidade: number }[]> => {
      return comPapel(PAPEIS, async (conn) => {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT i.id, i.nome_civil, i.valor_mensalidade
         FROM irmaos i
         WHERE i.situacao IN ('ativo', 'quite', 'irregular') AND i.valor_mensalidade > 0
           AND NOT EXISTS (
             SELECT 1 FROM lancamentos l WHERE l.irmao_id = i.id AND l.is_mensalidade = TRUE AND l.competencia_mes = ?
           )
         ORDER BY i.nome_civil`,
          [data.competencia],
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

// Equivalente ao menu do sistema legado que limpava as faturas pendentes.
// Só atinge faturas em aberto (mesmo critério de listarFaturasAbertas) — a
// provisão contábil correspondente é removida junto; nada mais é tocado.
export const zerarFaturasAbertas = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ total: number }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL zerar_faturas_abertas(@total)");
      const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT @total AS total");
      return { total };
    });
  },
);

export const criarFaturaAvulsa = createServerFn({ method: "POST" })
  .validator((d: unknown) => faturaAvulsaSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL criar_fatura_avulsa(?, ?, ?, ?, ?, ?, @lanc_id)", [
        data.irmaoId,
        data.valor,
        data.competenciaMes,
        data.dataVencimento,
        data.descricao,
        data.rateio ? JSON.stringify(data.rateio) : null,
      ]);
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      return { id: lanc_id };
    });
  });
