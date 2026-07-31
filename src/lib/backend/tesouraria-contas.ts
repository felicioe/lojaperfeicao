import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

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

export const listarSaldoContas = createServerFn({ method: "GET" }).handler(async (): Promise<SaldoConta[]> => {
  return comSessao(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM v_saldo_contas ORDER BY nome");
    return rows as SaldoConta[];
  });
});

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
      await conn.query("INSERT INTO contas_financeiras (nome, tipo, saldo_inicial, banco) VALUES (?, ?, ?, ?)", [
        data.nome,
        data.tipo,
        data.saldo_inicial,
        data.banco,
      ]);
    });
  });
