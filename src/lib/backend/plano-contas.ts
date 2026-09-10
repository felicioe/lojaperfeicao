import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// RLS original (mysql/migrations/0003_contabil_tesouraria.sql): SELECT
// livre para autenticados; escrita admin OU tesoureiro (checada de novo,
// em profundidade, dentro da própria stored procedure salvar_conta).
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

export type TipoConta = "ativo" | "passivo" | "patrimonio_liquido" | "receita" | "despesa";

export type Conta = {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoConta;
  ativo: boolean;
  analitica: boolean;
  parent_id: string | null;
};

export const listarPlanoContas = createServerFn({ method: "GET" }).handler(
  async (): Promise<Conta[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM plano_contas WHERE loja_id = @current_loja_id ORDER BY codigo",
      );
      return rows as Conta[];
    });
  },
);

/** Contas analíticas e ativas de um tipo — usado nos seletores de categoria contábil. */
export const listarPlanoContasPorTipo = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z
      .object({ tipo: z.enum(["ativo", "passivo", "patrimonio_liquido", "receita", "despesa"]) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: string; codigo: string; nome: string }[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, codigo, nome FROM plano_contas
          WHERE loja_id = @current_loja_id
            AND tipo = ? AND analitica = TRUE AND ativo = TRUE
          ORDER BY codigo`,
        [data.tipo],
      );
      return rows as { id: string; codigo: string; nome: string }[];
    });
  });

const salvarContaSchema = z.object({
  id: z.string().uuid().nullable(),
  codigo: z.string().min(1),
  nome: z.string().min(1),
  tipo: z.enum(["ativo", "passivo", "patrimonio_liquido", "receita", "despesa"]),
  parent_id: z.string().uuid().nullable(),
  analitica: z.boolean(),
});

// Usa a procedure salvar_conta (não INSERT/UPDATE direto): ela faz a
// checagem de ciclo na hierarquia e desativa `analitica` do pai quando ele
// ganha uma filha — validações que no MySQL não podem viver num trigger
// (trigger não pode fazer UPDATE na própria tabela que o disparou).
export const salvarConta = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarContaSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      // Busca o estado anterior antes de atualizar — sem isso, a auditoria
      // sempre gravava antes=null mesmo em edições, perdendo o rastro do
      // que a conta contábil tinha antes da mudança.
      const [[antes]] = data.id
        ? await conn.query<RowDataPacket[]>(
            "SELECT codigo, nome, tipo, parent_id, analitica FROM plano_contas WHERE id = ? AND loja_id = @current_loja_id",
            [data.id],
          )
        : [[null]];
      await conn.query("CALL salvar_conta(?, ?, ?, ?, ?, ?, @out_id)", [
        data.id,
        data.codigo,
        data.nome,
        data.tipo,
        data.parent_id,
        data.analitica,
      ]);
      const [[{ out_id }]] = await conn.query<RowDataPacket[]>("SELECT @out_id AS out_id");
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        data.id ? "atualizar" : "criar",
        "plano_conta",
        out_id,
        antes ?? null,
        data,
      );
      return { id: out_id };
    });
  });

export const alternarAtivoConta = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT ativo FROM plano_contas WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      await conn.query(
        "UPDATE plano_contas SET ativo=? WHERE id=? AND loja_id = @current_loja_id",
        [data.ativo, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "alternar_ativo",
        "plano_conta",
        data.id,
        antes ?? null,
        { ativo: data.ativo },
      );
    });
  });
