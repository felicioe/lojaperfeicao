import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

// RLS original (mysql/migrations/0002_cadastros.sql): SELECT livre para
// autenticados (sessoes e presencas); escrita admin OU secretario.
const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Sessao = {
  id: string;
  data: string;
  tipo: "ordinaria" | "magna" | "branca" | "administrativa";
  grau: "aprendiz" | "companheiro" | "mestre";
  observacoes: string | null;
};

export type Presenca = { id: string; sessao_id: string; irmao_id: string; presente: boolean; justificado: boolean };

export const listarSessoes = createServerFn({ method: "GET" }).handler(async (): Promise<Sessao[]> => {
  return comSessao(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM sessoes ORDER BY data DESC");
    return rows as Sessao[];
  });
});

export const obterSessao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Sessao | null> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM sessoes WHERE id = ?", [data.id]);
      return (rows[0] as Sessao) ?? null;
    });
  });

const novaSessaoSchema = z.object({
  data: z.string(),
  tipo: z.enum(["ordinaria", "magna", "branca", "administrativa"]),
  grau: z.enum(["aprendiz", "companheiro", "mestre"]),
});

export const criarSessao = createServerFn({ method: "POST" })
  .validator((d: unknown) => novaSessaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("INSERT INTO sessoes (data, tipo, grau) VALUES (?, ?, ?)", [
        data.data,
        data.tipo,
        data.grau,
      ]);
    });
  });

export const listarPresencas = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ sessaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Presenca[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM presencas WHERE sessao_id = ?", [
        data.sessaoId,
      ]);
      return rows as Presenca[];
    });
  });

export const togglePresenca = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ sessaoId: z.string().uuid(), irmaoId: z.string().uuid(), presente: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query(
        `INSERT INTO presencas (sessao_id, irmao_id, presente) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE presente = VALUES(presente)`,
        [data.sessaoId, data.irmaoId, data.presente],
      );
    });
  });
