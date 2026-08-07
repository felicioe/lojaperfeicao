import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { withUserConnection } from "./db";
import { criarSessao } from "./session";
import { carregarUsuarioComPapeis, type UsuarioSessao } from "./usuario-sessao";
import { registrarAuditoria } from "./auditoria";

// Login com Google (issue #98) — vinculação manual, mesmo espírito das
// passkeys: o irmão precisa estar logado (senha) pra vincular a própria
// conta Google antes do botão "Entrar com Google" funcionar pra ele.
//
// A geração da URL de autorização e o tratamento do callback do Google
// moram em src/lib/google-oauth-callback.ts, importado aqui só via
// `import()` dinâmico dentro dos handlers — mesmo padrão de backups.ts —
// porque esse módulo puxa db.ts (que chama mysql.createPool() na
// importação) e este arquivo É importado por rotas do cliente (/auth,
// /conta/seguranca).

export const iniciarLoginGoogle = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ url: string }> => {
    const { gerarUrlAutorizacaoGoogle } = await import("../google-oauth-callback");
    const url = await gerarUrlAutorizacaoGoogle("login", null);
    return { url };
  },
);

export const iniciarVinculacaoGoogle = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ url: string }> => {
    return comSessao(async (_conn, usuarioId) => {
      const { gerarUrlAutorizacaoGoogle } = await import("../google-oauth-callback");
      const url = await gerarUrlAutorizacaoGoogle("vincular", usuarioId);
      return { url };
    });
  },
);

const concluirLoginSchema = z.object({ ticket: z.string().uuid() });

export const concluirLoginGoogle = createServerFn({ method: "POST" })
  .validator((d: unknown) => concluirLoginSchema.parse(d))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const usuarioId = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT usuario_id FROM google_login_tickets WHERE id = ? AND usado = FALSE AND expira_em > NOW()",
        [data.ticket],
      );
      const row = rows[0];
      if (!row) return null;
      await conn.query("UPDATE google_login_tickets SET usado = TRUE WHERE id = ?", [data.ticket]);
      return row.usuario_id as string;
    });
    if (!usuarioId) {
      throw new Error("Login expirado — tente novamente.");
    }

    await criarSessao(usuarioId);
    const sessao = await carregarUsuarioComPapeis(usuarioId);
    if (!sessao) throw new Error("Não foi possível entrar.");
    await withUserConnection(usuarioId, (conn) =>
      registrarAuditoria(conn, usuarioId, "login_google", "usuario", usuarioId),
    );
    return sessao;
  });

export const statusVinculacaoGoogle = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ vinculado: boolean }> => {
    return comSessao(async (conn, usuarioId) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        "SELECT (google_id IS NOT NULL) AS vinculado FROM usuarios WHERE id = ?",
        [usuarioId],
      );
      return { vinculado: !!row?.vinculado };
    });
  },
);

export const desvincularGoogle = createServerFn({ method: "POST" }).handler(async () => {
  return comSessao(async (conn, usuarioId) => {
    await conn.query("UPDATE usuarios SET google_id = NULL WHERE id = ?", [usuarioId]);
    await registrarAuditoria(conn, usuarioId, "desvincular_google", "usuario", usuarioId);
  });
});
