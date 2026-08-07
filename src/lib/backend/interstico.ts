import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

const PAPEIS = ["admin", "secretario"];

// Janela de "próximos a ficar elegíveis" mostrada no painel — quem já
// passou do interstício também aparece (dias_restantes negativo).
const JANELA_DIAS = 60;

export type ElegibilidadeInterstico = {
  irmao_id: string;
  nome_civil: string;
  org_nome: string;
  grau_atual: number;
  nome_grau: string;
  data_elevacao: string;
  interstico_minimo_meses: number;
  data_elegivel: string;
  dias_restantes: number;
};

export const listarElegibilidadeInterstico = createServerFn({ method: "GET" }).handler(
  async (): Promise<ElegibilidadeInterstico[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT
           i.id AS irmao_id, i.nome_civil,
           o.nome AS org_nome,
           io.grau_atual,
           og.nome AS nome_grau,
           ie.data AS data_elevacao,
           og.interstico_minimo_meses,
           DATE_ADD(ie.data, INTERVAL og.interstico_minimo_meses MONTH) AS data_elegivel,
           DATEDIFF(DATE_ADD(ie.data, INTERVAL og.interstico_minimo_meses MONTH), CURDATE()) AS dias_restantes
         FROM irmaos i
         JOIN irmao_orgs io ON io.irmao_id = i.id AND io.principal = TRUE
         JOIN orgs o ON o.id = io.org_id
         JOIN orgs_graus og ON og.org_id = io.org_id AND og.grau = io.grau_atual
         JOIN irmao_elevacoes ie ON ie.irmao_id = i.id AND ie.grau = io.grau_atual
         WHERE i.situacao = 'ativo'
           AND og.interstico_minimo_meses IS NOT NULL
           AND ie.data IS NOT NULL
           AND DATE_ADD(ie.data, INTERVAL og.interstico_minimo_meses MONTH) <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
         ORDER BY data_elegivel`,
        [JANELA_DIAS],
      );
      return rows as ElegibilidadeInterstico[];
    });
  },
);
