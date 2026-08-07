import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { withUserConnection } from "./db";
import { criarSessao } from "./session";
import { carregarUsuarioComPapeis, type UsuarioSessao } from "./usuario-sessao";
import { registrarAuditoria } from "./auditoria";

// Login com Facebook (issue #99) — espelha google-auth.ts (issue #98) quase
// exatamente. Mesma decisão de vinculação manual, logado.

export const iniciarLoginFacebook = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ url: string }> => {
    const { gerarUrlAutorizacaoFacebook } = await import("../facebook-oauth-callback");
    const url = await gerarUrlAutorizacaoFacebook("login", null);
    return { url };
  },
);

export const iniciarVinculacaoFacebook = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ url: string }> => {
    return comSessao(async (_conn, usuarioId) => {
      const { gerarUrlAutorizacaoFacebook } = await import("../facebook-oauth-callback");
      const url = await gerarUrlAutorizacaoFacebook("vincular", usuarioId);
      return { url };
    });
  },
);

const concluirLoginSchema = z.object({ ticket: z.string().uuid() });

export const concluirLoginFacebook = createServerFn({ method: "POST" })
  .validator((d: unknown) => concluirLoginSchema.parse(d))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const usuarioId = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT usuario_id FROM facebook_login_tickets WHERE id = ? AND usado = FALSE AND expira_em > NOW()",
        [data.ticket],
      );
      const row = rows[0];
      if (!row) return null;
      await conn.query("UPDATE facebook_login_tickets SET usado = TRUE WHERE id = ?", [
        data.ticket,
      ]);
      return row.usuario_id as string;
    });
    if (!usuarioId) {
      throw new Error("Login expirado — tente novamente.");
    }

    await criarSessao(usuarioId);
    const sessao = await carregarUsuarioComPapeis(usuarioId);
    if (!sessao) throw new Error("Não foi possível entrar.");
    await withUserConnection(usuarioId, (conn) =>
      registrarAuditoria(conn, usuarioId, "login_facebook", "usuario", usuarioId),
    );
    return sessao;
  });

export const statusVinculacaoFacebook = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ vinculado: boolean }> => {
    return comSessao(async (conn, usuarioId) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        "SELECT (facebook_id IS NOT NULL) AS vinculado FROM usuarios WHERE id = ?",
        [usuarioId],
      );
      return { vinculado: !!row?.vinculado };
    });
  },
);

export const desvincularFacebook = createServerFn({ method: "POST" }).handler(async () => {
  return comSessao(async (conn, usuarioId) => {
    await conn.query("UPDATE usuarios SET facebook_id = NULL WHERE id = ?", [usuarioId]);
    await registrarAuditoria(conn, usuarioId, "desvincular_facebook", "usuario", usuarioId);
  });
});
