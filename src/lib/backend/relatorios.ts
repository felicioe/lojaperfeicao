import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { listarIrmaos } from "./irmaos";

export type FrequenciaIrmao = {
  id: string;
  nome_civil: string;
  nome_simbolico: string | null;
  presencas: number;
};
export type RelatorioFrequencia = { totalSessoes: number; irmaos: FrequenciaIrmao[] };

// irmaos segue a mesma visibilidade de listarIrmaos (admin/secretario/
// tesoureiro vê todos, irmão comum só o próprio) — sessões/presenças em si
// são de leitura livre (mesma RLS original: "sessoes_select"/"presencas_select").
export const relatorioFrequencia = createServerFn({ method: "GET" }).handler(
  async (): Promise<RelatorioFrequencia> => {
    const irmaosVisiveis = await listarIrmaos();
    return comSessao(async (conn) => {
      const [[{ total }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM sessoes",
      );
      const [presencas] = await conn.query<RowDataPacket[]>(
        "SELECT irmao_id, COUNT(*) AS presencas FROM presencas WHERE presente = TRUE GROUP BY irmao_id",
      );
      const mapa = new Map(presencas.map((p) => [p.irmao_id as string, Number(p.presencas)]));
      return {
        totalSessoes: Number(total),
        irmaos: irmaosVisiveis
          .map((i) => ({
            id: i.id,
            nome_civil: i.nome_civil,
            nome_simbolico: i.nome_simbolico,
            presencas: mapa.get(i.id) ?? 0,
          }))
          .sort((a, b) => a.nome_civil.localeCompare(b.nome_civil)),
      };
    });
  },
);

// Mesma visibilidade "privilegiado ou próprio" de tesouraria-lancamentos.ts.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

export type ItemInadimplente = {
  id: string;
  irmao_id: string;
  valor: number;
  data_vencimento: string;
  competencia_mes: string | null;
  descricao: string;
  nome_civil: string;
  nome_simbolico: string | null;
};

export const relatorioInadimplentes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ hoje: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ItemInadimplente[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = ["l.is_mensalidade = TRUE", "l.pago = FALSE", "l.data_vencimento < ?"];
      const valores: unknown[] = [data.hoje];
      if (!privilegiado) {
        condicoes.push("l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.irmao_id, l.valor, l.data_vencimento, l.competencia_mes, l.descricao,
                i.nome_civil, i.nome_simbolico
         FROM lancamentos l
         JOIN irmaos i ON i.id = l.irmao_id
         WHERE ${condicoes.join(" AND ")}
         ORDER BY l.data_vencimento`,
        valores,
      );
      return rows as ItemInadimplente[];
    });
  });
