import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// RLS original (lancamentos_contabeis/itens, mysql/migrations/0003):
// SELECT admin/tesoureiro/secretario. Sem escrita direta — só a procedure
// registrar_lancamento_contabil (chamada por outras procedures de negócio).
const PAPEIS = ["admin", "tesoureiro", "secretario"];

export type ContaAnalitica = { id: string; codigo: string; nome: string };

export const listarContasAnaliticas = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaAnalitica[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, codigo, nome FROM plano_contas
          WHERE loja_id = @current_loja_id AND analitica = TRUE
          ORDER BY codigo`,
      );
      return rows as ContaAnalitica[];
    });
  },
);

// ---------- Razão contábil ----------
export const obterSaldoAnteriorConta = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid(), antesDe: z.string() }).parse(d))
  .handler(async ({ data }): Promise<number> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT i.tipo, i.valor FROM lancamentos_contabeis_itens i
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
         WHERE i.loja_id = @current_loja_id AND i.conta_id = ? AND lc.data < ?`,
        [data.contaId, data.antesDe],
      );
      return rows.reduce(
        (s, i) => s + (i.tipo === "debito" ? Number(i.valor) : -Number(i.valor)),
        0,
      );
    });
  });

export type ItemRazao = {
  id: string;
  tipo: "debito" | "credito";
  valor: number;
  descricao: string | null;
  contraparte: string | null;
  contraparte_tipo: "irmao" | "terceiro" | null;
  // Conta(s) do outro lado da partida dobrada do MESMO lançamento contábil
  // (issue #403) — se esta linha está em débito, é a(s) conta(s) creditada(s)
  // no mesmo lancamento_id, e vice-versa. Quase sempre 1 só, mas um
  // lançamento pode ter mais de duas pernas (ex.: rateio) — concatenado
  // quando houver mais de uma.
  contrapartida: string | null;
  lancamentos_contabeis: { data: string; descricao: string };
};

