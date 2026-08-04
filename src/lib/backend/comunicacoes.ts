import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Comunicações internas (mural de avisos) — issue #23. Mesma filosofia de
// visibilidade de eventos.ts (publico 'todos'/'org', reproduzindo o
// `renderComunicacoes()` do legado): filtro no WHERE, não RLS de banco.
const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Comunicado = {
  id: string;
  titulo: string;
  corpo: string;
  publico: "todos" | "org";
  org_id: string | null;
  org_nome: string | null;
  criado_em: string;
  lido: boolean;
};

export const listarComunicados = createServerFn({ method: "GET" }).handler(
  async (): Promise<Comunicado[]> => {
    return comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.titulo, c.corpo, c.publico, c.org_id, o.nome AS org_nome, c.criado_em,
                (l.id IS NOT NULL) AS lido
         FROM comunicados c
         LEFT JOIN orgs o ON o.id = c.org_id
         LEFT JOIN irmaos me ON me.usuario_id = ?
         LEFT JOIN comunicado_leituras l ON l.comunicado_id = c.id AND l.irmao_id = me.id
         WHERE c.publico = 'todos'
            OR (c.publico = 'org' AND EXISTS (
                  SELECT 1 FROM irmao_orgs io JOIN irmaos ii ON ii.id = io.irmao_id
                  WHERE ii.usuario_id = ? AND io.org_id = c.org_id))
            OR has_role(@current_usuario_id, 'admin')
            OR has_role(@current_usuario_id, 'secretario')
         ORDER BY c.criado_em DESC`,
        [usuarioId, usuarioId],
      );
      return rows as Comunicado[];
    });
  },
);

export const contarComunicadosNaoLidos = createServerFn({ method: "GET" }).handler(
  async (): Promise<number> => {
    return comSessao(async (conn, usuarioId) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM comunicados c
         LEFT JOIN irmaos me ON me.usuario_id = ?
         LEFT JOIN comunicado_leituras l ON l.comunicado_id = c.id AND l.irmao_id = me.id
         WHERE l.id IS NULL
           AND (c.publico = 'todos'
                OR (c.publico = 'org' AND EXISTS (
                      SELECT 1 FROM irmao_orgs io JOIN irmaos ii ON ii.id = io.irmao_id
                      WHERE ii.usuario_id = ? AND io.org_id = c.org_id)))`,
        [usuarioId, usuarioId],
      );
      return Number(row.total ?? 0);
    });
  },
);

export const marcarComunicadoLido = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ comunicadoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      const [[irmao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM irmaos WHERE usuario_id = ?",
        [usuarioId],
      );
      if (!irmao) return;
      await conn.query(
        "INSERT IGNORE INTO comunicado_leituras (comunicado_id, irmao_id) VALUES (?, ?)",
        [data.comunicadoId, irmao.id],
      );
    });
  });

const comunicadoSchema = z.object({
  id: z.string().uuid().nullable(),
  titulo: z.string().min(1),
  corpo: z.string().min(1),
  publico: z.enum(["todos", "org"]),
  orgId: z.string().uuid().nullable(),
});

export const salvarComunicado = createServerFn({ method: "POST" })
  .validator((d: unknown) => comunicadoSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.publico === "org" && !data.orgId) {
      throw new Error("Selecione o corpo maçônico para comunicados restritos a um corpo.");
    }
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const orgId = data.publico === "org" ? data.orgId : null;
      if (data.id) {
        await conn.query(
          "UPDATE comunicados SET titulo=?, corpo=?, publico=?, org_id=? WHERE id=?",
          [data.titulo, data.corpo, data.publico, orgId, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "comunicado", data.id, null, {
          ...data,
        });
      } else {
        await conn.query(
          "INSERT INTO comunicados (titulo, corpo, publico, org_id, criado_por) VALUES (?, ?, ?, ?, ?)",
          [data.titulo, data.corpo, data.publico, orgId, usuarioIdAtual],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "comunicado", null, null, {
          ...data,
        });
      }
    });
  });

export const excluirComunicado = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM comunicados WHERE id = ?", [data.id]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "comunicado", data.id, null, null);
    });
  });
