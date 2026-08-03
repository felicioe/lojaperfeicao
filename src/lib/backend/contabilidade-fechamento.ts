import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// RLS original: SELECT admin/tesoureiro. Sem escrita direta — só as
// procedures fechar_exercicio/reabrir_exercicio (ambas admin-only, checado
// de novo dentro da procedure).
const PAPEIS = ["admin", "tesoureiro"];

export type FechamentoExercicio = {
  id: string;
  exercicio: number;
  data_corte: string;
  status: "fechado" | "reaberto";
  resultado_apurado: number | null;
  fechado_por: string | null;
  fechado_em: string;
  reaberto_por: string | null;
  reaberto_em: string | null;
  observacoes: string | null;
  motivo_reabertura: string | null;
};

export const listarFechamentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<FechamentoExercicio[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM fechamentos_exercicio ORDER BY exercicio DESC",
      );
      return rows as FechamentoExercicio[];
    });
  },
);

export type EventoFechamento = {
  id: string;
  fechamento_id: string;
  acao: "fechamento" | "reabertura";
  realizado_por: string | null;
  realizado_em: string;
  motivo: string | null;
};

export const listarEventosFechamento = createServerFn({ method: "GET" }).handler(
  async (): Promise<EventoFechamento[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM fechamentos_exercicio_eventos ORDER BY realizado_em DESC",
      );
      return rows as EventoFechamento[];
    });
  },
);

export type PreviewResultado = { total_receita: number; total_despesa: number; resultado: number };

// Prévia do resultado a apurar até uma data de corte — mesma lógica de
// agregação usada por fechar_exercicio, só de leitura (sem transportar).
export const previewResultadoFechamento = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ dataCorte: z.string() }).parse(d))
  .handler(async ({ data }): Promise<PreviewResultado> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT pc.tipo,
                COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS debito,
                COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS credito
         FROM plano_contas pc
         JOIN lancamentos_contabeis_itens i ON i.conta_id = pc.id
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id
         WHERE pc.tipo IN ('receita', 'despesa') AND pc.analitica = TRUE AND lc.data <= ?
         GROUP BY pc.tipo`,
        [data.dataCorte],
      );
      let totalReceita = 0;
      let totalDespesa = 0;
      for (const r of rows) {
        if (r.tipo === "receita") totalReceita += Number(r.credito) - Number(r.debito);
        else totalDespesa += Number(r.debito) - Number(r.credito);
      }
      return {
        total_receita: totalReceita,
        total_despesa: totalDespesa,
        resultado: totalReceita - totalDespesa,
      };
    });
  });

export const fecharExercicio = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        exercicio: z.number().int(),
        dataCorte: z.string(),
        observacoes: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL fechar_exercicio(?, ?, ?, @fechamento_id)", [
        data.exercicio,
        data.dataCorte,
        data.observacoes,
      ]);
      const [[{ fechamento_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @fechamento_id AS fechamento_id",
      );
      return { id: fechamento_id };
    });
  });

export const reabrirExercicio = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ exercicio: z.number().int(), motivo: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL reabrir_exercicio(?, ?)", [data.exercicio, data.motivo]);
    });
  });

// Substitui a antiga leitura de "profiles" (Postgres) — aqui é usuarios.
export const listarNomesUsuarios = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; nome_completo: string | null }[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT id, nome_completo FROM usuarios");
      return rows as { id: string; nome_completo: string | null }[];
    });
  },
);