export const listarItensRazao = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ contaId: z.string().uuid(), de: z.string(), ate: z.string() }).parse(d),
  )
  .handler(async ({ data }): Promise<ItemRazao[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT i.id, i.tipo, i.valor, i.descricao, lc.data, lc.descricao AS lc_descricao,
                COALESCE(irm.nome_civil, terc.nome) AS contraparte,
                CASE
                  WHEN irm.id IS NOT NULL THEN 'irmao'
                  WHEN terc.id IS NOT NULL THEN 'terceiro'
                  ELSE NULL
                END AS contraparte_tipo,
                (SELECT GROUP_CONCAT(DISTINCT CONCAT(pc2.codigo, ' — ', pc2.nome)
                          ORDER BY pc2.codigo SEPARATOR '; ')
                   FROM lancamentos_contabeis_itens i2
                   JOIN plano_contas pc2 ON pc2.id = i2.conta_id AND pc2.loja_id = i2.loja_id
                  WHERE i2.lancamento_id = i.lancamento_id AND i2.loja_id = i.loja_id
                    AND i2.tipo <> i.tipo) AS contrapartida
         FROM lancamentos_contabeis_itens i
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
         LEFT JOIN lancamentos l ON l.id = lc.origem_id AND l.loja_id = lc.loja_id
         LEFT JOIN recibos r
           ON r.id = lc.origem_id AND r.loja_id = lc.loja_id
          AND lc.origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial')
         LEFT JOIN parcelamentos p
           ON p.id = lc.origem_id AND p.loja_id = lc.loja_id AND lc.origem_tipo = 'parcelamento'
         LEFT JOIN irmaos irm ON irm.id = COALESCE(r.irmao_id, p.irmao_id, l.irmao_id)
                             AND irm.loja_id = lc.loja_id
         LEFT JOIN terceiros terc ON terc.id = l.terceiro_id AND terc.loja_id = lc.loja_id
         WHERE i.loja_id = @current_loja_id AND i.conta_id = ? AND lc.data >= ? AND lc.data <= ?
         ORDER BY lc.data, lc.criado_em`,
        [data.contaId, data.de, data.ate],
      );
      return rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        valor: r.valor,
        descricao: r.descricao,
        contraparte: r.contraparte,
        contraparte_tipo: r.contraparte_tipo,
        contrapartida: r.contrapartida,
        lancamentos_contabeis: {
          data: r.data,
          descricao: r.lc_descricao,
        },
      }));
    });
  });

// Razão de várias contas de uma vez (issue seguinte à #403) — "Tudo" ou um
// grupo de contas em vez de precisar abrir uma de cada vez. Cada conta
// mantém sua própria lista de lançamentos e seu próprio saldo corrente —
// nunca soma saldo de contas diferentes junto (débito de Caixa não é a
// mesma coisa que débito de Despesas), então o resultado é "N razões, um
// atrás do outro", não uma tabela só. Contas sem nenhum saldo anterior e
// sem nenhum lançamento no período ficam de fora — não tem sentido mostrar
// uma conta totalmente parada.
export type ContaComRazao = {
  contaId: string;
  codigo: string;
  nome: string;
  tipo: "ativo" | "passivo" | "patrimonio_liquido" | "receita" | "despesa";
  saldoAnterior: number;
  itens: ItemRazao[];
};

export const listarItensRazaoVariasContas = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({
        contaIds: z.array(z.string().uuid()).nullable(),
        de: z.string(),
        ate: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ContaComRazao[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [contasRows] = await conn.query<RowDataPacket[]>(
        data.contaIds
          ? `SELECT id, codigo, nome, tipo FROM plano_contas
             WHERE loja_id = @current_loja_id AND analitica = TRUE AND id IN (?)`
          : `SELECT id, codigo, nome, tipo FROM plano_contas
             WHERE loja_id = @current_loja_id AND analitica = TRUE`,
        data.contaIds ? [data.contaIds] : [],
      );
      if (contasRows.length === 0) return [];
      const ids = contasRows.map((c) => c.id);

      const [saldosRows] = await conn.query<RowDataPacket[]>(
        `SELECT i.conta_id, i.tipo, i.valor FROM lancamentos_contabeis_itens i
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
         WHERE i.loja_id = @current_loja_id AND i.conta_id IN (?) AND lc.data < ?`,
        [ids, data.de],
      );
      const saldoAnteriorPorConta = new Map<string, number>();
      for (const r of saldosRows) {
        const atual = saldoAnteriorPorConta.get(r.conta_id) ?? 0;
        saldoAnteriorPorConta.set(
          r.conta_id,
          atual + (r.tipo === "debito" ? Number(r.valor) : -Number(r.valor)),
        );
      }

      const [itensRows] = await conn.query<RowDataPacket[]>(
        `SELECT i.id, i.conta_id, i.tipo, i.valor, i.descricao, lc.data, lc.descricao AS lc_descricao,
                COALESCE(irm.nome_civil, terc.nome) AS contraparte,
                CASE
                  WHEN irm.id IS NOT NULL THEN 'irmao'
                  WHEN terc.id IS NOT NULL THEN 'terceiro'
                  ELSE NULL
                END AS contraparte_tipo,
                (SELECT GROUP_CONCAT(DISTINCT CONCAT(pc2.codigo, ' — ', pc2.nome)
                          ORDER BY pc2.codigo SEPARATOR '; ')
                   FROM lancamentos_contabeis_itens i2
                   JOIN plano_contas pc2 ON pc2.id = i2.conta_id AND pc2.loja_id = i2.loja_id
                  WHERE i2.lancamento_id = i.lancamento_id AND i2.loja_id = i.loja_id
                    AND i2.tipo <> i.tipo) AS contrapartida
         FROM lancamentos_contabeis_itens i
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
         LEFT JOIN lancamentos l ON l.id = lc.origem_id AND l.loja_id = lc.loja_id
         LEFT JOIN recibos r
           ON r.id = lc.origem_id AND r.loja_id = lc.loja_id
          AND lc.origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial')
         LEFT JOIN parcelamentos p
           ON p.id = lc.origem_id AND p.loja_id = lc.loja_id AND lc.origem_tipo = 'parcelamento'
         LEFT JOIN irmaos irm ON irm.id = COALESCE(r.irmao_id, p.irmao_id, l.irmao_id)
                             AND irm.loja_id = lc.loja_id
         LEFT JOIN terceiros terc ON terc.id = l.terceiro_id AND terc.loja_id = lc.loja_id
         WHERE i.loja_id = @current_loja_id AND i.conta_id IN (?) AND lc.data >= ? AND lc.data <= ?
         ORDER BY lc.data, lc.criado_em`,
        [ids, data.de, data.ate],
      );
      const itensPorConta = new Map<string, ItemRazao[]>();
      for (const r of itensRows) {
        const lista = itensPorConta.get(r.conta_id) ?? [];
        lista.push({
          id: r.id,
          tipo: r.tipo,
          valor: r.valor,
          descricao: r.descricao,
          contraparte: r.contraparte,
          contraparte_tipo: r.contraparte_tipo,
          contrapartida: r.contrapartida,
          lancamentos_contabeis: { data: r.data, descricao: r.lc_descricao },
        });
        itensPorConta.set(r.conta_id, lista);
      }

      return (contasRows as { id: string; codigo: string; nome: string; tipo: string }[])
        .map((c) => ({
          contaId: c.id,
          codigo: c.codigo,
          nome: c.nome,
          tipo: c.tipo as ContaComRazao["tipo"],
          saldoAnterior: saldoAnteriorPorConta.get(c.id) ?? 0,
          itens: itensPorConta.get(c.id) ?? [],
        }))
        .filter((c) => c.itens.length > 0)
        .sort((a, b) => a.codigo.localeCompare(b.codigo));
    });
  });

// ---------- Diário contábil ----------
export type LancamentoDiario = {
  id: string;
  data: string;
  descricao: string;
  // Nome do Irmão relacionado ao lançamento, quando cabe (issue #404) —
  // mesmo caminho de resolução já usado no Razão (listarItensRazao):
  // lc.origem_id aponta pra um recibo, parcelamento ou lançamento
  // financeiro, e cada um desses tem seu próprio irmao_id.
  irmao_nome: string | null;
  lancamentos_contabeis_itens: {
    id: string;
    tipo: "debito" | "credito";
    valor: number;
    descricao: string | null;
    plano_contas: { codigo: string; nome: string } | null;
  }[];
};

export const listarLancamentosDiario = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({
        de: z.string(),
        ate: z.string(),
        irmaoId: z.string().uuid().nullable(),
        contaId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<LancamentoDiario[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const condicoes = ["lc.loja_id = @current_loja_id", "lc.data >= ?", "lc.data <= ?"];
      const valores: unknown[] = [data.de, data.ate];
      if (data.irmaoId) {
        condicoes.push("irm.id = ?");
        valores.push(data.irmaoId);
      }
      if (data.contaId) {
        condicoes.push(
          "EXISTS (SELECT 1 FROM lancamentos_contabeis_itens i2 WHERE i2.lancamento_id = lc.id AND i2.loja_id = lc.loja_id AND i2.conta_id = ?)",
        );
        valores.push(data.contaId);
      }
      const [lancamentos] = await conn.query<RowDataPacket[]>(
        `SELECT lc.id, lc.data, lc.descricao, irm.nome_civil AS irmao_nome
         FROM lancamentos_contabeis lc
         LEFT JOIN lancamentos l ON l.id = lc.origem_id AND l.loja_id = lc.loja_id
         LEFT JOIN recibos r
           ON r.id = lc.origem_id AND r.loja_id = lc.loja_id
          AND lc.origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial')
         LEFT JOIN parcelamentos p
           ON p.id = lc.origem_id AND p.loja_id = lc.loja_id AND lc.origem_tipo = 'parcelamento'
         LEFT JOIN irmaos irm ON irm.id = COALESCE(r.irmao_id, p.irmao_id, l.irmao_id)
                             AND irm.loja_id = lc.loja_id
          WHERE ${condicoes.join(" AND ")}
          ORDER BY lc.data, lc.criado_em`,
        valores,
      );
      if (lancamentos.length === 0) return [];

      const ids = lancamentos.map((l) => l.id);
      const [itens] = await conn.query<RowDataPacket[]>(
        `SELECT i.id, i.lancamento_id, i.tipo, i.valor, i.descricao, pc.codigo, pc.nome
         FROM lancamentos_contabeis_itens i
         LEFT JOIN plano_contas pc ON pc.id = i.conta_id AND pc.loja_id = i.loja_id
         WHERE i.loja_id = @current_loja_id AND i.lancamento_id IN (?)`,
        [ids],
      );
      const itensPorLancamento = new Map<string, LancamentoDiario["lancamentos_contabeis_itens"]>();
      for (const it of itens) {
        const lista = itensPorLancamento.get(it.lancamento_id) ?? [];
        lista.push({
          id: it.id,
          tipo: it.tipo,
          valor: it.valor,
          descricao: it.descricao,
          plano_contas: it.codigo ? { codigo: it.codigo, nome: it.nome } : null,
        });
        itensPorLancamento.set(it.lancamento_id, lista);
      }
      return lancamentos.map((l) => ({
        id: l.id,
        data: l.data,
        descricao: l.descricao,
        irmao_nome: l.irmao_nome,
        lancamentos_contabeis_itens: itensPorLancamento.get(l.id) ?? [],
      }));
    });
  });

// ---------- DRE / Balancete / DRE Orçado — item bruto compartilhado ----------
export type ItemContabilBruto = {
  tipo: "debito" | "credito";
  valor: number;
  conta_id: string;
  codigo: string;
  nome: string;
  conta_tipo: "ativo" | "passivo" | "patrimonio_liquido" | "receita" | "despesa";
};

export const listarItensContabeisPeriodo = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string().nullable(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ItemContabilBruto[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const condicoes = ["lc.data <= ?"];
      const valores: unknown[] = [data.ate];
      if (data.de) {
        condicoes.push("lc.data >= ?");
        valores.push(data.de);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT i.tipo, i.valor, pc.id AS conta_id, pc.codigo, pc.nome, pc.tipo AS conta_tipo
         FROM lancamentos_contabeis_itens i
         JOIN plano_contas pc ON pc.id = i.conta_id AND pc.loja_id = i.loja_id
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
         WHERE i.loja_id = @current_loja_id AND ${condicoes.join(" AND ")}`,
        valores,
      );
      return rows as ItemContabilBruto[];
    });
  });

