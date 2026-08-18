import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// Fechamento de Período (issue #122) — trava mais leve que Fechamento de
// Exercício (contabilidade-fechamento.ts): não apura resultado, só
// impede novo lançamento/movimentação num mês já fechado. Leitura
// admin/tesoureiro, escrita (fechar/reabrir) só admin — checado de novo
// dentro das procedures.
const PAPEIS = ["admin", "tesoureiro"];

export type PeriodoFechado = {
  id: string;
  competencia: string;
  status: "fechado" | "reaberto";
  fechado_por: string | null;
  fechado_em: string;
  reaberto_por: string | null;
  reaberto_em: string | null;
  motivo_reabertura: string | null;
  observacoes: string | null;
};

export const listarPeriodosFechados = createServerFn({ method: "GET" }).handler(
  async (): Promise<PeriodoFechado[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM periodos_fechados WHERE loja_id = @current_loja_id ORDER BY competencia DESC",
      );
      return rows as PeriodoFechado[];
    });
  },
);

export type EventoPeriodoFechado = {
  id: string;
  periodo_id: string;
  acao: "fechamento" | "reabertura";
  realizado_por: string | null;
  realizado_em: string;
  motivo: string | null;
};

export const listarEventosPeriodosFechados = createServerFn({ method: "GET" }).handler(
  async (): Promise<EventoPeriodoFechado[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM periodos_fechados_eventos WHERE loja_id = @current_loja_id ORDER BY realizado_em DESC",
      );
      return rows as EventoPeriodoFechado[];
    });
  },
);

export const fecharPeriodo = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ competencia: z.string(), observacoes: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL fechar_periodo(?, ?, @periodo_id)", [
        data.competencia,
        data.observacoes,
      ]);
      const [[{ periodo_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @periodo_id AS periodo_id",
      );
      return { id: periodo_id };
    });
  });

export const reabrirPeriodo = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ competencia: z.string(), motivo: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL reabrir_periodo(?, ?)", [data.competencia, data.motivo]);
    });
  });
