import "./lib/error-capture";

import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { executarDisparoNotificacoes } from "./lib/push-dispatch";
import { executarBackupAgendado } from "./lib/backup-dispatch";
import { tratarCallbackGoogle } from "./lib/google-oauth-callback";
import { tratarCallbackFacebook } from "./lib/facebook-oauth-callback";
import { executarLembretesFaturas } from "./lib/email-dispatch";

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

// irmaos.ts, orgs.ts, pecas-arquitetura.ts, documentos.ts e sgcab.ts gravam
// uploads em disco (node:fs/promises) sob public/uploads/... em tempo de
// execução, contando que o Nitro sirva esses arquivos como estático — mas
// o preset "node-server" gera, em build time, um MANIFESTO CONGELADO dos
// arquivos que existiam em public/ naquele momento (ver
// .output/server/index.mjs, `public_assets_data_default`) e serve só a
// partir dele: qualquer arquivo enviado DEPOIS do deploy (ou seja, todo
// upload feito pelos usuários em produção) não está no manifesto e cai em
// 404, em qualquer navegador/aparelho — não é um problema de PWA/cache nem
// específico de celular, é o servidor Node de produção nunca lendo o
// diretório ao vivo. Intercepta /uploads/* aqui e lê do disco a cada
// requisição, contornando o manifesto do Nitro.
const UPLOADS_MIME_POR_EXTENSAO: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

async function tratarUploadEstatico(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/uploads/")) return null;

  const baseDir = resolve(process.cwd(), "public", "uploads");
  const caminhoAbsoluto = resolve(process.cwd(), "public", `.${decodeURIComponent(url.pathname)}`);
  if (!caminhoAbsoluto.startsWith(baseDir)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const conteudo = await readFile(caminhoAbsoluto);
    const mime =
      UPLOADS_MIME_POR_EXTENSAO[extname(caminhoAbsoluto).toLowerCase()] ??
      "application/octet-stream";
    return new Response(conteudo, {
      headers: { "content-type": mime, "cache-control": "public, max-age=3600" },
    });
  } catch {
    return new Response("Arquivo não encontrado.", { status: 404 });
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
// fatura por e-mail (issue #103). Reaproveita o mesmo CRON_SECRET.
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
      const uploadResponse = await tratarUploadEstatico(request);
      if (uploadResponse) return uploadResponse;

      const cronResponse = await tratarCronNotificacoes(request);
      if (cronResponse) return cronResponse;

      const backupResponse = await tratarCronBackup(request);
      if (backupResponse) return backupResponse;

      const lembretesResponse = await tratarCronLembretesEmail(request);
      if (lembretesResponse) return lembretesResponse;

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
