import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";

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
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT saldo_inicial FROM contas_financeiras",
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
      const condicaoIrmao = privilegiado
        ? ""
        : "AND l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)";
      const valoresIrmao = privilegiado ? [] : [usuarioId];

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT valor, tipo FROM (
           SELECT (ri.valor_original + ri.valor_multa + ri.valor_juros) AS valor, l.tipo, r.data AS data_pagamento
           FROM recibo_itens ri
           JOIN recibos r ON r.id = ri.recibo_id
           JOIN lancamentos l ON l.id = ri.lancamento_id
           WHERE l.tipo IN ('entrada','saida') ${condicaoIrmao}
           UNION ALL
           SELECT cl.valor_aplicado AS valor, l.tipo, c.data_conciliacao AS data_pagamento
           FROM conciliacao_lancamentos cl
           JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.status = 'ativa'
           JOIN lancamentos l ON l.id = cl.lancamento_id
           WHERE l.tipo IN ('entrada','saida') ${condicaoIrmao}
           UNION ALL
           SELECT l.valor, l.tipo, l.data_pagamento
           FROM lancamentos l
           WHERE l.pago = TRUE AND l.tipo IN ('entrada','saida')
             -- criar_parcelamento marca as faturas originais como pago=TRUE
             -- (parcelado=TRUE) sem nenhum evento de caixa — a dívida foi
             -- restruturada em parcelas, não recebida (achado #7 da
             -- auditoria financeira: entrava aqui E de novo quando cada
             -- parcela fosse paga, dobrando o valor recebido no relatório).
             AND l.parcelado = FALSE
             AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id)
             AND NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl WHERE cl.lancamento_id = l.id)
             ${condicaoIrmao}
         ) mov
         WHERE data_pagamento < ?`,
        [...valoresIrmao, ...valoresIrmao, ...valoresIrmao, data.de],
      );
      return rows.reduce(
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
        : "AND l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)";
      const valoresIrmao = privilegiado ? [] : [usuarioId];

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT valor, tipo, data_pagamento FROM (
           SELECT (ri.valor_original + ri.valor_multa + ri.valor_juros) AS valor, l.tipo, r.data AS data_pagamento
           FROM recibo_itens ri
           JOIN recibos r ON r.id = ri.recibo_id
           JOIN lancamentos l ON l.id = ri.lancamento_id
           WHERE l.tipo IN ('entrada','saida') ${condicaoIrmao}
           UNION ALL
           SELECT cl.valor_aplicado AS valor, l.tipo, c.data_conciliacao AS data_pagamento
           FROM conciliacao_lancamentos cl
           JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.status = 'ativa'
           JOIN lancamentos l ON l.id = cl.lancamento_id
           WHERE l.tipo IN ('entrada','saida') ${condicaoIrmao}
           UNION ALL
           SELECT l.valor, l.tipo, l.data_pagamento
           FROM lancamentos l
           WHERE l.pago = TRUE AND l.tipo IN ('entrada','saida')
             -- criar_parcelamento marca as faturas originais como pago=TRUE
             -- (parcelado=TRUE) sem nenhum evento de caixa — a dívida foi
             -- restruturada em parcelas, não recebida (achado #7 da
             -- auditoria financeira: entrava aqui E de novo quando cada
             -- parcela fosse paga, dobrando o valor recebido no relatório).
             AND l.parcelado = FALSE
             AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id)
             AND NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl WHERE cl.lancamento_id = l.id)
             ${condicaoIrmao}
         ) mov
         WHERE data_pagamento >= ? AND data_pagamento <= ?
         ORDER BY data_pagamento`,
        [...valoresIrmao, ...valoresIrmao, ...valoresIrmao, data.de, data.ate],
      );
      return rows as MovimentoRealizado[];
    });
  });

export type MovimentoPendente = {
  descricao: string;
  valor: number;
  tipo: "entrada" | "saida";
  data_vencimento: string;
};

export const listarMovimentosPendentes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ hoje: z.string(), dataLimite: z.string() }).parse(d))
  .handler(async ({ data }): Promise<MovimentoPendente[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = [
        "pago = FALSE",
        "tipo IN ('entrada','saida')",
        "data_vencimento >= ?",
        "data_vencimento <= ?",
      ];
      const valores: unknown[] = [data.hoje, data.dataLimite];
      if (!privilegiado) {
        condicoes.push("irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT descricao, (valor - valor_pago) AS valor, tipo, data_vencimento FROM lancamentos WHERE ${condicoes.join(" AND ")} ORDER BY data_vencimento`,
        valores,
      );
      return rows as MovimentoPendente[];
    });
  });
