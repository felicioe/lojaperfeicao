import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { listarIrmaos } from "./irmaos";

export type FrequenciaIrmao = { id: string; nome_civil: string; nome_simbolico: string | null; presencas: number };
export type RelatorioFrequencia = { totalSessoes: number; irmaos: FrequenciaIrmao[] };

// irmaos segue a mesma visibilidade de listarIrmaos (admin/secretario/
// tesoureiro vê todos, irmão comum só o próprio) — sessões/presenças em si
// são de leitura livre (mesma RLS original: "sessoes_select"/"presencas_select").
export const relatorioFrequencia = createServerFn({ method: "GET" }).handler(
  async (): Promise<RelatorioFrequencia> => {
    const irmaosVisiveis = await listarIrmaos();
    return comSessao(async (conn) => {
      const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM sessoes");
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
