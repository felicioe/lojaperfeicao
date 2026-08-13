import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel, comSessao } from "./authz";
import { registrarAuditoria } from "./auditoria";

const PAPEIS_ESCRITA = ["admin", "tesoureiro"];
export const HISTORICO_TRONCO_ANONIMO =
  "Recebimento Pix - Irmão do quadro ou visitante - nome omitido para confidencialidade do tronco";

export const obterResumoTronco = createServerFn({ method: "GET" }).handler(async () => {
  return comSessao(async (conn) => {
    const [[estrutura]] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tronco_beneficencia_config'`,
    );
    const saldoInicial = Number(estrutura.total)
      ? Number(
          (
            await conn.query<RowDataPacket[]>(
              "SELECT saldo_inicial FROM tronco_beneficencia_config WHERE id = 1",
            )
          )[0][0]?.saldo_inicial ?? 0,
        )
      : 0;
    const [[totais]] = await conn.query<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS entradas,
         COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) AS saidas
       FROM lancamentos
       WHERE categoria_recebimento = 'tronco' AND pago = TRUE`,
    );
    const entradas = Number(totais.entradas);
    const saidas = Number(totais.saidas);
    return { saldoInicial, entradas, saidas, saldoAtual: saldoInicial + entradas - saidas };
  });
});

export const salvarSaldoInicialTronco = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ valor: z.number().min(0) }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT saldo_inicial FROM tronco_beneficencia_config WHERE id = 1",
      );
      await conn.query(
        `INSERT INTO tronco_beneficencia_config (id, saldo_inicial, atualizado_por)
         VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE saldo_inicial = VALUES(saldo_inicial), atualizado_por = VALUES(atualizado_por)`,
        [data.valor, usuarioId],
      );
      await registrarAuditoria(conn, usuarioId, "atualizar", "tronco_saldo_inicial", "1", antes, {
        saldo_inicial: data.valor,
      });
    });
  });

const saidaSchema = z.object({
  valor: z.number().positive(),
  data: z.string(),
  contaFinanceiraId: z.string().uuid(),
  planoContaId: z.string().uuid(),
  descricao: z.string().trim().min(1).max(500),
  observacoes: z.string().trim().max(2000).nullable(),
});

export const registrarSaidaTronco = createServerFn({ method: "POST" })
  .validator((d: unknown) => saidaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId) => {
      const [[conta]] = await conn.query<RowDataPacket[]>(
        "SELECT plano_conta_id FROM contas_financeiras WHERE id = ? AND ativo = TRUE",
        [data.contaFinanceiraId],
      );
      if (!conta?.plano_conta_id)
        throw new Error("A conta bancária precisa estar vinculada ao plano de contas.");
      const id = crypto.randomUUID();
      await conn.beginTransaction();
      try {
        const [[disponivel]] = await conn.query<RowDataPacket[]>(
          `SELECT
             COALESCE((SELECT saldo_inicial FROM tronco_beneficencia_config WHERE id = 1), 0)
             + COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS saldo
           FROM lancamentos
           WHERE categoria_recebimento = 'tronco' AND pago = TRUE`,
        );
        if (Number(disponivel.saldo) < data.valor) {
          throw new Error("A saída é maior que o saldo disponível do Tronco.");
        }
        await conn.query(
          `INSERT INTO lancamentos
             (id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
              forma_pagamento, pago, categoria_recebimento, observacoes, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, 'saida', ?, ?, 'PIX', TRUE, 'tronco', ?, ?)`,
          [
            id,
            data.data,
            data.data,
            data.descricao,
            data.valor,
            data.valor,
            data.contaFinanceiraId,
            data.planoContaId,
            data.observacoes,
            usuarioId,
          ],
        );
        await conn.query(
          `CALL registrar_lancamento_contabil(?, ?, ?, ?, 'tronco_saida', ?, @tronco_contabil_id)`,
          [
            data.data,
            `${data.data.slice(0, 7)}-01`,
            data.descricao,
            JSON.stringify([
              { conta_id: data.planoContaId, tipo: "debito", valor: data.valor },
              { conta_id: conta.plano_conta_id, tipo: "credito", valor: data.valor },
            ]),
            id,
          ],
        );
        await registrarAuditoria(conn, usuarioId, "criar", "tronco_saida", id, null, data);
        await conn.commit();
      } catch (erro) {
        await conn.rollback();
        throw erro;
      }
      return { id };
    });
  });
