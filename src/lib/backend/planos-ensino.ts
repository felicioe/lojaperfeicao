import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

// Planos de ensino — issue #22. Cadastro de referência (currículo por
// grau), sem vínculo com sessões/eventos importados.
const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Grau = "aprendiz" | "companheiro" | "mestre";

export type PlanoEnsino = {
  id: string;
  grau: Grau;
  ordem: number;
  titulo: string;
  conteudo: string | null;
};

export const listarPlanosEnsino = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlanoEnsino[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, grau, ordem, titulo, conteudo FROM planos_ensino ORDER BY grau, ordem, titulo",
      );
      return rows as PlanoEnsino[];
    });
  },
);

const planoSchema = z.object({
  id: z.string().uuid().nullable(),
  grau: z.enum(["aprendiz", "companheiro", "mestre"]),
  ordem: z.number().int(),
  titulo: z.string().min(1),
  conteudo: z.string().nullable(),
});

export const salvarPlanoEnsino = createServerFn({ method: "POST" })
  .validator((d: unknown) => planoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      if (data.id) {
        await conn.query(
          "UPDATE planos_ensino SET grau=?, ordem=?, titulo=?, conteudo=? WHERE id=?",
          [data.grau, data.ordem, data.titulo, data.conteudo, data.id],
        );
      } else {
        await conn.query(
          "INSERT INTO planos_ensino (grau, ordem, titulo, conteudo) VALUES (?, ?, ?, ?)",
          [data.grau, data.ordem, data.titulo, data.conteudo],
        );
      }
    });
  });

export const excluirPlanoEnsino = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM planos_ensino WHERE id = ?", [data.id]);
    });
  });
