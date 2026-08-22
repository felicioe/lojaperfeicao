import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { lojaIdParaFiltroDeLogin, slugDaRequisicaoAtual } from "./subdominio";
import { usuarioIdDaSessao } from "./session";

// Dados da entidade exibidos na Política de Privacidade (issue #232). Nome
// e CNPJ vêm de `lojas.razao_social`/`nome`/`cnpj` (issue #340 unificou — antes
// duplicavam em `configuracoes_lgpd`, hoje só o DPO é específico daqui).
const PAPEIS_ESCRITA = ["admin"];

export type ConfiguracoesLgpd = {
  nome_entidade: string | null;
  cnpj: string | null;
  email_dpo: string | null;
};

const SELECT_ENTIDADE = `SELECT COALESCE(NULLIF(l.razao_social, ''), l.nome) AS nome_entidade,
         l.cnpj, c.email_dpo
    FROM lojas l LEFT JOIN configuracoes_lgpd c ON c.loja_id = l.id`;

function linhaOuVazia(row: RowDataPacket | undefined): ConfiguracoesLgpd {
  return row
    ? {
        nome_entidade: row.nome_entidade as string | null,
        cnpj: row.cnpj as string | null,
        email_dpo: row.email_dpo as string | null,
      }
    : { nome_entidade: null, cnpj: null, email_dpo: null };
}

export const obterConfiguracoesLgpd = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConfiguracoesLgpd> => {
    // /privacidade e /aceite-termos são públicas (a segunda sempre tem
    // sessão na prática, mas a primeira não) — quem tem sessão usa a loja
    // dela; sem sessão, resolve pelo subdomínio (issue #338), igual ao login.
    const usuarioId = await usuarioIdDaSessao();
    if (usuarioId) {
      return withUserConnection(usuarioId, async (conn) => {
        const [[row]] = await conn.query<RowDataPacket[]>(
          `${SELECT_ENTIDADE} WHERE l.id = @current_loja_id`,
        );
        return linhaOuVazia(row);
      });
    }
    const slug = slugDaRequisicaoAtual();
    return withUserConnection(null, async (conn) => {
      const lojaId = await lojaIdParaFiltroDeLogin(conn, slug).catch(() => null);
      if (!lojaId) return linhaOuVazia(undefined);
      const [[row]] = await conn.query<RowDataPacket[]>(`${SELECT_ENTIDADE} WHERE l.id = ?`, [
        lojaId,
      ]);
      return linhaOuVazia(row);
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
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual, lojaId) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        `${SELECT_ENTIDADE} WHERE l.id = @current_loja_id`,
      );
      await conn.query("UPDATE lojas SET razao_social = ?, cnpj = ? WHERE id = ?", [
        data.nome_entidade,
        data.cnpj,
        lojaId,
      ]);
      // configuracoes_lgpd guarda só o e-mail do DPO agora — precisa existir
      // a linha (ligada 1:1 com a Loja) pra o UPDATE ter o que atualizar.
      await conn.query(
        `INSERT INTO configuracoes_lgpd (loja_id, email_dpo) VALUES (@current_loja_id, ?)
         ON DUPLICATE KEY UPDATE email_dpo = VALUES(email_dpo)`,
        [data.email_dpo],
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
