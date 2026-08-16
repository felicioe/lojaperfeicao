import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { garantirPrevisoesRecorrentes } from "./tesouraria-recorrentes";

// lancamentos_write original: admin/tesoureiro.
const PAPEIS = ["admin", "tesoureiro"];

export type ContaPagar = {
  id: string;
  data: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  descricao: string;
  valor: number;
  valor_pago: number;
  pago: boolean;
  forma_pagamento: string | null;
  recorrente_id: string | null;
  valor_previsto: number | null;
  valor_efetivo_confirmado: boolean;
  plano_conta_id: string;
  terceiro_id: string | null;
  observacoes: string | null;
  plano_contas: { codigo: string; nome: string } | null;
  terceiros: { nome: string } | null;
  contas_financeiras: { nome: string } | null;
};

async function buscarContasPagar(
  conn: PoolConnection,
  pago: boolean,
  limite?: number,
): Promise<ContaPagar[]> {
  const ordenacao = pago ? "l.data_pagamento DESC" : "l.data_vencimento";
  const [[estrutura]] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) = 2 AS pronta
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'lancamentos'
       AND column_name IN ('valor_previsto', 'valor_efetivo_confirmado')`,
  );
  const camposRecorrencia = estrutura.pronta
    ? "l.recorrente_id, l.valor_previsto, l.valor_efetivo_confirmado,"
    : "NULL AS recorrente_id, NULL AS valor_previsto, TRUE AS valor_efetivo_confirmado,";
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT l.id, l.data, l.data_vencimento, l.data_pagamento, l.descricao, l.valor, l.valor_pago, l.pago, l.forma_pagamento,
            l.plano_conta_id, l.terceiro_id, l.observacoes,
            ${camposRecorrencia}
            pc.codigo AS plano_codigo, pc.nome AS plano_nome, t.nome AS terceiro_nome, cf.nome AS conta_nome
     FROM lancamentos l
     LEFT JOIN plano_contas pc ON pc.id = l.plano_conta_id AND pc.loja_id = l.loja_id
     LEFT JOIN terceiros t ON t.id = l.terceiro_id AND t.loja_id = l.loja_id
     LEFT JOIN contas_financeiras cf ON cf.id = l.conta_id AND cf.loja_id = l.loja_id
     WHERE l.loja_id = @current_loja_id AND l.tipo = 'saida' AND l.pago = ?
     ORDER BY ${ordenacao}
     ${limite ? "LIMIT ?" : ""}`,
    limite ? [pago, limite] : [pago],
  );
  return rows.map((r) => ({
    id: r.id,
    data: r.data,
    data_vencimento: r.data_vencimento,
    data_pagamento: r.data_pagamento,
    descricao: r.descricao,
    valor: r.valor,
    valor_pago: r.valor_pago,
    pago: r.pago,
    forma_pagamento: r.forma_pagamento,
    recorrente_id: r.recorrente_id,
    valor_previsto: r.valor_previsto,
    valor_efetivo_confirmado: r.valor_efetivo_confirmado,
    plano_conta_id: r.plano_conta_id,
    terceiro_id: r.terceiro_id,
    observacoes: r.observacoes,
    plano_contas: r.plano_codigo ? { codigo: r.plano_codigo, nome: r.plano_nome } : null,
    terceiros: r.terceiro_nome ? { nome: r.terceiro_nome } : null,
    contas_financeiras: r.conta_nome ? { nome: r.conta_nome } : null,
  }));
}

export const listarContasPagarAbertas = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaPagar[]> => {
    return comPapel(PAPEIS, async (conn) => {
      await garantirPrevisoesRecorrentes(conn);
      return buscarContasPagar(conn, false);
    });
  },
);

const valorEfetivoSchema = z.object({
  lancamentoId: z.string().uuid(),
  valorEfetivo: z.number().positive(),
});

export const confirmarValorEfetivoContaPagar = createServerFn({ method: "POST" })
  .validator((d: unknown) => valorEfetivoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      const [resultado] = await conn.query(
        `UPDATE lancamentos
         SET valor = ?, valor_efetivo_confirmado = TRUE
         WHERE id = ? AND loja_id = @current_loja_id AND tipo = 'saida' AND pago = FALSE AND recorrente_id IS NOT NULL`,
        [data.valorEfetivo, data.lancamentoId],
      );
      if ((resultado as { affectedRows: number }).affectedRows !== 1) {
        throw new Error("Parcela recorrente não encontrada ou já paga.");
      }
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "confirmar_valor_efetivo",
        "conta_pagar",
        data.lancamentoId,
        null,
        data,
      );
    });
  });

