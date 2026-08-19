import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel, comSessao } from "./authz";

// RLS original: SELECT admin/tesoureiro. Sem escrita direta — só as
// procedures criar_orcamento/definir_valor_orcamento/aprovar_orcamento/
// reabrir_orcamento.
const PAPEIS = ["admin", "tesoureiro"];

// plano_contas tem leitura pública para autenticados no RLS original.
export type ContaOrcamento = {
  id: string;
  codigo: string;
  nome: string;
  tipo: "receita" | "despesa";
};

export const listarContasOrcamento = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaOrcamento[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, codigo, nome, tipo FROM plano_contas
          WHERE loja_id = @current_loja_id
            AND analitica = TRUE AND ativo = TRUE AND tipo IN ('receita','despesa')
          ORDER BY codigo`,
      );
      return rows as ContaOrcamento[];
    });
  },
);

export type Orcamento = {
  id: string;
  ano: number;
  status: "rascunho" | "aprovado";
  observacoes: string | null;
};

export const listarOrcamentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Orcamento[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, ano, status, observacoes FROM orcamentos
          WHERE loja_id = @current_loja_id
          ORDER BY ano DESC`,
      );
      return rows as Orcamento[];
    });
  },
);

export type OrcamentoItem = { conta_id: string; mes: number; valor: number };

export const listarOrcamentoItens = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orcamentoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OrcamentoItem[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT conta_id, mes, valor FROM orcamento_itens
          WHERE orcamento_id = ? AND loja_id = @current_loja_id`,
        [data.orcamentoId],
      );
      return rows as OrcamentoItem[];
    });
  });

export const criarOrcamento = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ ano: z.number().int(), observacoes: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL criar_orcamento(?, ?, @orcamento_id)", [data.ano, data.observacoes]);
      const [[{ orcamento_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @orcamento_id AS orcamento_id",
      );
      return { id: orcamento_id };
    });
  });

export const definirValorOrcamento = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        orcamentoId: z.string().uuid(),
        contaId: z.string().uuid(),
        mes: z.number().int().min(1).max(12),
        valor: z.number(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL definir_valor_orcamento(?, ?, ?, ?)", [
        data.orcamentoId,
        data.contaId,
        data.mes,
        data.valor,
      ]);
    });
  });

export const aprovarOrcamento = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ orcamentoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL aprovar_orcamento(?)", [data.orcamentoId]);
    });
  });

export const reabrirOrcamento = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ orcamentoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL reabrir_orcamento(?)", [data.orcamentoId]);
    });
  });

// ---------- Acompanhamento mensal (aba "Acompanhamento" do orçamento) ----------
export type ItemRealizadoAnual = {
  tipo: "debito" | "credito";
  valor: number;
  conta_tipo: "receita" | "despesa";
  data: string;
};

export const listarRealizadoAnual = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ ano: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<ItemRealizadoAnual[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT i.tipo, i.valor, pc.tipo AS conta_tipo, lc.data
         FROM lancamentos_contabeis_itens i
         JOIN plano_contas pc ON pc.id = i.conta_id AND pc.loja_id = i.loja_id
         JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
         WHERE i.loja_id = @current_loja_id
           AND pc.tipo IN ('receita','despesa') AND lc.data >= ? AND lc.data <= ?`,
        [`${data.ano}-01-01`, `${data.ano}-12-31`],
      );
      return rows as ItemRealizadoAnual[];
    });
  });
