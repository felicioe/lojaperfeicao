import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./backend/db";
import { usuarioUnicoParaLogin } from "./backend/login-loja";

// Lógica pesada do fluxo OAuth do Facebook — espelha
// google-oauth-callback.ts (issue #98) quase exatamente, só troca os
// endpoints e a forma de obter o id do usuário (Facebook não devolve um
// id_token OIDC no fluxo clássico: troca o code por access_token e depois
// consulta a Graph API por esse id). Isolado aqui e importado só por
// server.ts pelo mesmo motivo: evita que db.ts vaze pro bundle do cliente.

const AUTHORIZE_URL = "https://www.facebook.com/v21.0/dialog/oauth";
const TOKEN_URL = "https://graph.facebook.com/v21.0/oauth/access_token";
const ME_URL = "https://graph.facebook.com/me";
const ESTADO_TTL_MS = 5 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;

function origemPublica(): string {
  return process.env.PUBLIC_ORIGIN || "http://localhost:5173";
}

function redirectUri(): string {
  return `${origemPublica()}/api/auth/facebook/callback`;
}

export async function gerarUrlAutorizacaoFacebook(
  tipo: "login" | "vincular",
  usuarioIdVinculacao: string | null,
): Promise<string> {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) {
    throw new Error("Login com Facebook não está configurado neste servidor.");
  }

  const state = randomUUID();
  const expiraEm = new Date(Date.now() + ESTADO_TTL_MS);
  await withUserConnection(usuarioIdVinculacao, (conn) =>
    conn.query(
      "INSERT INTO facebook_oauth_state (state, tipo, usuario_id_vinculacao, expira_em) VALUES (?, ?, ?, ?)",
      [state, tipo, usuarioIdVinculacao, expiraEm],
    ),
  );

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "public_profile",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function tratarCallbackFacebook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const erroFacebook = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (erroFacebook || !code || !state) {
    return Response.redirect(`${origemPublica()}/auth?erroFacebook=cancelado`, 302);
  }

  const estado = await withUserConnection(null, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM facebook_oauth_state WHERE state = ? AND usado = FALSE AND expira_em > NOW()",
      [state],
    );
    const row = rows[0];
    if (!row) return null;
    await conn.query("UPDATE facebook_oauth_state SET usado = TRUE WHERE state = ?", [state]);
    return row;
  });
  if (!estado) {
    return Response.redirect(`${origemPublica()}/auth?erroFacebook=expirado`, 302);
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return Response.redirect(`${origemPublica()}/auth?erroFacebook=nao_configurado`, 302);
  }
  const destinoErro = estado.tipo === "login" ? "/auth" : "/conta/seguranca";

  const tokenParams = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri(),
    code,
  });
  const tokenResponse = await fetch(`${TOKEN_URL}?${tokenParams.toString()}`);
  if (!tokenResponse.ok) {
    console.error("Falha ao trocar código do Facebook por token:", await tokenResponse.text());
    return Response.redirect(`${origemPublica()}${destinoErro}?erroFacebook=falha_token`, 302);
  }
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    return Response.redirect(`${origemPublica()}${destinoErro}?erroFacebook=falha_token`, 302);
  }

  const meResponse = await fetch(
    `${ME_URL}?${new URLSearchParams({ access_token: tokenPayload.access_token }).toString()}`,
  );
  if (!meResponse.ok) {
    console.error("Falha ao consultar Graph API do Facebook:", await meResponse.text());
    return Response.redirect(`${origemPublica()}${destinoErro}?erroFacebook=falha_token`, 302);
  }
  const me = (await meResponse.json()) as { id?: string };
  if (!me.id) {
    return Response.redirect(`${origemPublica()}${destinoErro}?erroFacebook=falha_token`, 302);
  }
  const facebookId = me.id;

  if (estado.tipo === "login") {
    const usuario = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM usuarios WHERE facebook_id = ? AND ativo = TRUE",
        [facebookId],
      );
      return usuarioUnicoParaLogin(rows);
    });
    if (!usuario) {
      return Response.redirect(`${origemPublica()}/auth?erroFacebook=nao_vinculado`, 302);
    }
    const ticket = randomUUID();
    await withUserConnection(usuario.id as string, (conn) =>
      conn.query(
        "INSERT INTO facebook_login_tickets (id, usuario_id, expira_em) VALUES (?, ?, ?)",
        [ticket, usuario.id, new Date(Date.now() + TICKET_TTL_MS)],
      ),
    );
    return Response.redirect(`${origemPublica()}/facebook-concluir?ticket=${ticket}`, 302);
  }

  // tipo === "vincular"
  try {
    await withUserConnection(estado.usuario_id_vinculacao as string, (conn) =>
      conn.query("UPDATE usuarios SET facebook_id = ? WHERE id = ?", [
        facebookId,
        estado.usuario_id_vinculacao,
      ]),
    );
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      return Response.redirect(`${origemPublica()}/conta/seguranca?erroFacebook=ja_vinculada`, 302);
    }
    throw err;
  }
  return Response.redirect(`${origemPublica()}/conta/seguranca?facebook=vinculado`, 302);
}
