import "./lib/error-capture";

import defaultServerEntry, { createServerEntry } from "@tanstack/react-start/server-entry";
export * from "@tanstack/react-start/server";

import { brotliCompress, gzip, constants as zlibConstants } from "node:zlib";
import { promisify } from "node:util";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, opts?: unknown) => Promise<Response> | Response;
};

const serverEntry = defaultServerEntry as ServerEntry;

// achado #676 (auditoria de performance mobile) — confirmado que a resposta
// SSR (o HTML de cada navegação, gerado dinamicamente por requisição) não
// tinha content-encoding nenhum, mesmo o cliente pedindo — só os assets
// ESTÁTICOS (.js/.css) já saíam comprimidos (compressPublicAssets no
// vite.config.ts, pré-computado em build). Aqui é o equivalente pra
// resposta dinâmica: comprime em runtime, uma vez por requisição.
//
// brotli/gzip async (não a variante *Sync): a versão async do zlib do
// Node roda na threadpool do libuv, não bloqueia o event loop — importante
// num processo Node único servindo todo mundo na Hostinger compartilhada.
// Qualidade de brotli moderada (4, não os 11 usados no build estático):
// comprimir em runtime a cada requisição com qualidade máxima custaria CPU
// demais por byte ganho a mais; 4 já entrega a maior parte do ganho de
// tamanho por uma fração do custo.
const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const TIPOS_COMPRIMIVEIS = [
  "text/html",
  "application/json",
  "text/plain",
  "text/css",
  "application/javascript",
  "image/svg+xml",
];
const TAMANHO_MINIMO_COMPRESSAO_BYTES = 1024;

