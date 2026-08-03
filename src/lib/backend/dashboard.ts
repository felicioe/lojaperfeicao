import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";

// Mesma visibilidade de lancamentos usada em tesouraria-lancamentos.ts:
// admin/tesoureiro/secretario veem tudo, irmão comum só os seus.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

export type ContaAPagarProxima = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  tipo: "entrada" | "saida";
};

export const listarContasAPagarProximas = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ContaAPagarProxima[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = [
        "tipo = 'saida'",
        "pago = FALSE",
        "data_vencimento >= ?",
        "data_vencimento <= ?",
      ];
      const valores: unknown[] = [data.de, data.ate];
      if (!privilegiado) {
        condicoes.push("irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, descricao, valor, data_vencimento, tipo FROM lancamentos
         WHERE ${condicoes.join(" AND ")}
         ORDER BY data_vencimento`,
        valores,
      );
      return rows as ContaAPagarProxima[];
    });
  });

export type ProjecaoFluxo = { somaE: number; somaS: number; delta: number };

export const obterProjecaoFluxo = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ProjecaoFluxo> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = ["pago = FALSE", "data_vencimento >= ?", "data_vencimento <= ?"];
      const valores: unknown[] = [data.de, data.ate];
      if (!privilegiado) {
        condicoes.push("irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const where = condicoes.join(" AND ");
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT tipo, valor FROM lancamentos WHERE tipo IN ('entrada','saida') AND ${where}`,
        valores,
      );
      let somaE = 0;
      let somaS = 0;
      for (const r of rows) {
        if (r.tipo === "entrada") somaE += Number(r.valor);
        else somaS += Number(r.valor);
      }
      return { somaE, somaS, delta: somaE - somaS };
    });
  });
