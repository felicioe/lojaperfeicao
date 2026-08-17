import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel, comSessao } from "./authz";
import { registrarAuditoria } from "./auditoria";

// RLS original: SELECT admin/tesoureiro/secretario (tudo) OU o próprio
// irmão vinculado. Sem escrita direta — só a procedure baixar_faturas.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

export type Recibo = {
  id: string;
  data: string;
  valor_original: number;
  valor_multa: number;
  valor_juros: number;
  desconto: number;
  valor_total: number;
  forma_pagamento: string | null;
  irmaos: { nome_civil: string } | null;
  contas_financeiras: { nome: string } | null;
};

export const listarRecibos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Recibo[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const where = privilegiado
        ? "WHERE r.loja_id = @current_loja_id"
        : "WHERE r.loja_id = @current_loja_id AND i.usuario_id = ?";
      const valores = privilegiado ? [] : [usuarioId];
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT r.id, r.data, r.valor_original, r.valor_multa, r.valor_juros, r.desconto, r.valor_total, r.forma_pagamento,
              i.nome_civil, cf.nome AS conta_nome
       FROM recibos r
       JOIN irmaos i ON i.id = r.irmao_id AND i.loja_id = r.loja_id
       LEFT JOIN contas_financeiras cf ON cf.id = r.conta_financeira_id AND cf.loja_id = r.loja_id
       ${where}
       ORDER BY r.data DESC
       LIMIT 200`,
        valores,
      );
      return rows.map((r) => ({
        id: r.id,
        data: r.data,
        valor_original: r.valor_original,
        valor_multa: r.valor_multa,
        valor_juros: r.valor_juros,
        desconto: r.desconto,
        valor_total: r.valor_total,
        forma_pagamento: r.forma_pagamento,
        irmaos: { nome_civil: r.nome_civil },
        contas_financeiras: r.conta_nome ? { nome: r.conta_nome } : null,
      }));
    });
  },
);

export type ReciboItem = {
  id: string;
  valor_original: number;
  valor_multa: number;
  valor_juros: number;
  lancamentos: { descricao: string; data_vencimento: string | null } | null;
};

export const listarReciboItens = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ reciboId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ReciboItem[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      if (!privilegiado) {
        const [[{ ok }]] = await conn.query<RowDataPacket[]>(
          `SELECT EXISTS(SELECT 1 FROM recibos r JOIN irmaos i ON i.id = r.irmao_id WHERE r.loja_id = @current_loja_id AND r.id = ? AND i.usuario_id = ?) AS ok`,
          [data.reciboId, usuarioId],
        );
        if (!ok) throw new Error("Sem permissão.");
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT ri.id, ri.valor_original, ri.valor_multa, ri.valor_juros, l.descricao, l.data_vencimento
         FROM recibo_itens ri
         JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
         WHERE ri.loja_id = @current_loja_id AND ri.recibo_id = ?`,
        [data.reciboId],
      );
      return rows.map((r) => ({
        id: r.id,
        valor_original: r.valor_original,
        valor_multa: r.valor_multa,
        valor_juros: r.valor_juros,
        lancamentos: { descricao: r.descricao, data_vencimento: r.data_vencimento },
      }));
    });
  });

export type ReciboAvulso = {
  id: string;
  numero: number;
  tipo: "recebimento" | "pagamento";
  status: "previsto" | "efetivo";
  data: string;
  valor: number;
  descricao: string;
  pessoa_nome: string;
  forma_pagamento: string | null;
  observacoes: string | null;
  conta_nome: string | null;
  conciliacao_id: string | null;
};

export const listarRecibosAvulsos = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReciboAvulso[]> =>
    comPapel(PAPEIS_PRIVILEGIADOS, async (conn) => {
      const [rows] = await conn.query<
        RowDataPacket[]
      >(`SELECT r.id, r.numero, r.tipo, r.status, r.data, r.valor,
      r.descricao, COALESCE(i.nome_civil, t.nome) AS pessoa_nome, r.forma_pagamento, r.observacoes,
      cf.nome AS conta_nome, r.conciliacao_id FROM recibos_avulsos r
      LEFT JOIN irmaos i ON i.id=r.irmao_id LEFT JOIN terceiros t ON t.id=r.terceiro_id
      LEFT JOIN contas_financeiras cf ON cf.id=r.conta_financeira_id
      WHERE r.loja_id = @current_loja_id ORDER BY r.data DESC, r.numero DESC LIMIT 500`);
      return rows as ReciboAvulso[];
    }),
);

