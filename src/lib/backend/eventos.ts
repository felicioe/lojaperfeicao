import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Eventos sociais/ágapes (distintos de sessões ritualísticas) — issue #20.
// RLS original (legado PHP `_eventoPublico()`): visibilidade por
// publico ('todos'|'ativos'|'org') — reproduzida abaixo no WHERE de
// listarEventos, já que não há mais RLS de banco pós-migração do
// Postgres/Supabase. Escrita admin/secretario, RSVP pelo próprio irmão.
const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Evento = {
  id: string;
  titulo: string;
  data: string;
  hora: string | null;
  local: string | null;
  descricao: string | null;
  publico: "todos" | "ativos" | "org";
  org_id: string | null;
  org_nome: string | null;
  tem_agape: boolean;
  minha_participacao: "sim" | "nao" | "talvez" | null;
  meu_agape: boolean | null;
};

export const listarEventos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Evento[]> => {
    return comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT e.id, e.titulo, e.data, e.hora, e.local, e.descricao, e.publico, e.org_id,
                o.nome AS org_nome, e.tem_agape, r.participa AS minha_participacao, r.agape AS meu_agape
         FROM eventos e
         LEFT JOIN orgs o ON o.id = e.org_id AND o.loja_id = @current_loja_id
         LEFT JOIN irmaos me ON me.usuario_id = ? AND me.loja_id = @current_loja_id
         LEFT JOIN evento_rsvps r ON r.evento_id = e.id AND r.irmao_id = me.id
                                 AND r.loja_id = @current_loja_id
         WHERE e.loja_id = @current_loja_id
           AND (e.publico = 'todos'
            OR (e.publico = 'ativos' AND EXISTS (
                  SELECT 1 FROM irmaos WHERE usuario_id = ? AND situacao = 'ativo'
                    AND loja_id = @current_loja_id))
            OR (e.publico = 'org' AND EXISTS (
                  SELECT 1 FROM irmao_orgs io
                    JOIN irmaos ii ON ii.id = io.irmao_id AND ii.loja_id = @current_loja_id
                  WHERE ii.usuario_id = ? AND io.org_id = e.org_id
                    AND io.loja_id = @current_loja_id))
            OR has_role(@current_usuario_id, 'admin')
            OR has_role(@current_usuario_id, 'secretario'))
         ORDER BY e.data DESC, e.hora DESC`,
        [usuarioId, usuarioId, usuarioId],
      );
      return rows as Evento[];
    });
  },
);

const eventoSchema = z.object({
  id: z.string().uuid().nullable(),
  titulo: z.string().min(1),
  data: z.string(),
  hora: z.string().nullable(),
  local: z.string().nullable(),
  descricao: z.string().nullable(),
  publico: z.enum(["todos", "ativos", "org"]),
  orgId: z.string().uuid().nullable(),
  temAgape: z.boolean(),
});

export const salvarEvento = createServerFn({ method: "POST" })
  .validator((d: unknown) => eventoSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.publico === "org" && !data.orgId) {
      throw new Error("Selecione o corpo maçônico para eventos restritos a um corpo.");
    }
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual, lojaId) => {
      const valores = [
        data.titulo,
        data.data,
        data.hora,
        data.local,
        data.descricao,
        data.publico,
        data.publico === "org" ? data.orgId : null,
        data.temAgape,
      ];
      if (data.id) {
        await conn.query(
          `UPDATE eventos SET titulo=?, data=?, hora=?, local=?, descricao=?, publico=?, org_id=?, tem_agape=?
           WHERE id=? AND loja_id = @current_loja_id`,
          [...valores, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "evento", data.id, null, {
          ...data,
        });
      } else {
        await conn.query(
          `INSERT INTO eventos (loja_id, titulo, data, hora, local, descricao, publico, org_id, tem_agape)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [lojaId, ...valores],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "evento", null, null, {
          ...data,
        });
      }
    });
  });

export const excluirEvento = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM eventos WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "evento", data.id, null, null);
    });
  });

const rsvpSchema = z.object({
  eventoId: z.string().uuid(),
  participa: z.enum(["sim", "nao", "talvez"]),
  agape: z.boolean(),
});

export const registrarRsvp = createServerFn({ method: "POST" })
  .validator((d: unknown) => rsvpSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [[irmao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      if (!irmao) throw new Error("Cadastro ainda não vinculado a este usuário.");
      const [[evento]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM eventos WHERE id = ? AND loja_id = @current_loja_id",
        [data.eventoId],
      );
      if (!evento) throw new Error("Evento não encontrado nesta Loja.");
      await conn.query(
        `INSERT INTO evento_rsvps (loja_id, evento_id, irmao_id, participa, agape)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE participa = VALUES(participa), agape = VALUES(agape)`,
        [lojaId, data.eventoId, irmao.id, data.participa, data.agape],
      );
    });
  });

export type RsvpEvento = {
  irmao_id: string;
  irmao_nome: string;
  participa: "sim" | "nao" | "talvez";
  agape: boolean;
};

export const listarRsvpsEvento = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ eventoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<RsvpEvento[]> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT r.irmao_id, i.nome_civil AS irmao_nome, r.participa, r.agape
         FROM evento_rsvps r JOIN irmaos i ON i.id = r.irmao_id AND i.loja_id = @current_loja_id
         WHERE r.evento_id = ? AND r.loja_id = @current_loja_id
         ORDER BY i.nome_civil`,
        [data.eventoId],
      );
      return rows as RsvpEvento[];
    });
  });
