import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";

// RLS original: SELECT admin/tesoureiro/secretario (tudo) OU o próprio
// irmão vinculado. Sem escrita direta — só a procedure baixar_faturas.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

export type Recibo = {
  id: string;
  data: string;
  valor_original: number;
  valor_multa: number;
  valor_juros: number;
  desconto: number;
  valor_total: number;
  forma_pagamento: string | null;
  irmaos: { nome_civil: string } | null;
  contas_financeiras: { nome: string } | null;
};

export const listarRecibos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Recibo[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const where = privilegiado ? "" : "WHERE i.usuario_id = ?";
      const valores = privilegiado ? [] : [usuarioId];
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT r.id, r.data, r.valor_original, r.valor_multa, r.valor_juros, r.desconto, r.valor_total, r.forma_pagamento,
              i.nome_civil, cf.nome AS conta_nome
       FROM recibos r
       JOIN irmaos i ON i.id = r.irmao_id
       LEFT JOIN contas_financeiras cf ON cf.id = r.conta_financeira_id
       ${where}
       ORDER BY r.data DESC
       LIMIT 200`,
        valores,
      );
      return rows.map((r) => ({
        id: r.id,
        data: r.data,
        valor_original: r.valor_original,
        valor_multa: r.valor_multa,
        valor_juros: r.valor_juros,
        desconto: r.desconto,
        valor_total: r.valor_total,
        forma_pagamento: r.forma_pagamento,
        irmaos: { nome_civil: r.nome_civil },
        contas_financeiras: r.conta_nome ? { nome: r.conta_nome } : null,
      }));
    });
  },
);

export type ReciboItem = {
  id: string;
  valor_original: number;
  valor_multa: number;
  valor_juros: number;
  lancamentos: { descricao: string; data_vencimento: string | null } | null;
};

export const listarReciboItens = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ reciboId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ReciboItem[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      if (!privilegiado) {
        const [[{ ok }]] = await conn.query<RowDataPacket[]>(
          `SELECT EXISTS(SELECT 1 FROM recibos r JOIN irmaos i ON i.id = r.irmao_id WHERE r.id = ? AND i.usuario_id = ?) AS ok`,
          [data.reciboId, usuarioId],
        );
        if (!ok) throw new Error("Sem permissão.");
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT ri.id, ri.valor_original, ri.valor_multa, ri.valor_juros, l.descricao, l.data_vencimento
         FROM recibo_itens ri
         JOIN lancamentos l ON l.id = ri.lancamento_id
         WHERE ri.recibo_id = ?`,
        [data.reciboId],
      );
      return rows.map((r) => ({
        id: r.id,
        valor_original: r.valor_original,
        valor_multa: r.valor_multa,
        valor_juros: r.valor_juros,
        lancamentos: { descricao: r.descricao, data_vencimento: r.data_vencimento },
      }));
    });
  });
