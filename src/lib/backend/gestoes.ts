import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

// RLS original (mysql/migrations/0002_cadastros.sql): SELECT livre para
// autenticados; escrita (cargos/gestoes/gestao_cargos) admin OU secretario.
const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Cargo = {
  id: string;
  org_id: string | null;
  nome: string;
  ordem: number;
  ativo: boolean;
};
export type Gestao = {
  id: string;
  org_id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
};
export type CargoOcupado = {
  id: string;
  cargo_id: string;
  irmao_id: string;
  cargos: { nome: string } | null;
  irmaos: { nome_civil: string } | null;
};

export const listarCargos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Cargo[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM cargos ORDER BY ordem");
      return rows as Cargo[];
    });
  },
);

const cargoSchema = z.object({
  id: z.string().uuid().nullable(),
  nome: z.string().min(1),
  org_id: z.string().uuid().nullable(),
  ordem: z.number().int(),
});

export const salvarCargo = createServerFn({ method: "POST" })
  .validator((d: unknown) => cargoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      if (data.id) {
        await conn.query("UPDATE cargos SET nome=?, org_id=?, ordem=? WHERE id=?", [
          data.nome,
          data.org_id,
          data.ordem,
          data.id,
        ]);
      } else {
        await conn.query("INSERT INTO cargos (nome, org_id, ordem) VALUES (?, ?, ?)", [
          data.nome,
          data.org_id,
          data.ordem,
        ]);
      }
    });
  });

export const alternarAtivoCargo = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("UPDATE cargos SET ativo=? WHERE id=?", [data.ativo, data.id]);
    });
  });

/** Cargos disponíveis para um corpo: genéricos (org_id NULL) + os específicos do corpo. */
export const listarCargosDisponiveis = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ id: string; nome: string }[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome FROM cargos WHERE ativo = TRUE AND (org_id = ? OR org_id IS NULL) ORDER BY ordem",
        [data.orgId],
      );
      return rows as { id: string; nome: string }[];
    });
  });

export const listarGestoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Gestao[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM gestoes ORDER BY data_inicio DESC",
      );
      return rows as Gestao[];
    });
  },
);

const criarGestaoSchema = z.object({
  org_id: z.string().uuid(),
  nome: z.string().min(1),
  data_inicio: z.string(),
  data_fim: z.string(),
  ativo: z.boolean(),
});

export const criarGestao = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarGestaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      // trg_gestoes_marker_insert mantém org_id_se_ativo coerente (ver
      // mysql/migrations/0002_cadastros.sql); se já houver gestão ativa
      // para o corpo, a constraint única barra o INSERT com erro de
      // duplicidade — mesmo comportamento do índice único parcial original.
      await conn.query(
        "INSERT INTO gestoes (org_id, nome, data_inicio, data_fim, ativo) VALUES (?, ?, ?, ?, ?)",
        [data.org_id, data.nome, data.data_inicio, data.data_fim, data.ativo],
      );
    });
  });

export const ativarGestao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ gestaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn) => {
      await conn.query("CALL ativar_gestao(?)", [data.gestaoId]);
    });
  });

export const listarGestaoCargos = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ gestaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CargoOcupado[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT gc.id, gc.cargo_id, gc.irmao_id, c.nome AS cargo_nome, i.nome_civil
         FROM gestao_cargos gc
         JOIN cargos c ON c.id = gc.cargo_id
         JOIN irmaos i ON i.id = gc.irmao_id
         WHERE gc.gestao_id = ?`,
        [data.gestaoId],
      );
      return rows.map((r) => ({
        id: r.id,
        cargo_id: r.cargo_id,
        irmao_id: r.irmao_id,
        cargos: { nome: r.cargo_nome },
        irmaos: { nome_civil: r.nome_civil },
      })) as CargoOcupado[];
    });
  });

export const criarGestaoCargo = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        gestaoId: z.string().uuid(),
        cargoId: z.string().uuid(),
        irmaoId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query(
        "INSERT INTO gestao_cargos (gestao_id, cargo_id, irmao_id) VALUES (?, ?, ?)",
        [data.gestaoId, data.cargoId, data.irmaoId],
      );
    });
  });

export const removerGestaoCargo = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM gestao_cargos WHERE id=?", [data.id]);
    });
  });
