import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { executarDisparoNotificacoes } from "./lib/push-dispatch";
import { executarBackupAgendado } from "./lib/backup-dispatch";
import { tratarCallbackGoogle } from "./lib/google-oauth-callback";
import { tratarCallbackFacebook } from "./lib/facebook-oauth-callback";
import { executarLembretesFaturas, processarFilaEmails } from "./lib/email-dispatch";
import { carregarAgendaPublica } from "./lib/agenda-publica";
import { carregarNoticiasPublicas } from "./lib/noticias-publica";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Endpoint HTTP puro (fora do roteador do TanStack Start) para o cron job
// da Hostinger disparar as notificações push periódicas — precisa ser algo
// que um simples `curl`/`wget` agendado no hPanel consiga chamar, o que as
// rotas RPC de createServerFn não oferecem (esperam o formato de serialização
// interno do Start). Protegido por token — ver CRON_SECRET em .env.example.
async function tratarCronNotificacoes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/notificacoes") return null;

  const token = url.searchParams.get("token") ?? request.headers.get("x-cron-token");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || token !== esperado) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const resultado = await executarDisparoNotificacoes();
    return new Response(JSON.stringify(resultado), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ erro: (error as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// Mesmo padrão de tratarCronNotificacoes acima, para o cron de backup
// agendado (issue #85). Reaproveita o mesmo CRON_SECRET — não faz sentido
// exigir um segredo por job quando ambos rodam no mesmo hPanel/conta.
async function tratarCronBackup(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/backup") return null;

  const token = url.searchParams.get("token") ?? request.headers.get("x-cron-token");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || token !== esperado) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const resultado = await executarBackupAgendado("cron");
    return new Response(JSON.stringify(resultado), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ erro: (error as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// Mesmo padrão de tratarCronNotificacoes acima, para os lembretes de
// fatura por e-mail (issue #103, vencidas @ 12h). Reaproveita CRON_SECRET.
async function tratarCronLembretesEmail(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/lembretes-email") return null;

  const token = url.searchParams.get("token") ?? request.headers.get("x-cron-token");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || token !== esperado) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const resultado = await executarLembretesFaturas();
    // Todas as tentativas falharam (ex.: SMTP nunca configurado) — responder
    // 200 aqui deixaria o agendador do painel da Hostinger achar que o job
    // "rodou com sucesso" pra sempre, mesmo sem enviar um único e-mail.
    const falhaTotal = resultado.avaliadas > 0 && resultado.enviadas === 0 && resultado.falhas > 0;
    return new Response(JSON.stringify(resultado), {
      status: falhaTotal ? 500 : 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ erro: (error as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// Mesmo padrão, para processar fila de emails com retry automático
// (issue #XXX — fila de envio). CRON @ a cada 2 minutos.
async function tratarCronFilaEmails(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/processar-fila-email") return null;

  const token = url.searchParams.get("token") ?? request.headers.get("x-cron-token");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || token !== esperado) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const resultado = await processarFilaEmails();
    return new Response(JSON.stringify(resultado), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ erro: (error as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

async function tratarAgendaPublica(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/publico/agenda") return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const agenda = await carregarAgendaPublica();
    return new Response(JSON.stringify({ atualizado_em: new Date().toISOString(), agenda }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=900",
        "access-control-allow-origin": "https://associacaoadonhiramita.org",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ erro: "Agenda temporariamente indisponível." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

async function tratarNoticiasPublicas(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/publico/noticias") return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const noticias = await carregarNoticiasPublicas();
    return new Response(JSON.stringify({ atualizado_em: new Date().toISOString(), noticias }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300, stale-while-revalidate=900",
        "access-control-allow-origin": "https://associacaoadonhiramita.org",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ erro: "Notícias temporariamente indisponíveis." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

// Callback OAuth do Google — GET puro feito pelo navegador (redirect do
// Google), não pelo `fetch` da aplicação, então precisa ser um endpoint
// bruto fora do roteador do TanStack Start, mesmo motivo dos crons acima.
async function tratarCallbackGoogleOuNull(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/google/callback") return null;
  return tratarCallbackGoogle(request);
}

// Mesmo motivo do callback do Google acima, agora para o Facebook (issue #99).
async function tratarCallbackFacebookOuNull(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/facebook/callback") return null;
  return tratarCallbackFacebook(request);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const cronResponse = await tratarCronNotificacoes(request);
      if (cronResponse) return cronResponse;

      const backupResponse = await tratarCronBackup(request);
      if (backupResponse) return backupResponse;

      const lembretesResponse = await tratarCronLembretesEmail(request);
      if (lembretesResponse) return lembretesResponse;

      const filaEmailResponse = await tratarCronFilaEmails(request);
      if (filaEmailResponse) return filaEmailResponse;

      const agendaResponse = await tratarAgendaPublica(request);
      if (agendaResponse) return agendaResponse;

      const noticiasResponse = await tratarNoticiasPublicas(request);
      if (noticiasResponse) return noticiasResponse;

      const googleResponse = await tratarCallbackGoogleOuNull(request);
      if (googleResponse) return googleResponse;

      const facebookResponse = await tratarCallbackFacebookOuNull(request);
      if (facebookResponse) return facebookResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
