import "./lib/error-capture";

import defaultServerEntry, { createServerEntry } from "@tanstack/react-start/server-entry";
export * from "@tanstack/react-start/server";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, opts?: unknown) => Promise<Response> | Response;
};

const serverEntry = defaultServerEntry as ServerEntry;

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
    const { executarDisparoNotificacoes } = await import("./lib/push-dispatch");
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
    const { executarBackupAgendado } = await import("./lib/backup-dispatch");
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
    const { executarLembretesFaturas } = await import("./lib/email-dispatch");
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
// (mesma frente da issue #103 — fila de envio). CRON @ a cada 2 minutos.
async function tratarCronFilaEmails(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/processar-fila-email") return null;

  const token = url.searchParams.get("token") ?? request.headers.get("x-cron-token");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || token !== esperado) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { processarFilaEmails } = await import("./lib/email-dispatch");
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
    const { carregarAgendaPublica } = await import("./lib/agenda-publica");
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
    return new Response(
      JSON.stringify({
        atualizado_em: new Date().toISOString(),
        agenda: [],
        degradado: true,
        erro: "Agenda temporariamente indisponível.",
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "https://associacaoadonhiramita.org",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }
}

async function tratarNoticiasPublicas(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/publico/noticias") return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { carregarNoticiasPublicas } = await import("./lib/noticias-publica");
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
    return new Response(
      JSON.stringify({
        atualizado_em: new Date().toISOString(),
        noticias: [],
        degradado: true,
        erro: "Notícias temporariamente indisponíveis.",
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "https://associacaoadonhiramita.org",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }
}

const CORS_HEADERS_PORTAL_PUBLICO = {
  "cache-control": "public, max-age=300, stale-while-revalidate=900",
  "access-control-allow-origin": "https://associacaoadonhiramita.org",
  "x-content-type-options": "nosniff",
} as const;

const CORS_HEADERS_PORTAL_PUBLICO_SEM_CACHE = {
  "access-control-allow-origin": "https://associacaoadonhiramita.org",
  "x-content-type-options": "nosniff",
} as const;

// Duas rotas: /api/publico/paginas (índice título+slug, pra montar navegação
// — issue #382) e /api/publico/paginas/:slug (conteúdo de uma página). Path
// dinâmico, então não dá pra comparar pathname inteiro como os outros
// endpoints públicos deste arquivo.
async function tratarPaginasSitePublicas(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const prefixo = "/api/publico/paginas";
  if (!url.pathname.startsWith(prefixo)) return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const resto = url.pathname.slice(prefixo.length).replace(/^\/+/, "");
  try {
    const { listarPaginasPublicas, carregarPaginaPublicaPorSlug } = await import(
      "./lib/paginas-site-publica"
    );
    if (!resto) {
      const paginas = await listarPaginasPublicas();
      return new Response(JSON.stringify({ atualizado_em: new Date().toISOString(), paginas }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...CORS_HEADERS_PORTAL_PUBLICO,
        },
      });
    }

    const pagina = await carregarPaginaPublicaPorSlug(decodeURIComponent(resto));
    if (!pagina) {
      return new Response(JSON.stringify({ erro: "Página não encontrada." }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(JSON.stringify(pagina), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...CORS_HEADERS_PORTAL_PUBLICO,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        atualizado_em: new Date().toISOString(),
        paginas: resto ? null : [],
        degradado: true,
        erro: "Página temporariamente indisponível.",
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...CORS_HEADERS_PORTAL_PUBLICO_SEM_CACHE,
        },
      },
    );
  }
}

async function tratarMenuSitePublico(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/publico/menu") return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { carregarMenuPublico } = await import("./lib/menu-site-publica");
    const menu = await carregarMenuPublico();
    return new Response(JSON.stringify({ atualizado_em: new Date().toISOString(), menu }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...CORS_HEADERS_PORTAL_PUBLICO,
      },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        atualizado_em: new Date().toISOString(),
        menu: [],
        degradado: true,
        erro: "Menu temporariamente indisponível.",
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          ...CORS_HEADERS_PORTAL_PUBLICO_SEM_CACHE,
        },
      },
    );
  }
}

async function tratarHealthcheck(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/health") return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { verificarSaudeBanco } = await import("./lib/backend/db");
    await verificarSaudeBanco();
    return new Response(
      JSON.stringify({
        ok: true,
        service: "lojaperfeicao",
        checked_at: new Date().toISOString(),
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(error);
    const detalhe =
      error && typeof error === "object"
        ? {
            erro: error instanceof Error ? error.message : "Falha interna.",
            code: "code" in error ? error.code : undefined,
            errno: "errno" in error ? error.errno : undefined,
            syscall: "syscall" in error ? error.syscall : undefined,
            path: "path" in error ? error.path : undefined,
          }
        : { erro: "Falha interna." };
    return new Response(
      JSON.stringify({
        ok: false,
        service: "lojaperfeicao",
        checked_at: new Date().toISOString(),
        ...detalhe,
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }
}

// Callback OAuth do Google — GET puro feito pelo navegador (redirect do
// Google), não pelo `fetch` da aplicação, então precisa ser um endpoint
// bruto fora do roteador do TanStack Start, mesmo motivo dos crons acima.
async function tratarCallbackGoogleOuNull(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/google/callback") return null;
  const { tratarCallbackGoogle } = await import("./lib/google-oauth-callback");
  return tratarCallbackGoogle(request);
}

// Mesmo motivo do callback do Google acima, agora para o Facebook (issue #99).
async function tratarCallbackFacebookOuNull(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/facebook/callback") return null;
  const { tratarCallbackFacebook } = await import("./lib/facebook-oauth-callback");
  return tratarCallbackFacebook(request);
}

export default createServerEntry({
  async fetch(request: Request, opts?: unknown) {
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

      const paginasSiteResponse = await tratarPaginasSitePublicas(request);
      if (paginasSiteResponse) return paginasSiteResponse;

      const menuSiteResponse = await tratarMenuSitePublico(request);
      if (menuSiteResponse) return menuSiteResponse;

      const healthResponse = await tratarHealthcheck(request);
      if (healthResponse) return healthResponse;

      const googleResponse = await tratarCallbackGoogleOuNull(request);
      if (googleResponse) return googleResponse;

      const facebookResponse = await tratarCallbackFacebookOuNull(request);
      if (facebookResponse) return facebookResponse;

      const response = await serverEntry.fetch(request, opts);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
});
