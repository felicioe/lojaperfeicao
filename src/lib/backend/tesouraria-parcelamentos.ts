import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

// RLS original: SELECT admin/tesoureiro/secretario (tudo) OU o próprio
// irmão. Sem escrita direta — só a procedure criar_parcelamento.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

export type Parcelamento = {
  id: string;
  irmao_id: string;
  data: string;
  valor_original: number;
  valor_multa: number;
  valor_juros: number;
  entrada: number;
  valor_parcelado: number;
  numero_parcelas: number;
  observacoes: string | null;
  irmaos: { nome_civil: string } | null;
};

export const listarParcelamentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Parcelamento[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      // O filtro de loja entra sempre; o de usuário só restringe mais (irmão
      // comum vê apenas os próprios parcelamentos).
      const where = privilegiado
        ? "WHERE p.loja_id = @current_loja_id"
        : "WHERE p.loja_id = @current_loja_id AND i.usuario_id = ?";
      const valores = privilegiado ? [] : [usuarioId];
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT p.*, i.nome_civil
         FROM parcelamentos p
         JOIN irmaos i ON i.id = p.irmao_id AND i.loja_id = p.loja_id
         ${where}
         ORDER BY p.data DESC`,
        valores,
      );
      return rows.map((r) => ({
        id: r.id,
        irmao_id: r.irmao_id,
        data: r.data,
        valor_original: r.valor_original,
        valor_multa: r.valor_multa,
        valor_juros: r.valor_juros,
        entrada: r.entrada,
        valor_parcelado: r.valor_parcelado,
        numero_parcelas: r.numero_parcelas,
        observacoes: r.observacoes,
        irmaos: { nome_civil: r.nome_civil },
      }));
    });
  },
);

export type FaturaAbertaIrmao = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
};

export const listarFaturasAbertasPorIrmao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<FaturaAbertaIrmao[]> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, descricao, (valor - valor_pago) AS valor, data_vencimento FROM lancamentos
         WHERE loja_id = @current_loja_id AND irmao_id = ? AND tipo = 'entrada'
           AND pago = FALSE AND valor_pago = 0 ORDER BY data_vencimento`,
        [data.irmaoId],
      );
      return rows as FaturaAbertaIrmao[];
    });
  });

const criarParcelamentoSchema = z.object({
  lancamentoIds: z.array(z.string().uuid()).min(1),
  numeroParcelas: z.number().int().positive(),
  entrada: z.number(),
  contaFinanceiraId: z.string().uuid().nullable(),
  data: z.string(),
  incluirMultaJuros: z.boolean(),
  observacoes: z.string().nullable(),
});

export const criarParcelamento = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarParcelamentoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("CALL criar_parcelamento(?, ?, ?, ?, ?, ?, ?, @parcelamento_id)", [
        JSON.stringify(data.lancamentoIds),
        data.numeroParcelas,
        data.entrada,
        data.contaFinanceiraId,
        data.data,
        data.incluirMultaJuros,
        data.observacoes,
      ]);
      const [[{ parcelamento_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @parcelamento_id AS parcelamento_id",
      );
      return { id: parcelamento_id };
    });
  });

export type LancamentoParcela = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  pago: boolean;
  parcelado: boolean;
};

export const listarLancamentosDoParcelamento = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ parcelamentoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<LancamentoParcela[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, descricao, valor, data_vencimento, pago, parcelado FROM lancamentos
         WHERE loja_id = @current_loja_id AND parcelamento_id = ? ORDER BY data_vencimento`,
        [data.parcelamentoId],
      );
      return rows as LancamentoParcela[];
    });
  });
