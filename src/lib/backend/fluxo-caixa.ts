import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel, comSessao } from "./authz";
import { reconstruirDataPagamentoLote } from "./conciliacao-pareamento";

type MovimentoLote = { valor: number; tipo: "entrada" | "saida"; data_pagamento: string };

// Conciliação em lote (issue #510): c.data_conciliacao é só a data em que o
// LOTE foi processado, não quando cada fatura foi de fato paga — um lote
// pode juntar Pix de meses diferentes quitando faturas atrasadas de meses
// diferentes. Usar data_conciliacao direto (como as duas funções abaixo
// faziam) atribuía o recebimento/pagamento inteiro ao mês de processamento
// do lote, divergindo do Relatório de Recebimentos (relatorios.ts), que já
// reconstrói a data real por lançamento. Extraído pra cá porque
// obterFluxoAnteriores e listarMovimentosRealizados precisam do mesmo
// cálculo, só filtrando o período de forma diferente.
async function buscarMovimentosLoteReconstruidos(
  conn: PoolConnection,
  condicaoIrmao: string,
  valoresIrmao: unknown[],
): Promise<MovimentoLote[]> {
  const [clRows] = await conn.query<RowDataPacket[]>(
    `SELECT cl.id, cl.conciliacao_id, cl.valor_aplicado AS valor, l.tipo, c.data_conciliacao,
            COALESCE(l.data_vencimento, l.data) AS ordenacao
     FROM conciliacao_lancamentos cl
     JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id
                        AND c.status = 'ativa'
     JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = cl.loja_id
     WHERE cl.loja_id = @current_loja_id
       AND l.tipo IN ('entrada','saida') ${condicaoIrmao}`,
    valoresIrmao,
  );
  if (clRows.length === 0) return [];

  const idsConciliacao = [...new Set(clRows.map((r) => r.conciliacao_id as string))];
  const [ofxRows] = await conn.query<RowDataPacket[]>(
    `SELECT id, conciliacao_id, data, valor FROM ofx_lancamentos
     WHERE conciliacao_id IN (?) AND loja_id = @current_loja_id`,
    [idsConciliacao],
  );
  const ofxPorConciliacao = new Map<string, { id: string; data: string; valor: number }[]>();
  for (const o of ofxRows) {
    const lista = ofxPorConciliacao.get(o.conciliacao_id) ?? [];
    lista.push({ id: o.id, data: String(o.data), valor: Number(o.valor) });
    ofxPorConciliacao.set(o.conciliacao_id, lista);
  }
  const clPorConciliacao = new Map<string, RowDataPacket[]>();
  for (const r of clRows) {
    const lista = clPorConciliacao.get(r.conciliacao_id) ?? [];
    lista.push(r);
    clPorConciliacao.set(r.conciliacao_id, lista);
  }

  const resultado: MovimentoLote[] = [];
  for (const conciliacaoId of idsConciliacao) {
    const ofxDoLote = ofxPorConciliacao.get(conciliacaoId) ?? [];
    const clDoLote = clPorConciliacao.get(conciliacaoId) ?? [];
    const dataPorClId =
      ofxDoLote.length > 0
        ? reconstruirDataPagamentoLote(
            ofxDoLote,
            clDoLote.map((r) => ({
              id: r.id as string,
              ordenacao: String(r.ordenacao),
              valor: Number(r.valor),
            })),
          )
        : new Map<string, string>();
    for (const r of clDoLote) {
      const dataReal = dataPorClId.get(r.id as string) ?? (r.data_conciliacao as string);
      resultado.push({
        valor: Number(r.valor),
        tipo: r.tipo as "entrada" | "saida",
        data_pagamento: dataReal,
      });
    }
  }
  return resultado;
}

// Mesma visibilidade "privilegiado ou próprio" de tesouraria-lancamentos.ts/dashboard.ts.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

// Saldo inicial de todas as contas financeiras (sem filtro de ativo — igual
// à consulta original, que também não filtrava).
export const obterSaldoBaseContas = createServerFn({ method: "GET" }).handler(
  async (): Promise<number> => {
    return comPapel(PAPEIS_PRIVILEGIADOS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT saldo_inicial FROM contas_financeiras WHERE loja_id = @current_loja_id",
      );
      return rows.reduce((s, r) => s + Number(r.saldo_inicial), 0);
    });
  },
);

