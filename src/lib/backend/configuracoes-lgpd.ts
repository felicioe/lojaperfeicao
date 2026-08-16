import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Dados da entidade exibidos na Política de Privacidade (issue #232) —
// leitura sem sessão (contexto de sistema, mesmo padrão de auth.ts) porque
// a política é pública (/privacidade, /aceite-termos), acessível também
// por quem ainda não fez login.
const PAPEIS_ESCRITA = ["admin"];

export type ConfiguracoesLgpd = {
  nome_entidade: string | null;
  cnpj: string | null;
  email_dpo: string | null;
};

export const obterConfiguracoesLgpd = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConfiguracoesLgpd> => {
    return withUserConnection(null, async (conn) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_entidade, cnpj, email_dpo FROM configuracoes_lgpd WHERE id = 1",
      );
      return row as ConfiguracoesLgpd;
    });
  },
);

const configuracoesLgpdSchema = z.object({
  nome_entidade: z.string().nullable(),
  cnpj: z.string().nullable(),
  email_dpo: z.string().nullable(),
});

export const salvarConfiguracoesLgpd = createServerFn({ method: "POST" })
  .validator((d: unknown) => configuracoesLgpdSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_entidade, cnpj, email_dpo FROM configuracoes_lgpd WHERE id = 1",
      );
      await conn.query(
        "UPDATE configuracoes_lgpd SET nome_entidade=?, cnpj=?, email_dpo=? WHERE id = 1",
        [data.nome_entidade, data.cnpj, data.email_dpo],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar",
        "configuracoes_lgpd",
        null,
        antes,
        data,
      );
    });
  });