export const listarContasPagarPagas = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaPagar[]> => {
    return comPapel(PAPEIS, (conn) => buscarContasPagar(conn, true, 200));
  },
);

const novaContaPagarSchema = z.object({
  descricao: z.string().min(1),
  valor: z.number().positive(),
  planoContaId: z.string().uuid(),
  data: z.string(),
  dataVencimento: z.string(),
  terceiroId: z.string().uuid().nullable(),
  observacoes: z.string().nullable(),
});

export const criarContaPagar = createServerFn({ method: "POST" })
  .validator((d: unknown) => novaContaPagarSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      await conn.query("CALL criar_conta_pagar(?, ?, ?, ?, ?, NULL, ?, ?, @lanc_id)", [
        data.descricao,
        data.valor,
        data.planoContaId,
        data.data,
        data.dataVencimento,
        data.terceiroId,
        data.observacoes,
      ]);
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      await registrarAuditoria(conn, usuarioIdAtual, "criar", "conta_pagar", lanc_id, null, data);
      return { id: lanc_id };
    });
  });

const editarContaPagarSchema = novaContaPagarSchema.extend({ id: z.string().uuid() });

export const editarContaPagar = createServerFn({ method: "POST" })
  .validator((d: unknown) => editarContaPagarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      const [[anterior]] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM lancamentos WHERE id = ? AND loja_id = @current_loja_id AND tipo = 'saida' LIMIT 1",
        [data.id],
      );
      if (!anterior || anterior.pago || anterior.valor_pago > 0) {
        throw new Error("Somente contas abertas e sem baixa parcial podem ser editadas.");
      }
      if (anterior.recorrente_id) {
        throw new Error(
          "Edite o modelo em Despesas Recorrentes ou apenas confirme o valor efetivo desta parcela.",
        );
      }
      await conn.query(
        `UPDATE lancamentos SET descricao=?, valor=?, plano_conta_id=?, data=?, data_vencimento=?,
         terceiro_id=?, observacoes=? WHERE id=? AND loja_id = @current_loja_id`,
        [
          data.descricao,
          data.valor,
          data.planoContaId,
          data.data,
          data.dataVencimento,
          data.terceiroId,
          data.observacoes,
          data.id,
        ],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "editar",
        "conta_pagar",
        data.id,
        anterior,
        data,
      );
    });
  });

export const excluirContaPagar = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      const [[anterior]] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM lancamentos WHERE id = ? AND loja_id = @current_loja_id AND tipo = 'saida' LIMIT 1",
        [data.id],
      );
      if (!anterior || anterior.pago || anterior.valor_pago > 0) {
        throw new Error("Somente contas abertas e sem baixa parcial podem ser excluídas.");
      }
      if (anterior.recorrente_id) {
        throw new Error("Exclua ou desative o modelo no menu Despesas Recorrentes.");
      }
      await conn.query("DELETE FROM lancamentos WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "excluir",
        "conta_pagar",
        data.id,
        anterior,
        null,
      );
    });
  });

const baixarContaPagarSchema = z.object({
  lancamentoId: z.string().uuid(),
  contaFinanceiraId: z.string().uuid(),
  formaPagamento: z.string().nullable(),
  dataPagamento: z.string(),
});

export const baixarContaPagar = createServerFn({ method: "POST" })
  .validator((d: unknown) => baixarContaPagarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      try {
        const [[parcela]] = await conn.query<RowDataPacket[]>(
          `SELECT recorrente_id, valor_efetivo_confirmado
           FROM lancamentos WHERE id = ? AND loja_id = @current_loja_id`,
          [data.lancamentoId],
        );
        if (parcela?.recorrente_id && !parcela.valor_efetivo_confirmado) {
          throw new Error("Confirme o valor efetivo desta despesa recorrente antes da baixa.");
        }
      } catch (erro) {
        if ((erro as { code?: string }).code !== "ER_BAD_FIELD_ERROR") throw erro;
      }
      await conn.query("CALL baixar_conta_pagar(?, ?, ?, ?)", [
        data.lancamentoId,
        data.contaFinanceiraId,
        data.formaPagamento,
        data.dataPagamento,
      ]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "baixar",
        "conta_pagar",
        data.lancamentoId,
        null,
        data,
      );
    });
  });
