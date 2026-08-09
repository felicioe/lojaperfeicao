import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";

// Mesma visibilidade "privilegiado ou próprio" de tesouraria-lancamentos.ts/dashboard.ts.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

// Saldo inicial de todas as contas financeiras (sem filtro de ativo — igual
// à consulta original, que também não filtrava).
export const obterSaldoBaseContas = createServerFn({ method: "GET" }).handler(
  async (): Promise<number> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT saldo_inicial FROM contas_financeiras",
      );
      return rows.reduce((s, r) => s + Number(r.saldo_inicial), 0);
    });
  },
);

export const obterFluxoAnteriores = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string() }).parse(d))
  .handler(async ({ data }): Promise<number> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = ["pago = TRUE", "tipo IN ('entrada','saida')", "data_pagamento < ?"];
      const valores: unknown[] = [data.de];
      if (!privilegiado) {
        condicoes.push("irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT valor, tipo FROM lancamentos WHERE ${condicoes.join(" AND ")}`,
        valores,
      );
      return rows.reduce(
        (s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)),
        0,
      );
    });
  });

export type MovimentoRealizado = {
  valor: number;
  tipo: "entrada" | "saida";
  data_pagamento: string;
};

export const listarMovimentosRealizados = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<MovimentoRealizado[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = [
        "pago = TRUE",
        "tipo IN ('entrada','saida')",
        "data_pagamento >= ?",
        "data_pagamento <= ?",
      ];
      const valores: unknown[] = [data.de, data.ate];
      if (!privilegiado) {
        condicoes.push("irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT valor, tipo, data_pagamento FROM lancamentos WHERE ${condicoes.join(" AND ")} ORDER BY data_pagamento`,
        valores,
      );
      return rows as MovimentoRealizado[];
    });
  });

export type MovimentoPendente = {
  descricao: string;
  valor: number;
  tipo: "entrada" | "saida";
  data_vencimento: string;
};

export const listarMovimentosPendentes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ hoje: z.string(), dataLimite: z.string() }).parse(d))
  .handler(async ({ data }): Promise<MovimentoPendente[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = [
        "pago = FALSE",
        "tipo IN ('entrada','saida')",
        "data_vencimento >= ?",
        "data_vencimento <= ?",
      ];
      const valores: unknown[] = [data.hoje, data.dataLimite];
      if (!privilegiado) {
        condicoes.push("irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT descricao, (valor - valor_pago) AS valor, tipo, data_vencimento FROM lancamentos WHERE ${condicoes.join(" AND ")} ORDER BY data_vencimento`,
        valores,
      );
      return rows as MovimentoPendente[];
    });
  });
