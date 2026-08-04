import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// Grava uma entrada no log de auditoria (tabela append-only, ver migration
// 0013 — triggers bloqueiam UPDATE/DELETE mesmo por SQL direto). Chamado de
// dentro dos handlers de escrita que já têm a conexão e o usuarioId da
// sessão via comPapel/comSessao — não abre conexão própria.
export async function registrarAuditoria(
  conn: PoolConnection,
  usuarioId: string | null,
  acao: string,
  entidadeTipo: string,
  entidadeId: string | null,
  dadosAntes: unknown = null,
  dadosDepois: unknown = null,
): Promise<void> {
  await conn.query(
    `INSERT INTO auditoria (usuario_id, acao, entidade_tipo, entidade_id, dados_antes, dados_depois)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      usuarioId,
      acao,
      entidadeTipo,
      entidadeId,
      dadosAntes === null ? null : JSON.stringify(dadosAntes),
      dadosDepois === null ? null : JSON.stringify(dadosDepois),
    ],
  );
}

type Json = string | number | boolean | null | Json[] | { [chave: string]: Json };

export type EntradaAuditoria = {
  id: string;
  usuario_id: string | null;
  usuario_email: string | null;
  acao: string;
  entidade_tipo: string;
  entidade_id: string | null;
  dados_antes: Json;
  dados_depois: Json;
  criado_em: string;
};

const listarSchema = z.object({
  limite: z.number().int().positive().max(500).default(200),
});

// Só admin — tela de consulta em /administracao/auditoria.
export const listarAuditoria = createServerFn({ method: "GET" })
  .validator((d: unknown) => listarSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<EntradaAuditoria[]> => {
    return comPapel(["admin"], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT a.id, a.usuario_id, u.email AS usuario_email, a.acao, a.entidade_tipo,
                a.entidade_id, a.dados_antes, a.dados_depois, a.criado_em
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         ORDER BY a.criado_em DESC
         LIMIT ?`,
        [data.limite],
      );
      return rows as EntradaAuditoria[];
    });
  });
