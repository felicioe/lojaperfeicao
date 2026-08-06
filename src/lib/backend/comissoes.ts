import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Comissao = {
  id: string;
  org_id: string;
  nome: string;
  ativo: boolean;
};

export type ComissaoMembro = {
  id: string;
  comissao_id: string;
  papel: string;
  irmao_id: string;
  nome_civil: string;
};

export const PAPEIS_SUGERIDOS = ["Presidente", "Suplente", "Secretário", "Membro"];

export const listarComissoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Comissao[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM comissoes ORDER BY nome");
      return rows as Comissao[];
    });
  },
);

const criarComissaoSchema = z.object({
  orgId: z.string().uuid(),
  nome: z.string().min(1),
});

export const criarComissao = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarComissaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("INSERT INTO comissoes (org_id, nome) VALUES (?, ?)", [
        data.orgId,
        data.nome,
      ]);
    });
  });

export const alternarAtivoComissao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("UPDATE comissoes SET ativo=? WHERE id=?", [data.ativo, data.id]);
    });
  });

export const excluirComissao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM comissoes WHERE id=?", [data.id]);
    });
  });

export const listarComissaoMembros = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ comissaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ComissaoMembro[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT cm.id, cm.comissao_id, cm.papel, cm.irmao_id, i.nome_civil
         FROM comissao_membros cm
         JOIN irmaos i ON i.id = cm.irmao_id
         WHERE cm.comissao_id = ?
         ORDER BY FIELD(cm.papel, 'Presidente', 'Suplente', 'Secretário'), cm.papel`,
        [data.comissaoId],
      );
      return rows as ComissaoMembro[];
    });
  });

const criarComissaoMembroSchema = z.object({
  comissaoId: z.string().uuid(),
  papel: z.string().min(1),
  irmaoId: z.string().uuid(),
});

export const criarComissaoMembro = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarComissaoMembroSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query(
        "INSERT INTO comissao_membros (comissao_id, papel, irmao_id) VALUES (?, ?, ?)",
        [data.comissaoId, data.papel, data.irmaoId],
      );
    });
  });

export const removerComissaoMembro = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM comissao_membros WHERE id=?", [data.id]);
    });
  });
