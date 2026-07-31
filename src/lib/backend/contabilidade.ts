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
        "SELECT id, codigo, nome FROM plano_contas WHERE analitica = TRUE ORDER BY codigo",
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
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id
         WHERE i.conta_id = ? AND lc.data < ?`,
        [data.contaId, data.antesDe],
      );
      return rows.reduce((s, i) => s + (i.tipo === "debito" ? Number(i.valor) : -Number(i.valor)), 0);
    });
  });

export type ItemRazao = {
  id: string;
  tipo: "debito" | "credito";
  valor: number;
  descricao: string | null;
  lancamentos_contabeis: { data: string; descricao: string; origem_tipo: string | null };
};

export const listarItensRazao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid(), de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ItemRazao[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT i.id, i.tipo, i.valor, i.descricao, lc.data, lc.descricao AS lc_descricao, lc.origem_tipo
         FROM lancamentos_contabeis_itens i
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id
         WHERE i.conta_id = ? AND lc.data >= ? AND lc.data <= ?
         ORDER BY lc.data, lc.criado_em`,
        [data.contaId, data.de, data.ate],
      );
      return rows.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        valor: r.valor,
        descricao: r.descricao,
        lancamentos_contabeis: { data: r.data, descricao: r.lc_descricao, origem_tipo: r.origem_tipo },
      }));
    });
  });

// ---------- Diário contábil ----------
export type LancamentoDiario = {
  id: string;
  data: string;
  descricao: string;
  origem_tipo: string | null;
  lancamentos_contabeis_itens: {
    id: string;
    tipo: "debito" | "credito";
    valor: number;
    descricao: string | null;
    plano_contas: { codigo: string; nome: string } | null;
  }[];
};

export const listarLancamentosDiario = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ de: z.string(), ate: z.string() }).parse(d))
  .handler(async ({ data }): Promise<LancamentoDiario[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [lancamentos] = await conn.query<RowDataPacket[]>(
        "SELECT id, data, descricao, origem_tipo FROM lancamentos_contabeis WHERE data >= ? AND data <= ? ORDER BY data, criado_em",
        [data.de, data.ate],
      );
      if (lancamentos.length === 0) return [];

      const ids = lancamentos.map((l) => l.id);
      const [itens] = await conn.query<RowDataPacket[]>(
        `SELECT i.id, i.lancamento_id, i.tipo, i.valor, i.descricao, pc.codigo, pc.nome
         FROM lancamentos_contabeis_itens i
         LEFT JOIN plano_contas pc ON pc.id = i.conta_id
         WHERE i.lancamento_id IN (?)`,
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
        origem_tipo: l.origem_tipo,
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
         JOIN plano_contas pc ON pc.id = i.conta_id
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id
         WHERE ${condicoes.join(" AND ")}`,
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

export const listarSaldoPlanoContas = createServerFn({ method: "GET" }).handler(
  async (): Promise<SaldoPlanoContas[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM v_saldo_plano_contas ORDER BY codigo");
      return rows as SaldoPlanoContas[];
    });
  },
);

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

export const listarAuditoriaDesbalanceados = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuditoriaDesbalanceado[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM v_auditoria_contabil_desbalanceados");
      return rows as AuditoriaDesbalanceado[];
    });
  },
);
