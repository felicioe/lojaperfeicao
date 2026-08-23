import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

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
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM cargos WHERE loja_id = @current_loja_id ORDER BY ordem",
      );
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
    return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
      // org_id é opcional aqui (NULL = cargo genérico, válido para qualquer
      // corpo), mas quando vem preenchido precisa ser um corpo desta Loja.
      if (data.org_id) {
        const [[org]] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
          [data.org_id],
        );
        if (!org) throw new Error("Corpo maçônico não encontrado nesta Loja.");
      }
      if (data.id) {
        await conn.query(
          "UPDATE cargos SET nome=?, org_id=?, ordem=? WHERE id=? AND loja_id = @current_loja_id",
          [data.nome, data.org_id, data.ordem, data.id],
        );
      } else {
        await conn.query("INSERT INTO cargos (loja_id, nome, org_id, ordem) VALUES (?, ?, ?, ?)", [
          lojaId,
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
      await conn.query("UPDATE cargos SET ativo=? WHERE id=? AND loja_id = @current_loja_id", [
        data.ativo,
        data.id,
      ]);
    });
  });

/** Cargos disponíveis para um corpo: genéricos (org_id NULL) + os específicos do corpo. */
export const listarCargosDisponiveis = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ id: string; nome: string }[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome FROM cargos WHERE ativo = TRUE AND loja_id = @current_loja_id AND (org_id = ? OR org_id IS NULL) ORDER BY ordem",
        [data.orgId],
      );
      return rows as { id: string; nome: string }[];
    });
  });

export const listarGestoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Gestao[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM gestoes WHERE loja_id = @current_loja_id ORDER BY data_inicio DESC",
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
    return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
      const [[org]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
        [data.org_id],
      );
      if (!org) throw new Error("Corpo maçônico não encontrado nesta Loja.");
      // trg_gestoes_marker_insert mantém org_id_se_ativo coerente (ver
      // mysql/migrations/0002_cadastros.sql); se já houver gestão ativa
      // para o corpo, a constraint única barra o INSERT com erro de
      // duplicidade — mesmo comportamento do índice único parcial original.
      await conn.query(
        "INSERT INTO gestoes (loja_id, org_id, nome, data_inicio, data_fim, ativo) VALUES (?, ?, ?, ?, ?, ?)",
        [lojaId, data.org_id, data.nome, data.data_inicio, data.data_fim, data.ativo],
      );
    });
  });

export const ativarGestao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ gestaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      // A procedure (0002) não conhece loja; a garantia é confirmar antes que
      // a gestão é desta Loja, já que ela só age sobre essa gestão e o corpo
      // dela. Reescrever a procedure é a issue #349.
      const [[gestao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM gestoes WHERE id = ? AND loja_id = @current_loja_id",
        [data.gestaoId],
      );
      if (!gestao) throw new Error("Gestão não encontrada nesta Loja.");
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
         JOIN cargos c ON c.id = gc.cargo_id AND c.loja_id = @current_loja_id
         JOIN irmaos i ON i.id = gc.irmao_id AND i.loja_id = @current_loja_id
         WHERE gc.gestao_id = ? AND gc.loja_id = @current_loja_id`,
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
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual, lojaId) => {
      // Os três ids vêm do request; qualquer um deles vindo de outra Loja
      // produziria um organograma que mistura tenants.
      const [[valido]] = await conn.query<RowDataPacket[]>(
        `SELECT 1 AS ok FROM gestoes g
           JOIN cargos c ON c.id = ? AND c.loja_id = @current_loja_id
           JOIN irmaos i ON i.id = ? AND i.loja_id = @current_loja_id
          WHERE g.id = ? AND g.loja_id = @current_loja_id`,
        [data.cargoId, data.irmaoId, data.gestaoId],
      );
      if (!valido) throw new Error("Gestão, cargo ou irmão não encontrado nesta Loja.");
      // A UNIQUE (gestao_id, cargo_id, irmao_id) só impede duplicar a MESMA
      // pessoa no mesmo cargo — sem esta checagem, dava pra colocar dois
      // irmãos diferentes ocupando o mesmo cargo na mesma gestão ao mesmo
      // tempo (achado da auditoria geral de bugs).
      const [[jaOcupado]] = await conn.query<RowDataPacket[]>(
        `SELECT i.nome_civil FROM gestao_cargos gc
           JOIN irmaos i ON i.id = gc.irmao_id AND i.loja_id = @current_loja_id
          WHERE gc.gestao_id = ? AND gc.cargo_id = ? AND gc.loja_id = @current_loja_id`,
        [data.gestaoId, data.cargoId],
      );
      if (jaOcupado) {
        throw new Error(`Este cargo já está ocupado por ${jaOcupado.nome_civil} nesta gestão.`);
      }
      await conn.query(
        "INSERT INTO gestao_cargos (loja_id, gestao_id, cargo_id, irmao_id) VALUES (?, ?, ?, ?)",
        [lojaId, data.gestaoId, data.cargoId, data.irmaoId],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "criar", "gestao_cargo", null, null, data);
    });
  });

export const removerGestaoCargo = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM gestao_cargos WHERE id=? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "remover", "gestao_cargo", data.id);
    });
  });