// Mesmo problema de atribuição por evento resolvido em
// listarMovimentosRealizados abaixo — o saldo acumulado antes do período
// também precisa somar pelo evento real, senão uma fatura com pagamento
// parcial antes do corte e fechamento depois "some" dos dois lados (não
// entra no saldo anterior nem no período corrente).
export const obterFluxoAnteriores = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string() }).parse(d))
  .handler(async ({ data }): Promise<number> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      // gerar_previsoes_recorrentes agora roda só via CRON diário (achado de
      // performance da auditoria geral — ver executarGeracaoPrevisoesRecorrentes
      // em tesouraria-recorrentes.ts).
      const condicaoIrmao = privilegiado
        ? ""
        : "AND l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id)";
      const valoresIrmao = privilegiado ? [] : [usuarioId];

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT valor, tipo FROM (
           SELECT (ri.valor_original + ri.valor_multa + ri.valor_juros) AS valor, l.tipo, r.data AS data_pagamento
           FROM recibo_itens ri
           JOIN recibos r ON r.id = ri.recibo_id AND r.loja_id = ri.loja_id
           JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
           WHERE ri.loja_id = @current_loja_id
             AND l.tipo IN ('entrada','saida') ${condicaoIrmao}
           UNION ALL
           SELECT l.valor, l.tipo, l.data_pagamento
           FROM lancamentos l
           WHERE l.loja_id = @current_loja_id
             AND l.pago = TRUE AND l.tipo IN ('entrada','saida')
             -- criar_parcelamento marca as faturas originais como pago=TRUE
             -- (parcelado=TRUE) sem nenhum evento de caixa — a dívida foi
             -- restruturada em parcelas, não recebida (achado #7 da
             -- auditoria financeira: entrava aqui E de novo quando cada
             -- parcela fosse paga, dobrando o valor recebido no relatório).
             AND l.parcelado = FALSE
             AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id)
             AND NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id AND co.status = 'ativa' WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id)
             ${condicaoIrmao}
         ) mov
         WHERE data_pagamento < ?`,
        [...valoresIrmao, ...valoresIrmao, data.de],
      );
      const movimentosLote = (
        await buscarMovimentosLoteReconstruidos(conn, condicaoIrmao, valoresIrmao)
      ).filter((m) => m.data_pagamento < data.de);
      return [...rows, ...movimentosLote].reduce(
        (s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)),
        0,
      );
    });
  });

export type MovimentoRealizado = {
  valor: number;
  tipo: "entrada" | "saida";
  data_pagamento: string;
};

// Mesmo problema resolvido em relatorioRecebimentos (relatorios.ts, issue
// #131): uma fatura paga em mais de um evento (parcial num mês, fechada
// noutro) não pode ser atribuída inteira ao mês do fechamento — precisa
// somar pelo evento real (recibo_itens/conciliacao_lancamentos), com um
// fallback pros pagos que não passaram por nenhum dos dois (ex.:
// recebimento avulso, conciliação legado 1:1).
export const listarMovimentosRealizados = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<MovimentoRealizado[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicaoIrmao = privilegiado
        ? ""
        : "AND l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id)";
      const valoresIrmao = privilegiado ? [] : [usuarioId];

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT valor, tipo, data_pagamento FROM (
           SELECT (ri.valor_original + ri.valor_multa + ri.valor_juros) AS valor, l.tipo, r.data AS data_pagamento
           FROM recibo_itens ri
           JOIN recibos r ON r.id = ri.recibo_id AND r.loja_id = ri.loja_id
           JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
           WHERE ri.loja_id = @current_loja_id
             AND l.tipo IN ('entrada','saida') ${condicaoIrmao}
           UNION ALL
           SELECT l.valor, l.tipo, l.data_pagamento
           FROM lancamentos l
           WHERE l.loja_id = @current_loja_id
             AND l.pago = TRUE AND l.tipo IN ('entrada','saida')
             -- criar_parcelamento marca as faturas originais como pago=TRUE
             -- (parcelado=TRUE) sem nenhum evento de caixa — a dívida foi
             -- restruturada em parcelas, não recebida (achado #7 da
             -- auditoria financeira: entrava aqui E de novo quando cada
             -- parcela fosse paga, dobrando o valor recebido no relatório).
             AND l.parcelado = FALSE
             AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id)
             AND NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id AND co.status = 'ativa' WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id)
             ${condicaoIrmao}
         ) mov
         WHERE data_pagamento >= ? AND data_pagamento <= ?
         ORDER BY data_pagamento`,
        [...valoresIrmao, ...valoresIrmao, data.de, data.ate],
      );
      const movimentosLote = (
        await buscarMovimentosLoteReconstruidos(conn, condicaoIrmao, valoresIrmao)
      ).filter((m) => m.data_pagamento >= data.de && m.data_pagamento <= data.ate);
      return [...(rows as MovimentoRealizado[]), ...movimentosLote].sort((a, b) =>
        a.data_pagamento.localeCompare(b.data_pagamento),
      );
    });
  });

export type MovimentoPendente = {
  descricao: string;
  valor: number;
  tipo: "entrada" | "saida";
  data_vencimento: string;
  recorrente_id: string | null;
};

export const listarMovimentosPendentes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ hoje: z.string(), dataLimite: z.string() }).parse(d))
  .handler(async ({ data }): Promise<MovimentoPendente[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      // gerar_previsoes_recorrentes agora roda só via CRON diário (achado de
      // performance da auditoria geral — ver executarGeracaoPrevisoesRecorrentes
      // em tesouraria-recorrentes.ts).
      const condicoes = [
        "pago = FALSE",
        "tipo IN ('entrada','saida')",
        "data_vencimento >= ?",
        "data_vencimento <= ?",
      ];
      const valores: unknown[] = [data.hoje, data.dataLimite];
      if (!privilegiado) {
        condicoes.push(
          "irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id)",
        );
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT descricao, (valor - valor_pago) AS valor, tipo, data_vencimento, recorrente_id
         FROM lancamentos
         WHERE loja_id = @current_loja_id AND ${condicoes.join(" AND ")}
         ORDER BY data_vencimento`,
        valores,
      );
      return rows as MovimentoPendente[];
    });
  });