export const listarConciliacoesParaRecibo = createServerFn({ method: "GET" }).handler(async () =>
  comPapel(PAPEIS_PRIVILEGIADOS, async (conn) => {
    const [rows] = await conn.query<
      RowDataPacket[]
    >(`SELECT c.id, c.data_conciliacao AS data, c.valor_total AS valor,
      GROUP_CONCAT(DISTINCT l.descricao SEPARATOR '; ') AS descricao
      FROM conciliacoes c JOIN conciliacao_lancamentos cl ON cl.conciliacao_id=c.id
      JOIN lancamentos l ON l.id=cl.lancamento_id LEFT JOIN recibos_avulsos r ON r.conciliacao_id=c.id
      WHERE c.loja_id = @current_loja_id AND c.status='ativa' AND r.id IS NULL GROUP BY c.id ORDER BY c.data_conciliacao DESC LIMIT 100`);
    return rows as { id: string; data: string; valor: number; descricao: string }[];
  }),
);

const avulsoSchema = z
  .object({
    tipo: z.enum(["recebimento", "pagamento"]),
    status: z.enum(["previsto", "efetivo"]),
    data: z.string(),
    valor: z.number().positive(),
    descricao: z.string().trim().min(1),
    irmaoId: z.string().uuid().nullable(),
    terceiroId: z.string().uuid().nullable(),
    planoContaId: z.string().uuid(),
    contaFinanceiraId: z.string().uuid().nullable(),
    formaPagamento: z.string().nullable(),
    observacoes: z.string().nullable(),
    conciliacaoId: z.string().uuid().nullable(),
  })
  .refine((d) => !!d.irmaoId !== !!d.terceiroId, "Selecione um irmão ou um terceiro.")
  .refine(
    (d) => d.status === "previsto" || !!d.contaFinanceiraId || !!d.conciliacaoId,
    "Informe a conta financeira.",
  );

export const criarReciboAvulso = createServerFn({ method: "POST" })
  .validator((d: unknown) => avulsoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> =>
    comPapel(["admin", "tesoureiro"], async (conn, usuarioId) => {
      const id = crypto.randomUUID();
      let lancamentoId: string | null = null;
      if (!data.conciliacaoId) {
        lancamentoId = crypto.randomUUID();
        const efetivo = data.status === "efetivo";
        await conn.query(
          `INSERT INTO lancamentos (loja_id,id,data,data_vencimento,data_pagamento,descricao,valor,valor_pago,tipo,
        plano_conta_id,irmao_id,terceiro_id,conta_id,pago,forma_pagamento,observacoes,criado_por)
        VALUES (@current_loja_id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            lancamentoId,
            data.data,
            data.data,
            efetivo ? data.data : null,
            data.descricao,
            data.valor,
            efetivo ? data.valor : 0,
            data.tipo === "recebimento" ? "entrada" : "saida",
            data.planoContaId,
            data.irmaoId,
            data.terceiroId,
            efetivo ? data.contaFinanceiraId : null,
            efetivo,
            data.formaPagamento,
            data.observacoes,
            usuarioId,
          ],
        );
        if (efetivo) {
          const [[conta]] = await conn.query<RowDataPacket[]>(
            "SELECT plano_conta_id FROM contas_financeiras WHERE id=? AND loja_id = @current_loja_id",
            [data.contaFinanceiraId],
          );
          if (!conta?.plano_conta_id)
            throw new Error("A conta financeira não possui conta contábil vinculada.");
          const entrada = data.tipo === "recebimento";
          const itens = JSON.stringify([
            {
              conta_id: entrada ? conta.plano_conta_id : data.planoContaId,
              tipo: "debito",
              valor: data.valor,
              descricao: data.descricao,
            },
            {
              conta_id: entrada ? data.planoContaId : conta.plano_conta_id,
              tipo: "credito",
              valor: data.valor,
              descricao: data.descricao,
            },
          ]);
          await conn.query(
            "CALL registrar_lancamento_contabil(?, ?, ?, ?, 'recibo_avulso', ?, @lc_id)",
            [data.data, data.data.slice(0, 7) + "-01", data.descricao, itens, lancamentoId],
          );
        }
      }
      await conn.query(
        `INSERT INTO recibos_avulsos (loja_id,id,tipo,status,data,valor,descricao,irmao_id,terceiro_id,
      plano_conta_id,conta_financeira_id,forma_pagamento,observacoes,lancamento_id,conciliacao_id,criado_por)
      VALUES (@current_loja_id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          data.tipo,
          data.status,
          data.data,
          data.valor,
          data.descricao,
          data.irmaoId,
          data.terceiroId,
          data.planoContaId,
          data.contaFinanceiraId,
          data.formaPagamento,
          data.observacoes,
          lancamentoId,
          data.conciliacaoId,
          usuarioId,
        ],
      );
      await registrarAuditoria(conn, usuarioId, "criar", "recibo_avulso", id, null, data);
      return { id };
    }),
  );
