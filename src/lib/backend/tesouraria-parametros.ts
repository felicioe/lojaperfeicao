import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// RLS original: SELECT livre; escrita (UPDATE, é singleton) admin/tesoureiro.
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

export type ParametrosFinanceiros = {
  multa_ativa: boolean;
  multa_percentual: number;
  juros_ativo: boolean;
  juros_diario_percentual: number;
};

export const obterParametrosFinanceiros = createServerFn({ method: "GET" }).handler(
  async (): Promise<ParametrosFinanceiros> => {
    return comSessao(async (conn) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        "SELECT multa_ativa, multa_percentual, juros_ativo, juros_diario_percentual FROM parametros_financeiros WHERE loja_id = @current_loja_id",
      );
      return row as ParametrosFinanceiros;
    });
  },
);

const parametrosSchema = z.object({
  multa_ativa: z.boolean(),
  multa_percentual: z.number(),
  juros_ativo: z.boolean(),
  juros_diario_percentual: z.number(),
});

export const salvarParametrosFinanceiros = createServerFn({ method: "POST" })
  .validator((d: unknown) => parametrosSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT multa_ativa, multa_percentual, juros_ativo, juros_diario_percentual FROM parametros_financeiros WHERE loja_id = @current_loja_id",
      );
      // Antes era um UPDATE simples num singleton global (id = 1). Depois da
      // migração 0092 há uma linha de parâmetros POR LOJA, e uma loja recém
      // criada ainda não tem a sua — um UPDATE puro não afetaria nenhuma linha
      // e a tela salvaria "com sucesso" sem gravar nada. O upsert cobre os
      // dois casos: cria na primeira vez, atualiza nas demais.
      await conn.query(
        `INSERT INTO parametros_financeiros
           (loja_id, id, multa_ativa, multa_percentual, juros_ativo, juros_diario_percentual)
         VALUES (@current_loja_id, 1, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           multa_ativa = VALUES(multa_ativa),
           multa_percentual = VALUES(multa_percentual),
           juros_ativo = VALUES(juros_ativo),
           juros_diario_percentual = VALUES(juros_diario_percentual)`,
        [data.multa_ativa, data.multa_percentual, data.juros_ativo, data.juros_diario_percentual],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar",
        "parametros_financeiros",
        null,
        antes,
        data,
      );
    });
  });
