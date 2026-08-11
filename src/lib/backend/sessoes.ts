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
  tipo: "ordinaria" | "magna" | "branca" | "administrativa" | "iniciacao";
  grau: number;
  org_id: string | null;
  org_nome: string | null;
  nome_grau: string | null;
  observacoes: string | null;
};

export type Presenca = {
  id: string;
  sessao_id: string;
  irmao_id: string;
  presente: boolean;
  justificado: boolean;
};

export type MembroOrg = {
  irmao_id: string;
  nome_civil: string;
  nome_simbolico: string | null;
  grau_atual: number | null;
};

// Membros vinculados a um corpo (irmao_orgs), com o grau atual deles NAQUELE
// corpo — usado pra montar a lista de presença de uma sessão (só quem tem
// grau_atual suficiente pode ser marcado presente, ver togglePresenca).
export const listarMembrosOrg = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<MembroOrg[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT io.irmao_id, i.nome_civil, i.nome_simbolico, io.grau_atual
         FROM irmao_orgs io JOIN irmaos i ON i.id = io.irmao_id
         WHERE io.org_id = ? AND i.situacao <> 'adormecido'
         ORDER BY i.nome_civil`,
        [data.orgId],
      );
      return rows as MembroOrg[];
    });
  });

const SESSAO_SELECT = `
  SELECT s.id, s.data, s.tipo, s.grau, s.org_id, o.nome AS org_nome, og.nome AS nome_grau, s.observacoes
  FROM sessoes s
  LEFT JOIN orgs o ON o.id = s.org_id
  LEFT JOIN orgs_graus og ON og.org_id = s.org_id AND og.grau = s.grau
`;

export const listarSessoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Sessao[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(`${SESSAO_SELECT} ORDER BY s.data DESC`);
      return rows as Sessao[];
    });
  },
);

export type ResponsavelSessao = {
  sessao_id: string;
  nome_extraido: string;
  apelido_extraido: string | null;
  atividade: string | null;
  irmao_id: string | null;
  irmao_nome: string | null;
};

// Preenchido só pelo importador de Cronograma (PDF) — "quem apresenta o
// quê" de cada sessão. Mesma visibilidade de listarSessoes (leitura
// livre pra autenticado): é informação de programação, não sigilosa.
export const listarResponsaveisSessoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResponsavelSessao[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT sr.sessao_id, sr.nome_extraido, sr.apelido_extraido, sr.atividade, sr.irmao_id,
                i.nome_civil AS irmao_nome
         FROM sessao_responsaveis sr
         LEFT JOIN irmaos i ON i.id = sr.irmao_id
         ORDER BY sr.criado_em`,
      );
      return rows as ResponsavelSessao[];
    });
  },
);

export const obterSessao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Sessao | null> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(`${SESSAO_SELECT} WHERE s.id = ?`, [
        data.id,
      ]);
      return (rows[0] as Sessao) ?? null;
    });
  });

const novaSessaoSchema = z.object({
  data: z.string(),
  tipo: z.enum(["ordinaria", "magna", "branca", "administrativa", "iniciacao"]),
  orgId: z.string().uuid(),
  grau: z.number().int().positive(),
  observacoes: z.string().nullable().optional(),
});

export const criarSessao = createServerFn({ method: "POST" })
  .validator((d: unknown) => novaSessaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const [[org]] = await conn.query<RowDataPacket[]>(
        "SELECT grau_min, grau_max FROM orgs WHERE id = ?",
        [data.orgId],
      );
      if (!org) throw new Error("Corpo maçônico não encontrado.");
      if (data.grau < org.grau_min || data.grau > org.grau_max) {
        throw new Error(`Grau fora da faixa deste corpo (${org.grau_min}–${org.grau_max}).`);
      }
      await conn.query(
        "INSERT INTO sessoes (data, tipo, org_id, grau, observacoes) VALUES (?, ?, ?, ?, ?)",
        [data.data, data.tipo, data.orgId, data.grau, data.observacoes ?? null],
      );
    });
  });

export const listarPresencas = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ sessaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Presenca[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM presencas WHERE sessao_id = ?",
        [data.sessaoId],
      );
      return rows as Presenca[];
    });
  });

// Elegibilidade por grau: compara o grau ATUAL do irmão NO CORPO da sessão
// (irmao_orgs.grau_atual) contra o grau da sessão — não mais irmaos.grau,
// que representa só o grau craft de origem do irmão (fora deste sistema).
// Sessões antigas sem corpo definido (org_id NULL, anteriores a esta
// migração) ficam sem essa checagem, já que não há corpo pra comparar.
export const togglePresenca = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ sessaoId: z.string().uuid(), irmaoId: z.string().uuid(), presente: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const [[elegivel]] = await conn.query<RowDataPacket[]>(
        `SELECT
           CASE WHEN s.org_id IS NULL THEN TRUE ELSE COALESCE(io.grau_atual, 0) >= s.grau END AS ok
         FROM sessoes s
         LEFT JOIN irmao_orgs io ON io.org_id = s.org_id AND io.irmao_id = ?
         WHERE s.id = ?`,
        [data.irmaoId, data.sessaoId],
      );
      if (!elegivel?.ok) {
        throw new Error("Este irmão não tem grau suficiente (neste corpo) para esta sessão.");
      }
      await conn.query(
        `INSERT INTO presencas (sessao_id, irmao_id, presente) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE presente = VALUES(presente)`,
        [data.sessaoId, data.irmaoId, data.presente],
      );
    });
  });
