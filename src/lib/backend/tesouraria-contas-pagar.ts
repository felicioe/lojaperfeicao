import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// lancamentos_write original: admin/tesoureiro.
const PAPEIS = ["admin", "tesoureiro"];

export type ContaPagar = {
  id: string;
  data: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  descricao: string;
  valor: number;
  valor_pago: number;
  pago: boolean;
  forma_pagamento: string | null;
  plano_contas: { codigo: string; nome: string } | null;
  terceiros: { nome: string } | null;
  contas_financeiras: { nome: string } | null;
};

async function buscarContasPagar(
  conn: PoolConnection,
  pago: boolean,
  limite?: number,
): Promise<ContaPagar[]> {
  const ordenacao = pago ? "l.data_pagamento DESC" : "l.data_vencimento";
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT l.id, l.data, l.data_vencimento, l.data_pagamento, l.descricao, l.valor, l.valor_pago, l.pago, l.forma_pagamento,
            pc.codigo AS plano_codigo, pc.nome AS plano_nome, t.nome AS terceiro_nome, cf.nome AS conta_nome
     FROM lancamentos l
     LEFT JOIN plano_contas pc ON pc.id = l.plano_conta_id
     LEFT JOIN terceiros t ON t.id = l.terceiro_id
     LEFT JOIN contas_financeiras cf ON cf.id = l.conta_id
     WHERE l.tipo = 'saida' AND l.pago = ?
     ORDER BY ${ordenacao}
     ${limite ? "LIMIT ?" : ""}`,
    limite ? [pago, limite] : [pago],
  );
  return rows.map((r) => ({
    id: r.id,
    data: r.data,
    data_vencimento: r.data_vencimento,
    data_pagamento: r.data_pagamento,
    descricao: r.descricao,
    valor: r.valor,
    valor_pago: r.valor_pago,
    pago: r.pago,
    forma_pagamento: r.forma_pagamento,
    plano_contas: r.plano_codigo ? { codigo: r.plano_codigo, nome: r.plano_nome } : null,
    terceiros: r.terceiro_nome ? { nome: r.terceiro_nome } : null,
    contas_financeiras: r.conta_nome ? { nome: r.conta_nome } : null,
  }));
}

export const listarContasPagarAbertas = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaPagar[]> => {
    return comPapel(PAPEIS, (conn) => buscarContasPagar(conn, false));
  },
);

export const listarContasPagarPagas = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaPagar[]> => {
    return comPapel(PAPEIS, (conn) => buscarContasPagar(conn, true, 200));
  },
);

const novaContaPagarSchema = z.object({
  descricao: z.string().min(1),
  valor: z.number().positive(),
  planoContaId: z.string().uuid(),
  data: z.string(),
  dataVencimento: z.string(),
  terceiroId: z.string().uuid().nullable(),
  observacoes: z.string().nullable(),
});

export const criarContaPagar = createServerFn({ method: "POST" })
  .validator((d: unknown) => novaContaPagarSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL criar_conta_pagar(?, ?, ?, ?, ?, NULL, ?, ?, @lanc_id)", [
        data.descricao,
        data.valor,
        data.planoContaId,
        data.data,
        data.dataVencimento,
        data.terceiroId,
        data.observacoes,
      ]);
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      return { id: lanc_id };
    });
  });

const baixarContaPagarSchema = z.object({
  lancamentoId: z.string().uuid(),
  contaFinanceiraId: z.string().uuid(),
  formaPagamento: z.string().nullable(),
  dataPagamento: z.string(),
});

export const baixarContaPagar = createServerFn({ method: "POST" })
  .validator((d: unknown) => baixarContaPagarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL baixar_conta_pagar(?, ?, ?, ?)", [
        data.lancamentoId,
        data.contaFinanceiraId,
        data.formaPagamento,
        data.dataPagamento,
      ]);
    });
  });
