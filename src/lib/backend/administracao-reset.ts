import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
        "SELECT COUNT(*) AS total FROM lancamentos WHERE loja_id = @current_loja_id",
      );
      return { total: row.total };
    });
  },
);

const resetarFinanceiroSchema = z.object({ motivo: z.string().min(1) });

export const resetarFinanceiro = createServerFn({ method: "POST" })
  .validator((d: unknown) => resetarFinanceiroSchema.parse(d))
  .handler(async ({ data }): Promise<{ total: number }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      // TRAVA DE SEGURANÇA (issue #348).
      //
      // `resetar_financeiro` (procedure da 0011) faz DELETE FROM lancamentos,
      // recibos, orcamentos, fechamentos_exercicio e mais quatro tabelas SEM
      // NENHUM filtro de loja. Com mais de uma Loja no banco, o admin de uma
      // apagaria o financeiro de TODAS — destrutivo e irreversível, o pior
      // caso desta issue inteira.
      //
      // A correção de verdade é dar um p_loja_id à procedure e escopar cada
      // DELETE, o que é a issue #349 (procedures) e exige migração. Enquanto
      // ela não vem, o caminho fica trancado assim que existe uma segunda
      // Loja. Com uma Loja só — a situação de hoje — o comportamento é
      // idêntico ao de sempre, porque "todas as lojas" e "esta loja" são a
      // mesma coisa.
      const [[{ lojas }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS lojas FROM lojas",
      );
      if (Number(lojas) > 1) {
        throw new Error(
          "Resetar Financeiro está bloqueado enquanto houver mais de uma Loja no sistema: " +
            "a rotina do banco ainda apaga o financeiro de todas elas de uma vez (issue #349). " +
            "Não execute — avise o administrador da plataforma.",
        );
      }
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
          motivo: data.motivo,
        },
      );
      return { total };
    });
  });
