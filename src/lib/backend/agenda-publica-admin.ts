import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Editor da agenda pública do site institucional (issue #367). Mesmo
// papel exclusivo de noticias.ts — manutenção do site é tarefa do super
// administrador (dono do domínio), não de qualquer admin/secretário de
// Loja. Continua restrito às sessões futuras da própria Loja do super
// admin (@current_loja_id), que hoje é a mesma Loja do site público.
const PAPEIS_ESCRITA = ["super_admin"];

export type ItemAgendaPublicaAdmin = {
  id: string;
  data: string;
  tipo: "ordinaria" | "magna" | "branca" | "administrativa" | "iniciacao";
  grau: number;
  nome_grau: string | null;
  corpo: string | null;
  observacao_publica: string | null;
  oculto_agenda_publica: boolean;
};

export const listarAgendaPublicaAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<ItemAgendaPublicaAdmin[]> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.data, s.tipo, s.grau, og.nome AS nome_grau, o.nome AS corpo,
                s.observacao_publica, s.oculto_agenda_publica
         FROM sessoes s
         LEFT JOIN orgs o ON o.id = s.org_id AND o.loja_id = @current_loja_id
         LEFT JOIN orgs_graus og ON og.org_id = s.org_id AND og.grau = s.grau
                                AND og.loja_id = @current_loja_id
         WHERE s.loja_id = @current_loja_id AND s.data >= CURRENT_DATE
         ORDER BY s.data ASC`,
      );
      return rows as ItemAgendaPublicaAdmin[];
    });
  },
);

const salvarSchema = z.object({
  id: z.string().uuid(),
  observacaoPublica: z.string().nullable(),
  oculto: z.boolean(),
});

export const salvarAgendaPublicaSessao = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query(
        `UPDATE sessoes SET observacao_publica = ?, oculto_agenda_publica = ?
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.observacaoPublica, data.oculto, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar",
        "agenda_publica_sessao",
        data.id,
        null,
        {
          observacaoPublica: data.observacaoPublica,
          oculto: data.oculto,
        },
      );
    });
  });
