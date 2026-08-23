import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel, comSessao } from "./authz";
import { garantirPrevisoesRecorrentes } from "./tesouraria-recorrentes";

// Mesma visibilidade de lancamentos usada em tesouraria-lancamentos.ts:
// admin/tesoureiro/secretario veem tudo, irmão comum só os seus.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

export type ContaAPagarProxima = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  tipo: "entrada" | "saida";
  recorrente_id: string | null;
};

export const listarContasAPagarProximas = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ContaAPagarProxima[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      if (privilegiado) await garantirPrevisoesRecorrentes(conn);
      const condicoes = [
        "tipo = 'saida'",
        "pago = FALSE",
        "data_vencimento >= ?",
        "data_vencimento <= ?",
      ];
      const valores: unknown[] = [data.de, data.ate];
      if (!privilegiado) {
        condicoes.push(
          "irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id)",
        );
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, descricao, (valor - valor_pago) AS valor, data_vencimento, tipo, recorrente_id FROM lancamentos
         WHERE loja_id = @current_loja_id AND ${condicoes.join(" AND ")}
         ORDER BY data_vencimento`,
        valores,
      );
      return rows as ContaAPagarProxima[];
    });
  });

export const contarMembrosAtivos = createServerFn({ method: "GET" }).handler(
  async (): Promise<number> => {
    return comPapel(PAPEIS_PRIVILEGIADOS, async (conn) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM irmaos
          WHERE loja_id = @current_loja_id AND situacao IN ('ativo', 'quite', 'irregular')`,
      );
      return Number(row.total);
    });
  },
);

export const contarSessoesMes = createServerFn({ method: "GET" }).handler(
  async (): Promise<number> => {
    return comSessao(async (conn) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM sessoes
         WHERE loja_id = @current_loja_id
           AND YEAR(data) = YEAR(CURRENT_DATE) AND MONTH(data) = MONTH(CURRENT_DATE)`,
      );
      return Number(row.total);
    });
  },
);

export type Aniversariante = { id: string; nome_civil: string; data_nascimento: string };

// Ordenado pelo dia do mês (não pela data completa) pra listar quem faz
// aniversário primeiro, independente do ano de nascimento.
export const listarAniversariantesMes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Aniversariante[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, nome_civil, data_nascimento FROM irmaos
         WHERE loja_id = @current_loja_id
           AND situacao IN ('ativo', 'quite', 'irregular')
           AND data_nascimento IS NOT NULL
           AND MONTH(data_nascimento) = MONTH(CURRENT_DATE)
         ORDER BY DAY(data_nascimento)`,
      );
      return rows as Aniversariante[];
    });
  },
);

export type ProjecaoFluxo = { somaE: number; somaS: number; delta: number };

export type ResumoContasReceber = {
  inadimplencia: number;
  quantidadeInadimplentes: number;
  recebidoMes: number;
  vencidoAte30: number;
  vencido31a60: number;
  vencidoAcima60: number;
};

export type PendenciaPrioritaria = {
  id: string;
  responsavel: string;
  descricao: string;
  data_vencimento: string;
  valor: number;
  dias_atraso: number;
};