// ---------- Auditoria contábil ----------
export type SaldoPlanoContas = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  total_debito: number;
  total_credito: number;
  saldo_devedor: number;
};

// A consulta abaixo era `SELECT * FROM v_saldo_plano_contas`. A view soma
// TODAS as Lojas e não expõe loja_id, então não dá pra filtrar de fora dela:
// o saldo de cada conta vinha com o movimento das outras Lojas somado — um
// número errado e plausível, que é o pior tipo. Reescrita inline com o mesmo
// cálculo, agora escopada. A view em si continua existindo pra ser corrigida
// (ou removida) na #349; o sistema simplesmente não depende mais dela.
export const listarSaldoPlanoContas = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ de: z.string().nullable(), ate: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<SaldoPlanoContas[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const condicoesData: string[] = [];
      const valoresData: unknown[] = [];
      if (data.de) {
        condicoesData.push("lc.data >= ?");
        valoresData.push(data.de);
      }
      if (data.ate) {
        condicoesData.push("lc.data <= ?");
        valoresData.push(data.ate);
      }
      const filtroData = condicoesData.length > 0 ? `AND ${condicoesData.join(" AND ")}` : "";
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.codigo, c.nome, c.tipo,
                COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS total_debito,
                COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS total_credito,
                COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0)
                  - COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS saldo_devedor
           FROM plano_contas c
           LEFT JOIN lancamentos_contabeis_itens i ON i.conta_id = c.id AND i.loja_id = c.loja_id
           LEFT JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
          WHERE c.loja_id = @current_loja_id AND c.analitica = TRUE ${filtroData}
          GROUP BY c.id, c.codigo, c.nome, c.tipo
          ORDER BY c.codigo`,
        valoresData,
      );
      return rows as SaldoPlanoContas[];
    });
  });

export type AuditoriaDesbalanceado = {
  lancamento_id: string;
  data: string;
  descricao: string;
  origem_tipo: string | null;
  origem_id: string | null;
  total_debito: number;
  total_credito: number;
  diferenca: number;
};

export const listarAuditoriaDesbalanceados = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ de: z.string().nullable(), ate: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<AuditoriaDesbalanceado[]> => {
    return comPapel(PAPEIS, async (conn) => {
      // Mesmo caso da v_saldo_plano_contas acima: a view não expõe loja_id e
      // varre todas as Lojas, então a tela de auditoria contábil de uma Loja
      // apontaria lançamento desbalanceado de outra — sem nem existir tela
      // onde investigar. Reescrita inline com o mesmo cálculo, escopada.
      const condicoes = ["l.loja_id = @current_loja_id"];
      const valores: unknown[] = [];
      if (data.de) {
        condicoes.push("l.data >= ?");
        valores.push(data.de);
      }
      if (data.ate) {
        condicoes.push("l.data <= ?");
        valores.push(data.ate);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id AS lancamento_id, l.data, l.descricao, l.origem_tipo, l.origem_id,
                COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS total_debito,
                COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS total_credito,
                COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0)
                  - COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS diferenca
           FROM lancamentos_contabeis l
           JOIN lancamentos_contabeis_itens i ON i.lancamento_id = l.id AND i.loja_id = l.loja_id
          WHERE ${condicoes.join(" AND ")}
          GROUP BY l.id, l.data, l.descricao, l.origem_tipo, l.origem_id
         HAVING total_debito <> total_credito`,
        valores,
      );
      return rows as AuditoriaDesbalanceado[];
    });
  });

