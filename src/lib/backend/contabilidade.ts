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