export const obterResumoContasReceber = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResumoContasReceber> => {
    return comSessao(async (conn) => {
      const [[inadimplencia]] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(valor - valor_pago), 0) AS valor,
                COUNT(DISTINCT irmao_id) AS quantidade,
                COALESCE(SUM(CASE
                  WHEN data_vencimento >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                  THEN valor - valor_pago ELSE 0 END), 0) AS ate_30,
                COALESCE(SUM(CASE
                  WHEN data_vencimento < DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
                   AND data_vencimento >= DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY)
                  THEN valor - valor_pago ELSE 0 END), 0) AS de_31_a_60,
                COALESCE(SUM(CASE
                  WHEN data_vencimento < DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY)
                  THEN valor - valor_pago ELSE 0 END), 0) AS acima_60
         FROM lancamentos
         WHERE loja_id = @current_loja_id
           AND tipo = 'entrada' AND pago = FALSE AND data_vencimento < CURRENT_DATE`,
      );
      const [[recebido]] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(valor), 0) AS valor FROM (
           SELECT (ri.valor_original + ri.valor_multa + ri.valor_juros) AS valor
           FROM recibo_itens ri
           JOIN recibos r ON r.id = ri.recibo_id AND r.loja_id = ri.loja_id
           JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
                             AND l.tipo = 'entrada'
           WHERE ri.loja_id = @current_loja_id
             AND YEAR(r.data) = YEAR(CURRENT_DATE) AND MONTH(r.data) = MONTH(CURRENT_DATE)
           UNION ALL
           SELECT cl.valor_aplicado
           FROM conciliacao_lancamentos cl
           JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id
                              AND c.status = 'ativa'
           JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = cl.loja_id
                             AND l.tipo = 'entrada'
           WHERE cl.loja_id = @current_loja_id
             AND YEAR(c.data_conciliacao) = YEAR(CURRENT_DATE)
             AND MONTH(c.data_conciliacao) = MONTH(CURRENT_DATE)
           UNION ALL
           SELECT l.valor
           FROM lancamentos l
           WHERE l.loja_id = @current_loja_id
             AND l.tipo = 'entrada' AND l.pago = TRUE AND l.parcelado = FALSE
             AND YEAR(l.data_pagamento) = YEAR(CURRENT_DATE)
             AND MONTH(l.data_pagamento) = MONTH(CURRENT_DATE)
             AND NOT EXISTS (
               SELECT 1 FROM recibo_itens ri
               WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id
             )
             AND NOT EXISTS (
               SELECT 1 FROM conciliacao_lancamentos cl
               JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id
                                  AND c.status = 'ativa'
               WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id
             )
         ) recebimentos`,
      );
      return {
        inadimplencia: Number(inadimplencia.valor),
        quantidadeInadimplentes: Number(inadimplencia.quantidade),
        recebidoMes: Number(recebido.valor),
        vencidoAte30: Number(inadimplencia.ate_30),
        vencido31a60: Number(inadimplencia.de_31_a_60),
        vencidoAcima60: Number(inadimplencia.acima_60),
      };
    });
  },
);

export const obterMediaDespesasMensais = createServerFn({ method: "GET" }).handler(
  async (): Promise<number> => {
    return comPapel(PAPEIS_PRIVILEGIADOS, async (conn) => {
      // Divide pela quantidade de meses que REALMENTE têm despesa paga na
      // janela, não por um "3" fixo — numa loja recém-criada (onboarding,
      // issue #340) com só 1 mês de histórico, dividir por 3 subestimava a
      // média em até 3x (achado da auditoria geral de bugs).
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(
           SUM(CASE WHEN valor_pago > 0 THEN valor_pago ELSE valor END)
             / NULLIF(COUNT(DISTINCT DATE_FORMAT(data_pagamento, '%Y-%m')), 0),
           0
         ) AS media
         FROM lancamentos
         WHERE loja_id = @current_loja_id
           AND tipo = 'saida'
           AND pago = TRUE
           AND data_pagamento >= DATE_SUB(CURRENT_DATE, INTERVAL 3 MONTH)`,
      );
      return Number(row.media);
    });
  },
);

export const listarPendenciasPrioritarias = createServerFn({ method: "GET" }).handler(
  async (): Promise<PendenciaPrioritaria[]> => {
    return comPapel(PAPEIS_PRIVILEGIADOS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id,
                COALESCE(i.nome_civil, 'Não identificado') AS responsavel,
                l.descricao,
                l.data_vencimento,
                (l.valor - l.valor_pago) AS valor,
                DATEDIFF(CURRENT_DATE, l.data_vencimento) AS dias_atraso
         FROM lancamentos l
         LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
         WHERE l.loja_id = @current_loja_id
           AND l.tipo = 'entrada'
           AND l.pago = FALSE
           AND l.data_vencimento < CURRENT_DATE
         ORDER BY l.data_vencimento ASC, l.valor DESC
         LIMIT 5`,
      );
      return rows.map((row) => ({
        id: String(row.id),
        responsavel: String(row.responsavel),
        descricao: String(row.descricao),
        data_vencimento: String(row.data_vencimento),
        valor: Number(row.valor),
        dias_atraso: Number(row.dias_atraso),
      }));
    });
  },
);

export const obterProjecaoFluxo = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ProjecaoFluxo> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      if (privilegiado) await garantirPrevisoesRecorrentes(conn);
      const condicoes = ["pago = FALSE", "data_vencimento >= ?", "data_vencimento <= ?"];
      const valores: unknown[] = [data.de, data.ate];
      if (!privilegiado) {
        condicoes.push(
          "irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id)",
        );
        valores.push(usuarioId);
      }
      const where = condicoes.join(" AND ");
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT tipo, (valor - valor_pago) AS valor FROM lancamentos
          WHERE loja_id = @current_loja_id AND tipo IN ('entrada','saida') AND ${where}`,
        valores,
      );
      let somaE = 0;
      let somaS = 0;
      for (const r of rows) {
        if (r.tipo === "entrada") somaE += Number(r.valor);
        else somaS += Number(r.valor);
      }
      return { somaE, somaS, delta: somaE - somaS };
    });
  });
