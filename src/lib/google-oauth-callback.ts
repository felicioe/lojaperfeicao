import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./backend/db";
import { usuarioUnicoParaLogin } from "./backend/login-loja";

// Lógica pesada do fluxo OAuth do Google (troca de código por token, leitura
// do id_token, redirects finais) — isolada aqui e importada só por
// server.ts (nunca por um arquivo alcançável pelo cliente), mesmo motivo de
// backup-dispatch.ts/push-dispatch.ts: evita que db.ts (que chama
// mysql.createPool() na importação) vaze pro bundle do navegador.
//
// O callback do Google (redirect_uri) é um GET puro do navegador, fora do
// pipeline de request do TanStack Start — por isso não dá pra chamar
// criarSessao() direto aqui (precisa de H3Event, que só existe dentro do
// pipeline). Em vez disso, geramos um ticket de uso único e redirecionamos
// pra uma rota normal do app, que aí sim roda dentro do pipeline e termina
// o login. Ver comentário no topo de mysql/migrations/0041_google_login.sql.

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ESTADO_TTL_MS = 5 * 60 * 1000; // 5 min pra completar o fluxo no Google
const TICKET_TTL_MS = 60 * 1000; // 60s pra trocar o ticket pela sessão

function origemPublica(): string {
  return process.env.PUBLIC_ORIGIN || "http://localhost:5173";
}

function redirectUri(): string {
  return `${origemPublica()}/api/auth/google/callback`;
}

export async function gerarUrlAutorizacaoGoogle(
  tipo: "login" | "vincular",
  usuarioIdVinculacao: string | null,
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Login com Google não está configurado neste servidor.");
  }

  const state = randomUUID();
  const expiraEm = new Date(Date.now() + ESTADO_TTL_MS);
  await withUserConnection(usuarioIdVinculacao, (conn) =>
    conn.query(
      "INSERT INTO google_oauth_state (state, tipo, usuario_id_vinculacao, expira_em) VALUES (?, ?, ?, ?)",
      [state, tipo, usuarioIdVinculacao, expiraEm],
    ),
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function decodificarIdToken(idToken: string): { sub: string; email: string | null } {
  // Só decodifica o payload (sem verificar assinatura) — seguro aqui porque
  // o id_token veio direto do endpoint de token do Google numa chamada
  // servidor-a-servidor autenticada com nosso client_secret via HTTPS, não
  // de um caminho não confiável (ex.: enviado pelo navegador).
  const partes = idToken.split(".");
  if (partes.length !== 3) throw new Error("id_token inválido.");
  const payload = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  if (!payload.sub) throw new Error("id_token sem sub.");
  return { sub: String(payload.sub), email: payload.email ? String(payload.email) : null };
}

export async function tratarCallbackGoogle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const erroGoogle = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (erroGoogle || !code || !state) {
    return Response.redirect(`${origemPublica()}/auth?erroGoogle=cancelado`, 302);
  }

  const estado = await withUserConnection(null, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT * FROM google_oauth_state WHERE state = ? AND usado = FALSE AND expira_em > NOW()",
      [state],
    );
    const row = rows[0];
    if (!row) return null;
    await conn.query("UPDATE google_oauth_state SET usado = TRUE WHERE state = ?", [state]);
    return row;
  });
  if (!estado) {
    return Response.redirect(`${origemPublica()}/auth?erroGoogle=expirado`, 302);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(`${origemPublica()}/auth?erroGoogle=nao_configurado`, 302);
  }

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    console.error("Falha ao trocar código do Google por token:", await tokenResponse.text());
    const destino = estado.tipo === "login" ? "/auth" : "/conta/seguranca";
    return Response.redirect(`${origemPublica()}${destino}?erroGoogle=falha_token`, 302);
  }
  const tokenPayload = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenPayload.id_token) {
    const destino = estado.tipo === "login" ? "/auth" : "/conta/seguranca";
    return Response.redirect(`${origemPublica()}${destino}?erroGoogle=falha_token`, 302);
  }

  const { sub } = decodificarIdToken(tokenPayload.id_token);

  if (estado.tipo === "login") {
    const usuario = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM usuarios WHERE google_id = ? AND ativo = TRUE",
        [sub],
      );
      return usuarioUnicoParaLogin(rows);
    });
    if (!usuario) {
      return Response.redirect(`${origemPublica()}/auth?erroGoogle=nao_vinculado`, 302);
    }
    const ticket = randomUUID();
    await withUserConnection(usuario.id as string, (conn) =>
      conn.query("INSERT INTO google_login_tickets (id, usuario_id, expira_em) VALUES (?, ?, ?)", [
        ticket,
        usuario.id,
        new Date(Date.now() + TICKET_TTL_MS),
      ]),
    );
    return Response.redirect(`${origemPublica()}/google-concluir?ticket=${ticket}`, 302);
  }

  // tipo === "vincular"
  try {
    await withUserConnection(estado.usuario_id_vinculacao as string, (conn) =>
      conn.query("UPDATE usuarios SET google_id = ? WHERE id = ?", [
        sub,
        estado.usuario_id_vinculacao,
      ]),
    );
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      return Response.redirect(`${origemPublica()}/conta/seguranca?erroGoogle=ja_vinculada`, 302);
    }
    throw err;
  }
  return Response.redirect(`${origemPublica()}/conta/seguranca?google=vinculado`, 302);
}
