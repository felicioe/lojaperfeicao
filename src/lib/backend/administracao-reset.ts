import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// Reset total do módulo financeiro (ver mysql/migrations/0011). Mesmo
// critério de risco do restante do módulo (fechar_exercicio,
// reabrir_exercicio, aprovar_orcamento, reabrir_orcamento): admin-only.
const PAPEIS = ["admin"];

export const contarMovimentoFinanceiro = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ total: number }> => {
    return comPapel(PAPEIS, async (conn) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM lancamentos",
      );
      return { total: row.total };
    });
  },
);

export const resetarFinanceiro = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ total: number }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL resetar_financeiro(@total)");
      const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT @total AS total");
      return { total };
    });
  },
);