async function comComPressaoSeAplicavel(request: Request, response: Response): Promise<Response> {
  // Já comprimido (ex.: os endpoints de imagem/anexo de notícia servem
  // binário puro, sem content-type de texto — nem chegam aqui) ou o
  // chamador já setou content-encoding por algum motivo — nunca comprime
  // duas vezes.
  if (response.headers.has("content-encoding")) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!TIPOS_COMPRIMIVEIS.some((t) => contentType.includes(t))) return response;

  const aceita = request.headers.get("accept-encoding") ?? "";
  const podeBrotli = aceita.includes("br");
  const podeGzip = aceita.includes("gzip");
  if (!podeBrotli && !podeGzip) return response;

  const original = Buffer.from(await response.arrayBuffer());
  const headers = new Headers(response.headers);
  // Corpo pequeno: o cabeçalho de compressão + o overhead do algoritmo
  // custam mais do que valem — devolve sem comprimir, mas via novo Response
  // porque o body original já foi consumido pelo arrayBuffer() acima.
  if (original.byteLength < TAMANHO_MINIMO_COMPRESSAO_BYTES) {
    return new Response(new Uint8Array(original), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  try {
    let comprimido: Buffer;
    if (podeBrotli) {
      comprimido = await brotliCompressAsync(original, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: original.byteLength,
        },
      });
      headers.set("content-encoding", "br");
    } else {
      comprimido = await gzipAsync(original, { level: 6 });
      headers.set("content-encoding", "gzip");
    }
    headers.set("content-length", String(comprimido.byteLength));
    // Vary obrigatório: um proxy/CDN na frente não pode servir a versão
    // comprimida pra quem mandou Accept-Encoding diferente.
    headers.append("vary", "accept-encoding");
    return new Response(new Uint8Array(comprimido), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    // Falha ao comprimir nunca pode derrubar a resposta em si — devolve sem
    // comprimir, degradação graciosa (mesma filosofia dos outros handlers
    // públicos deste arquivo, que caem pra um estado "degradado" em vez de
    // propagar erro pro visitante).
    console.error("[compressao] falha ao comprimir resposta:", error);
    return new Response(new Uint8Array(original), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

async function withSecurityHeaders(request: Request, response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  // Sem includeSubDomains: este mesmo app serve tanto o subdomínio do sistema
  // quanto o domínio institucional puro (ver SiteInstitucionalLayout.tsx), e a
  // Hostinger pode ter outros subdomínios (webmail, cpanel etc.) fora do
  // controle deste código — HSTS com includeSubDomains forçaria HTTPS neles
  // também, por até um ano, sem forma fácil de desfazer pra quem já visitou.
  headers.set("strict-transport-security", "max-age=31536000");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      // 'unsafe-inline' em script-src: TanStack Start injeta o script de
      // hidratação/streaming SSR inline no HTML (sem nonce disponível hoje);
      // ainda assim bloqueia carregar scripts de domínios externos via src=.
      "script-src 'self' 'unsafe-inline'",
      // 'unsafe-inline' em style-src: chart.tsx injeta um <style> inline com
      // as cores do tema de cada gráfico (Recharts).
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "frame-src 'self' blob:",
      "connect-src 'self' https://viacep.com.br",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  );
  const comHeaders = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return comComPressaoSeAplicavel(request, comHeaders);
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

// Mesmo padrão, para gerar previsões de despesas recorrentes (achado de
// performance da auditoria geral: gerar_previsoes_recorrentes fazia um
// cursor + até 11 INSERTs por recorrente, chamado de forma síncrona em toda
// leitura de dashboard/fluxo-de-caixa/contas-a-pagar — 8,7s numa única
// requisição do dashboard em produção). Granularidade mensal não precisa de
// mais que atualização diária.
async function tratarCronPrevisoesRecorrentes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/previsoes-recorrentes") return null;

  const token = url.searchParams.get("token") ?? request.headers.get("x-cron-token");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || token !== esperado) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { executarGeracaoPrevisoesRecorrentes } =
      await import("./lib/backend/tesouraria-recorrentes");
    const resultado = await executarGeracaoPrevisoesRecorrentes();
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

// Mesmo padrão, para extrair (em lotes pequenos) o texto dos PDFs de
// Legislação/Biblioteca de Peças usados pelos assistentes de IA (#648,
// #657) — ver extracao-texto-ia.ts sobre por que isso NÃO roda dentro da
// própria pergunta ao assistente (504 em produção). Reaproveita
// CRON_SECRET.
async function tratarCronExtracaoTextoIA(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/cron/extrair-textos-ia") return null;

  const token = url.searchParams.get("token") ?? request.headers.get("x-cron-token");
  const esperado = process.env.CRON_SECRET;
  if (!esperado || token !== esperado) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { executarExtracaoTextoIA } = await import("./lib/backend/extracao-texto-ia");
    const resultado = await executarExtracaoTextoIA();
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

// achado #676 (auditoria de performance mobile) — imagem de capa/anexo de
// notícia deixaram de ir embutidos como data: URL no HTML/loader de
// /noticias/:id (podiam chegar a ~11MB em base64 pra uma imagem de 8MB, sem
// nenhuma compressão dinâmica do SSR — confirmado testando localmente que
// a resposta HTML não tem content-encoding nenhum, ao contrário dos assets
// estáticos). Servidos por rota própria, binário puro, com Cache-Control:
// cacheável pelo navegador entre visitas (o data: URL embutido nunca era) e
// fora do payload de toda navegação/compartilhamento da página.
const CACHE_CONTROL_IMAGEM_NOTICIA = "public, max-age=3600, stale-while-revalidate=86400";

async function tratarImagemCapaNoticiaPublica(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/api\/publico\/noticias\/([0-9a-f-]{36})\/imagem$/i.exec(url.pathname);
  if (!match) return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { carregarImagemCapaNoticiaPublica } = await import("./lib/noticias-publica");
    const imagem = await carregarImagemCapaNoticiaPublica(match[1]);
    if (!imagem) return new Response("Not Found", { status: 404 });
    return new Response(new Uint8Array(imagem.buffer), {
      headers: {
        "content-type": imagem.mime,
        "cache-control": CACHE_CONTROL_IMAGEM_NOTICIA,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Erro ao carregar imagem.", { status: 500 });
  }
}

async function tratarAnexoNoticiaPublica(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/api\/publico\/noticias\/([0-9a-f-]{36})\/anexo$/i.exec(url.pathname);
  if (!match) return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { carregarAnexoNoticiaPublica } = await import("./lib/noticias-publica");
    const anexo = await carregarAnexoNoticiaPublica(match[1]);
    if (!anexo) return new Response("Not Found", { status: 404 });
    const headers: Record<string, string> = {
      "content-type": anexo.mime,
      "cache-control": CACHE_CONTROL_IMAGEM_NOTICIA,
      "x-content-type-options": "nosniff",
    };
    if (anexo.nomeOriginal) {
      // Nome do arquivo pode ter aspas/acentos — encodeURIComponent com
      // filename* (RFC 5987) evita quebrar o header com caractere especial.
      headers["content-disposition"] =
        `attachment; filename*=UTF-8''${encodeURIComponent(anexo.nomeOriginal)}`;
    }
    return new Response(new Uint8Array(anexo.buffer), { headers });
  } catch (error) {
    console.error(error);
    return new Response("Erro ao carregar anexo.", { status: 500 });
  }
}

// Download autenticado de arquivo — Documentos (Legislação) e Peças de
// Arquitetura (Biblioteca), issue #710. Diferente das rotas de notícia
// acima (públicas, sem sessão): estas exigem sessão válida — a mesma regra
// de leitura que a tela de origem já usa (ver src/lib/backend/downloads-
// arquivo.ts, que reaproveita comSessao/PODE_VER_CONDICAO via
// comSessaoCrua). "private, no-store": conteúdo depende de quem pediu
// (grau/situação da peça, papel do usuário) — não pode ficar em cache
// compartilhado nem sobreviver a uma mudança de permissão.
const CACHE_CONTROL_ARQUIVO_AUTENTICADO = "private, no-store";

function respostaArquivoAutenticado(
  arquivo: { mime: string; buffer: Buffer; nomeOriginal: string | null } | null,
): Response {
  if (!arquivo) return new Response("Not Found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": arquivo.mime,
    "cache-control": CACHE_CONTROL_ARQUIVO_AUTENTICADO,
    "x-content-type-options": "nosniff",
  };
  if (arquivo.nomeOriginal) {
    headers["content-disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(arquivo.nomeOriginal)}`;
  }
  return new Response(new Uint8Array(arquivo.buffer), { headers });
}

async function tratarArquivoDocumento(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/api\/documentos\/([0-9a-f-]{36})\/arquivo$/i.exec(url.pathname);
  if (!match) return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { carregarArquivoDocumentoAutenticado } = await import("./lib/backend/downloads-arquivo");
    const arquivo = await carregarArquivoDocumentoAutenticado(request, match[1]);
    return respostaArquivoAutenticado(arquivo);
  } catch (error) {
    const { SemPermissaoError } = await import("./lib/backend/authz");
    if (error instanceof SemPermissaoError) {
      return new Response("Unauthorized", { status: 401 });
    }
    console.error(error);
    return new Response("Erro ao carregar arquivo.", { status: 500 });
  }
}

async function tratarArquivoPeca(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/api\/biblioteca\/([0-9a-f-]{36})\/arquivo$/i.exec(url.pathname);
  if (!match) return null;
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { carregarArquivoPecaAutenticado } = await import("./lib/backend/downloads-arquivo");
    const arquivo = await carregarArquivoPecaAutenticado(request, match[1]);
    return respostaArquivoAutenticado(arquivo);
  } catch (error) {
    const { SemPermissaoError } = await import("./lib/backend/authz");
    if (error instanceof SemPermissaoError) {
      return new Response("Unauthorized", { status: 401 });
    }
    console.error(error);
    return new Response("Erro ao carregar arquivo.", { status: 500 });
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
    const { listarPaginasPublicas, carregarPaginaPublicaPorSlug } =
      await import("./lib/paginas-site-publica");
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

export default createServerEntry({
  async fetch(request: Request, opts?: unknown) {
    try {
      const cronResponse = await tratarCronNotificacoes(request);
      if (cronResponse) return await withSecurityHeaders(request, cronResponse);

      const backupResponse = await tratarCronBackup(request);
      if (backupResponse) return await withSecurityHeaders(request, backupResponse);

      const lembretesResponse = await tratarCronLembretesEmail(request);
      if (lembretesResponse) return await withSecurityHeaders(request, lembretesResponse);

      const filaEmailResponse = await tratarCronFilaEmails(request);
      if (filaEmailResponse) return await withSecurityHeaders(request, filaEmailResponse);

      const previsoesRecorrentesResponse = await tratarCronPrevisoesRecorrentes(request);
      if (previsoesRecorrentesResponse)
        return await withSecurityHeaders(request, previsoesRecorrentesResponse);

      const extracaoTextoIAResponse = await tratarCronExtracaoTextoIA(request);
      if (extracaoTextoIAResponse)
        return await withSecurityHeaders(request, extracaoTextoIAResponse);

      const agendaResponse = await tratarAgendaPublica(request);
      if (agendaResponse) return await withSecurityHeaders(request, agendaResponse);

      const noticiasResponse = await tratarNoticiasPublicas(request);
      if (noticiasResponse) return await withSecurityHeaders(request, noticiasResponse);

      const imagemNoticiaResponse = await tratarImagemCapaNoticiaPublica(request);
      if (imagemNoticiaResponse) return await withSecurityHeaders(request, imagemNoticiaResponse);

      const anexoNoticiaResponse = await tratarAnexoNoticiaPublica(request);
      if (anexoNoticiaResponse) return await withSecurityHeaders(request, anexoNoticiaResponse);

      const arquivoDocumentoResponse = await tratarArquivoDocumento(request);
      if (arquivoDocumentoResponse)
        return await withSecurityHeaders(request, arquivoDocumentoResponse);

      const arquivoPecaResponse = await tratarArquivoPeca(request);
      if (arquivoPecaResponse) return await withSecurityHeaders(request, arquivoPecaResponse);

      const paginasSiteResponse = await tratarPaginasSitePublicas(request);
      if (paginasSiteResponse) return await withSecurityHeaders(request, paginasSiteResponse);

      const menuSiteResponse = await tratarMenuSitePublico(request);
      if (menuSiteResponse) return await withSecurityHeaders(request, menuSiteResponse);

      const healthResponse = await tratarHealthcheck(request);
      if (healthResponse) return await withSecurityHeaders(request, healthResponse);

      const googleResponse = await tratarCallbackGoogleOuNull(request);
      if (googleResponse) return await withSecurityHeaders(request, googleResponse);

      const response = await serverEntry.fetch(request, opts);
      return await withSecurityHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return await withSecurityHeaders(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
});