// ---------- Conferência Contábil x Financeira (issue #416) ----------
// Nasceu do incidente de agosto/2026: um script de backfill inseriu direto
// em lancamentos_contabeis/itens (sem passar pela procedure), duplicando
// dezenas de lançamentos sem que nenhuma tela detectasse. O saldo contábil
// só foi descoberto errado comparando, mês a mês, o extrato bancário real
// contra a soma dos lançamentos contábeis — esta tela automatiza exatamente
// essa comparação, pra não depender de novo de uma conferência manual.
//
// "Movimento financeiro" (o que de fato entrou/saiu da conta, pelo regime
// de caixa) é a mesma soma de eventos que sustenta v_saldo_contas/saldo_atual
// (migração 0096): recibo, conciliação em lote, linha de OFX conciliada
// direto (sem lote) e lançamento avulso pago sem nenhum desses vínculos —
// cada evento contado uma única vez, na fonte mais específica disponível.
// O saldo de abertura entra como mais um evento, na mesma data do
// lançamento contábil 'saldo_abertura' daquela conta (união simétrica: se
// uma conta tem saldo_inicial mas ninguém lançou a abertura contábil dela,
// o evento financeiro não aparece e a diferença fica evidente pra sempre —
// é o mesmo tipo de furo desta investigação, agora visível na tela).
//
// "Movimento contábil" é a soma de débito−crédito, por mês, dos itens
// lançados na conta do plano de contas vinculada (contas_financeiras.plano_conta_id).
const EVENTOS_FINANCEIROS_SQL = `
    SELECT r.conta_financeira_id, r.loja_id, r.data, r.valor_total AS valor_sinal
    FROM recibos r

    UNION ALL

    SELECT c2.conta_financeira_id, c2.loja_id, c2.data_conciliacao AS data,
           CASE WHEN l.tipo = 'entrada' THEN cl.valor_aplicado ELSE -cl.valor_aplicado END AS valor_sinal
    FROM conciliacoes c2
    JOIN conciliacao_lancamentos cl ON cl.conciliacao_id = c2.id AND cl.loja_id = c2.loja_id
    JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = c2.loja_id
    WHERE c2.status = 'ativa'

    UNION ALL

    SELECT o.conta_financeira_id, o.loja_id, o.data,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END AS valor_sinal
    FROM ofx_lancamentos o
    JOIN lancamentos l ON l.id = o.lancamento_id AND l.loja_id = o.loja_id
    WHERE o.conciliado = TRUE AND o.conciliacao_id IS NULL

    UNION ALL

    SELECT l.conta_id AS conta_financeira_id, l.loja_id, COALESCE(l.data_pagamento, l.data) AS data,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END AS valor_sinal
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.conta_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id)
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o
         WHERE o.lancamento_id = l.id AND o.loja_id = l.loja_id AND o.conciliacao_id IS NULL
      )

    UNION ALL

    SELECT l.conta_destino_id AS conta_financeira_id, l.loja_id, COALESCE(l.data_pagamento, l.data) AS data,
           l.valor AS valor_sinal
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.tipo = 'transferencia' AND l.conta_destino_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id)
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o
         WHERE o.lancamento_id = l.id AND o.loja_id = l.loja_id AND o.conciliacao_id IS NULL
      )

    UNION ALL

    SELECT cf.id AS conta_financeira_id, cf.loja_id, lc.data, cf.saldo_inicial AS valor_sinal
    FROM contas_financeiras cf
    JOIN lancamentos_contabeis lc
      ON lc.origem_tipo = 'saldo_abertura' AND lc.origem_id = cf.id AND lc.loja_id = cf.loja_id
    WHERE cf.saldo_inicial <> 0
`;

