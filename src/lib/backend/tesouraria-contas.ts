import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { chavePixValida } from "@/lib/pix";

// RLS original: SELECT livre; escrita admin OU tesoureiro.
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

export type ContaFinanceira = {
  id: string;
  nome: string;
  tipo: "caixa" | "banco" | "outro";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  saldo_inicial: number;
  plano_conta_id: string | null;
  ativo: boolean;
};

export type SaldoConta = ContaFinanceira & { saldo_atual: number };

export const listarContasFinanceiras = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaFinanceira[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras WHERE ativo = TRUE ORDER BY nome",
      );
      return rows as ContaFinanceira[];
    });
  },
);

export const listarSaldoContas = createServerFn({ method: "GET" }).handler(
  async (): Promise<SaldoConta[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM v_saldo_contas ORDER BY nome",
      );
      return rows as SaldoConta[];
    });
  },
);

const novaContaSchema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["caixa", "banco", "outro"]),
  saldo_inicial: z.number(),
  banco: z.string().nullable(),
});

export const criarContaFinanceira = createServerFn({ method: "POST" })
  .validator((d: unknown) => novaContaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query(
        "INSERT INTO contas_financeiras (nome, tipo, saldo_inicial, banco) VALUES (?, ?, ?, ?)",
        [data.nome, data.tipo, data.saldo_inicial, data.banco],
      );
    });
  });

// ---------- Chaves PIX (por conta) ----------
// Usadas pra gerar o "Pix Copia e Cola" (BR Code) impresso na fatura —
// ver src/lib/pix.ts. Uma conta pode ter várias chaves de tipos
// diferentes; "principal" é só a pré-seleção sugerida nos formulários, a
// aplicação garante no máximo uma principal por conta.
export type ChavePix = {
  id: string;
  conta_financeira_id: string;
  tipo: "email" | "telefone" | "cpf" | "cnpj" | "aleatoria";
  chave: string;
  nome_beneficiario: string;
  cidade: string;
  principal: boolean;
};

export const listarChavesPix = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ChavePix[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras_pix WHERE conta_financeira_id = ? ORDER BY principal DESC, criado_em",
        [data.contaId],
      );
      return rows as ChavePix[];
    });
  });

export type ChavePixComConta = ChavePix & { conta_nome: string };

// Lista achatada (todas as contas) pra popular um único seletor de chave
// na fatura, sem precisar de um segundo select em cascata "conta -> chave".
export const listarTodasChavesPix = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChavePixComConta[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT pix.*, cf.nome AS conta_nome
         FROM contas_financeiras_pix pix
         JOIN contas_financeiras cf ON cf.id = pix.conta_financeira_id
         WHERE cf.ativo = TRUE
         ORDER BY cf.nome, pix.principal DESC`,
      );
      return rows as ChavePixComConta[];
    });
  },
);

const chavePixSchema = z.object({
  contaFinanceiraId: z.string().uuid(),
  tipo: z.enum(["email", "telefone", "cpf", "cnpj", "aleatoria"]),
  chave: z.string().min(1),
  nomeBeneficiario: z.string().min(1).max(25),
  cidade: z.string().min(1).max(15),
  principal: z.boolean(),
});

export const criarChavePix = createServerFn({ method: "POST" })
  .validator((d: unknown) => chavePixSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      if (!chavePixValida(data.tipo, data.chave)) {
        throw new Error("Chave não bate com o formato esperado para o tipo selecionado.");
      }
      if (data.principal) {
        await conn.query(
          "UPDATE contas_financeiras_pix SET principal = FALSE WHERE conta_financeira_id = ?",
          [data.contaFinanceiraId],
        );
      }
      await conn.query(
        `INSERT INTO contas_financeiras_pix
           (conta_financeira_id, tipo, chave, nome_beneficiario, cidade, principal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          data.contaFinanceiraId,
          data.tipo,
          data.chave,
          data.nomeBeneficiario,
          data.cidade,
          data.principal,
        ],
      );
      // id é UUID gerado por DEFAULT (UUID()) no MySQL, não auto_increment —
      // insertId não reflete o id real, então não dá pra usar como
      // entidade_id aqui (mesmo padrão de tabela_valores.criarValorVigente).
      await registrarAuditoria(conn, usuarioIdAtual, "criar", "chave_pix", null, null, data);
    });
  });

export const removerChavePix = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[chave]] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras_pix WHERE id = ?",
        [data.id],
      );
      await conn.query("DELETE FROM contas_financeiras_pix WHERE id = ?", [data.id]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "excluir",
        "chave_pix",
        data.id,
        chave ?? null,
        null,
      );
    });
  });
