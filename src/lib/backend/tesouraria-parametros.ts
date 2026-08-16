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
        "SELECT multa_ativa, multa_percentual, juros_ativo, juros_diario_percentual FROM parametros_financeiros WHERE id = 1",
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
        "SELECT multa_ativa, multa_percentual, juros_ativo, juros_diario_percentual FROM parametros_financeiros WHERE id = 1",
      );
      await conn.query(
        "UPDATE parametros_financeiros SET multa_ativa=?, multa_percentual=?, juros_ativo=?, juros_diario_percentual=? WHERE id = 1",
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
