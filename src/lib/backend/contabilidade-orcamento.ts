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
  versao: number;
};

export const listarOrcamentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Orcamento[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, ano, status, observacoes, versao FROM orcamentos
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
  conta_id: string;
  tipo: "debito" | "credito";
  valor: number;
  conta_tipo: "receita" | "despesa";
  data: string;
};

export const listarRealizadoAnual = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ ano: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<ItemRealizadoAnual[]> => {
    return comPapel(PAPEIS, async (conn) => {
      // conta_id incluído (achado #580 da auditoria de orçamento/fluxo de
      // caixa) — antes só dava pra agregar o realizado por mês somando todas
      // as contas de receita/despesa juntas, sem como abrir por conta na
      // mesma tela do "Acompanhamento Mensal".
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT i.conta_id, i.tipo, i.valor, pc.tipo AS conta_tipo, lc.data
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

// ---------- Orçamento em base de caixa (issue #581) ----------
// Mesmo cabeçalho `orcamentos` e mesmo plano de contas do orçamento de
// competência, só numa tabela de itens irmã (orcamento_caixa_itens,
// migração 0148) — pra não misturar os dois regimes na mesma linha nem
// alterar a leitura já existente do DRE Orçado.
export type OrcamentoCaixaItem = { conta_id: string; mes: number; valor: number };

export const listarOrcamentoCaixaItens = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orcamentoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OrcamentoCaixaItem[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT conta_id, mes, valor FROM orcamento_caixa_itens
          WHERE orcamento_id = ? AND loja_id = @current_loja_id`,
        [data.orcamentoId],
      );
      return rows as OrcamentoCaixaItem[];
    });
  });

export const definirValorOrcamentoCaixa = createServerFn({ method: "POST" })
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
      await conn.query("CALL definir_valor_orcamento_caixa(?, ?, ?, ?)", [
        data.orcamentoId,
        data.contaId,
        data.mes,
        data.valor,
      ]);
    });
  });

// Total orçado de caixa por mês (entrada/saída) — usado na aba "Realizado"
// do Fluxo de Caixa pra mostrar "Orçado do mês"/"Variação" sem precisar
// carregar o detalhamento por conta (a tela de Fluxo de Caixa não abre por
// conta, só por mês).
export type OrcamentoCaixaMensal = { mes: number; entradaOrcada: number; saidaOrcada: number };

export const obterOrcamentoCaixaMensal = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ ano: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<OrcamentoCaixaMensal[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT oci.mes, pc.tipo AS conta_tipo, SUM(oci.valor) AS total
         FROM orcamento_caixa_itens oci
         JOIN orcamentos o ON o.id = oci.orcamento_id AND o.loja_id = oci.loja_id
         JOIN plano_contas pc ON pc.id = oci.conta_id AND pc.loja_id = oci.loja_id
         WHERE oci.loja_id = @current_loja_id AND o.ano = ?
         GROUP BY oci.mes, pc.tipo`,
        [data.ano],
      );
      const porMes = new Map<number, OrcamentoCaixaMensal>();
      for (const r of rows) {
        const atual = porMes.get(r.mes) ?? { mes: r.mes, entradaOrcada: 0, saidaOrcada: 0 };
        if (r.conta_tipo === "receita") atual.entradaOrcada += Number(r.total);
        else atual.saidaOrcada += Number(r.total);
        porMes.set(r.mes, atual);
      }
      return Array.from(porMes.values());
    });
  });

// ---------- Versionamento (issue #582) ----------
// Cada aprovação tira um snapshot dos itens vigentes (competência + caixa)
// sob a versão corrente — reabrir incrementa a versão pra próxima
// aprovação não sobrescrever o snapshot anterior (migração 0149).
export type OrcamentoVersao = {
  id: string;
  versao: number;
  aprovado_por: string | null;
  aprovado_em: string;
};

export const listarOrcamentoVersoes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orcamentoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OrcamentoVersao[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, versao, aprovado_por, aprovado_em FROM orcamento_versoes
          WHERE orcamento_id = ? AND loja_id = @current_loja_id
          ORDER BY versao DESC`,
        [data.orcamentoId],
      );
      return rows as OrcamentoVersao[];
    });
  });

export type ItemVersaoOrcamento = {
  regime: "competencia" | "caixa";
  conta_id: string;
  mes: number;
  valor: number;
};

export const listarItensVersaoOrcamento = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orcamentoVersaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ItemVersaoOrcamento[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT regime, conta_id, mes, valor FROM orcamento_versoes_itens
          WHERE orcamento_versao_id = ? AND loja_id = @current_loja_id`,
        [data.orcamentoVersaoId],
      );
      return rows as ItemVersaoOrcamento[];
    });
  });