export type ConferenciaContaMes = {
  conta_financeira_id: string;
  conta_financeira_nome: string;
  mes: string;
  movimento_financeiro: number;
  movimento_contabil: number;
};

export const listarConferenciaContabilFinanceira = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ de: z.string().nullable(), ate: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<ConferenciaContaMes[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const condicoesMes: string[] = [];
      const valoresMes: unknown[] = [];
      if (data.de) {
        condicoesMes.push("m.mes >= ?");
        valoresMes.push(data.de);
      }
      if (data.ate) {
        condicoesMes.push("m.mes <= ?");
        valoresMes.push(data.ate);
      }
      const filtroMes = condicoesMes.length > 0 ? `AND ${condicoesMes.join(" AND ")}` : "";
      const [rows] = await conn.query<RowDataPacket[]>(
        `WITH eventos AS (${EVENTOS_FINANCEIROS_SQL}),
              fin AS (
                SELECT conta_financeira_id, loja_id, DATE_FORMAT(data, '%Y-%m-01') AS mes,
                       SUM(valor_sinal) AS total
                FROM eventos
                GROUP BY conta_financeira_id, loja_id, mes
              ),
              cont AS (
                SELECT cf.id AS conta_financeira_id, cf.loja_id, DATE_FORMAT(lc.data, '%Y-%m-01') AS mes,
                       SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE -i.valor END) AS total
                FROM contas_financeiras cf
                JOIN lancamentos_contabeis_itens i ON i.conta_id = cf.plano_conta_id AND i.loja_id = cf.loja_id
                JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
                WHERE cf.plano_conta_id IS NOT NULL
                GROUP BY cf.id, cf.loja_id, mes
              ),
              meses AS (
                SELECT conta_financeira_id, loja_id, mes FROM fin
                UNION
                SELECT conta_financeira_id, loja_id, mes FROM cont
              )
         SELECT cf.id AS conta_financeira_id, cf.nome AS conta_financeira_nome, m.mes,
                COALESCE(fin.total, 0) AS movimento_financeiro,
                COALESCE(cont.total, 0) AS movimento_contabil
           FROM meses m
           JOIN contas_financeiras cf ON cf.id = m.conta_financeira_id AND cf.loja_id = m.loja_id
           LEFT JOIN fin ON fin.conta_financeira_id = m.conta_financeira_id
                         AND fin.loja_id = m.loja_id AND fin.mes = m.mes
           LEFT JOIN cont ON cont.conta_financeira_id = m.conta_financeira_id
                          AND cont.loja_id = m.loja_id AND cont.mes = m.mes
          WHERE cf.loja_id = @current_loja_id AND cf.ativo = TRUE ${filtroMes}
          ORDER BY cf.nome, m.mes`,
        valoresMes,
      );
      return rows as ConferenciaContaMes[];
    });
  });
