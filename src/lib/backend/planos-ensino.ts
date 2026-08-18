import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

// Planos de ensino — issue #22. Cadastro de referência (currículo por
// grau), sem vínculo com sessões/eventos importados.
//
// grau é numérico (graus filosóficos, ver migração 0019 pra sessões e
// 0022 pra esta tabela — este sistema não tem loja simbólica). org_id
// nullable = plano genérico, não específico de um corpo.
const PAPEIS_ESCRITA = ["admin", "secretario"];

export type PlanoEnsino = {
  id: string;
  grau: number;
  org_id: string | null;
  org_nome: string | null;
  ordem: number;
  titulo: string;
  conteudo: string | null;
};

export const listarPlanosEnsino = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlanoEnsino[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT pe.id, pe.grau, pe.org_id, o.nome AS org_nome, pe.ordem, pe.titulo, pe.conteudo
         FROM planos_ensino pe
         LEFT JOIN orgs o ON o.id = pe.org_id AND o.loja_id = @current_loja_id
         WHERE pe.loja_id = @current_loja_id
         ORDER BY pe.grau, pe.ordem, pe.titulo`,
      );
      return rows as PlanoEnsino[];
    });
  },
);

const planoSchema = z.object({
  id: z.string().uuid().nullable(),
  grau: z.number().int().positive(),
  orgId: z.string().uuid().nullable(),
  ordem: z.number().int(),
  titulo: z.string().min(1),
  conteudo: z.string().nullable(),
});

export const salvarPlanoEnsino = createServerFn({ method: "POST" })
  .validator((d: unknown) => planoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
      if (data.orgId) {
        const [[org]] = await conn.query<RowDataPacket[]>(
          "SELECT grau_min, grau_max FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
          [data.orgId],
        );
        if (!org) throw new Error("Corpo maçônico não encontrado nesta Loja.");
        if (data.grau < org.grau_min || data.grau > org.grau_max) {
          throw new Error(`Grau fora da faixa do corpo (${org.grau_min}–${org.grau_max}).`);
        }
      }
      if (data.id) {
        await conn.query(
          "UPDATE planos_ensino SET grau=?, org_id=?, ordem=?, titulo=?, conteudo=? WHERE id=? AND loja_id = @current_loja_id",
          [data.grau, data.orgId, data.ordem, data.titulo, data.conteudo, data.id],
        );
      } else {
        await conn.query(
          "INSERT INTO planos_ensino (loja_id, grau, org_id, ordem, titulo, conteudo) VALUES (?, ?, ?, ?, ?, ?)",
          [lojaId, data.grau, data.orgId, data.ordem, data.titulo, data.conteudo],
        );
      }
    });
  });

export const excluirPlanoEnsino = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM planos_ensino WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
    });
  });
