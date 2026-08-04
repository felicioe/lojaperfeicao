import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

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
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      await conn.query("CALL resetar_financeiro(@total)");
      const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT @total AS total");
      // a ação mais destrutiva do sistema — registrada mesmo sabendo que
      // ela mesma não apaga a tabela de auditoria (só o módulo financeiro).
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "resetar_financeiro",
        "financeiro",
        null,
        null,
        {
          lancamentos_apagados: total,
        },
      );
      return { total };
    });
  },
);
