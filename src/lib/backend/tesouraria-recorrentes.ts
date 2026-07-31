import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// RLS original: SELECT e escrita ambos restritos a admin/tesoureiro (não
// é leitura livre como a maioria das tabelas de tesouraria).
const PAPEIS = ["admin", "tesoureiro"];

export type DespesaRecorrente = {
  id: string;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  plano_conta_id: string;
  terceiro_id: string | null;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  observacoes: string | null;
  plano_contas: { codigo: string; nome: string } | null;
  terceiros: { nome: string } | null;
};

export const listarDespesasRecorrentes = createServerFn({ method: "GET" }).handler(
  async (): Promise<DespesaRecorrente[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT dr.*, pc.codigo AS plano_codigo, pc.nome AS plano_nome, t.nome AS terceiro_nome
         FROM despesas_recorrentes dr
         LEFT JOIN plano_contas pc ON pc.id = dr.plano_conta_id
         LEFT JOIN terceiros t ON t.id = dr.terceiro_id
         ORDER BY dr.descricao`,
      );
      return rows.map((r) => ({
        id: r.id,
        descricao: r.descricao,
        valor: r.valor,
        dia_vencimento: r.dia_vencimento,
        plano_conta_id: r.plano_conta_id,
        terceiro_id: r.terceiro_id,
        data_inicio: r.data_inicio,
        data_fim: r.data_fim,
        ativo: r.ativo,
        observacoes: r.observacoes,
        plano_contas: r.plano_codigo ? { codigo: r.plano_codigo, nome: r.plano_nome } : null,
        terceiros: r.terceiro_nome ? { nome: r.terceiro_nome } : null,
      }));
    });
  },
);

export const listarRecorrentesEfetivadasNoMes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ inicioMes: z.string() }).parse(d))
  .handler(async ({ data }): Promise<string[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT DISTINCT recorrente_id FROM lancamentos WHERE competencia_mes = ? AND recorrente_id IS NOT NULL",
        [data.inicioMes],
      );
      return rows.map((r) => r.recorrente_id as string);
    });
  });

const recorrenteSchema = z.object({
  id: z.string().uuid().nullable(),
  descricao: z.string().min(1),
  valor: z.number().positive(),
  dia_vencimento: z.number().int().min(1).max(28),
  plano_conta_id: z.string().uuid(),
  terceiro_id: z.string().uuid().nullable(),
  data_inicio: z.string(),
  data_fim: z.string().nullable(),
  observacoes: z.string().nullable(),
});

export const salvarDespesaRecorrente = createServerFn({ method: "POST" })
  .validator((d: unknown) => recorrenteSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      const valores = [
        data.descricao,
        data.valor,
        data.dia_vencimento,
        data.plano_conta_id,
        data.terceiro_id,
        data.data_inicio,
        data.data_fim,
        data.observacoes,
      ];
      if (data.id) {
        await conn.query(
          `UPDATE despesas_recorrentes SET descricao=?, valor=?, dia_vencimento=?, plano_conta_id=?, terceiro_id=?,
           data_inicio=?, data_fim=?, observacoes=? WHERE id=?`,
          [...valores, data.id],
        );
      } else {
        await conn.query(
          `INSERT INTO despesas_recorrentes (descricao, valor, dia_vencimento, plano_conta_id, terceiro_id, data_inicio, data_fim, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          valores,
        );
      }
    });
  });

export const alternarAtivoRecorrente = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("UPDATE despesas_recorrentes SET ativo=? WHERE id=?", [data.ativo, data.id]);
    });
  });

export const efetivarRecorrentesVencidas = createServerFn({ method: "POST" }).handler(
  async (): Promise<number> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL efetivar_recorrentes_vencidas(@total)");
      const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT @total AS total");
      return Number(total);
    });
  },
);
