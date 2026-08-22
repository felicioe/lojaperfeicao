import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";

/**
 * Resolução de tenant por subdomínio (issue #338).
 *
 * O plano Hostinger atual (Cloud Startup) não tem certificado SSL wildcard —
 * só planos VPS têm. Por isso cada loja nova ganha um subdomínio cadastrado
 * à mão no hPanel (Domínios > Subdomínios), sempre sob o mesmo domínio base:
 * `<slug>.DOMINIO_BASE` (ex.: `adonhiram.sistema.associacaoadonhiramita.org`).
 * O SSL desse subdomínio é emitido automaticamente pela Hostinger — não
 * exige nenhuma configuração de código, só o cadastro manual no onboarding
 * de cada loja (ver mysql/README.md).
 *
 * DOMINIO_BASE reaproveita WEBAUTHN_RP_ID (issue #147) em vez de uma env var
 * nova: já é exatamente "o domínio do site em produção, sem protocolo/porta"
 * — o mesmo conceito que esta resolução precisa.
 */
const DOMINIO_BASE = process.env.WEBAUTHN_RP_ID || "localhost";

export type LojaResolvida = { id: string; slug: string; nome: string };

/**
 * Slug da loja a partir de um hostname já obtido (Host/X-Forwarded-Host).
 * Devolve null quando o host não é um subdomínio de loja reconhecível — ex.:
 * domínio institucional legado, IP, ou o próprio DOMINIO_BASE sem
 * subdomínio. Nesse caso quem chama decide o que fazer (hoje: cai no
 * comportamento pré-#338, sem filtro de loja).
 *
 * Em desenvolvimento (NODE_ENV !== "production"), quando o host não bate
 * com o padrão, cai pro header `x-dev-loja-slug` (por requisição — permite
 * testar duas lojas ao mesmo tempo, ex. via Playwright) ou pra env var
 * DEV_LOJA_SLUG (fallback do `npm run dev` manual, sem precisar de header).
 * Nenhum dos dois tem efeito em produção.
 */
export function slugDoHost(host: string | null, headerDevSlug?: string | null): string | null {
  const sufixo = `.${DOMINIO_BASE}`;
  if (host?.toLowerCase().endsWith(sufixo.toLowerCase())) {
    return host.slice(0, host.length - sufixo.length).toLowerCase();
  }

  if (process.env.NODE_ENV !== "production") {
    if (headerDevSlug) return headerDevSlug.toLowerCase();
    if (process.env.DEV_LOJA_SLUG) return process.env.DEV_LOJA_SLUG.toLowerCase();
  }

  return null;
}

/**
 * Host da requisição atual (Host/X-Forwarded-Host) a partir de um `Request`
 * puro — usado nos pontos que rodam FORA do pipeline do TanStack Start
 * (callbacks OAuth em server.ts, que recebem o Request direto e não têm
 * acesso ao H3Event de getRequestHost).
 */
function hostDaRequisicaoCrua(request: Request): string | null {
  const encaminhado = request.headers.get("x-forwarded-host");
  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return request.headers.get("host");
}

/** Slug da loja a partir de um Request puro (ver hostDaRequisicaoCrua). */
export function slugDaRequisicaoCrua(request: Request): string | null {
  return slugDoHost(hostDaRequisicaoCrua(request), request.headers.get("x-dev-loja-slug"));
}

/**
 * Slug da loja a partir da requisição atual, quando chamado de DENTRO do
 * pipeline do TanStack Start (qualquer createServerFn — login, signup,
 * OAuth "concluir") — usa o mesmo AsyncLocalStorage que session.ts já usa
 * pra ler/gravar o cookie de sessão.
 */
export function slugDaRequisicaoAtual(): string | null {
  const host = getRequestHost({ xForwardedHost: true });
  return slugDoHost(host ?? null, getRequestHeader("x-dev-loja-slug") ?? null);
}

/** Loja ativa correspondente a um slug, ou null se não existir/estiver inativa. */
export async function lojaPeloSlug(
  conn: PoolConnection,
  slug: string,
): Promise<LojaResolvida | null> {
  const [[loja]] = await conn.query<RowDataPacket[]>(
    "SELECT id, slug, nome FROM lojas WHERE slug = ? AND ativa = TRUE",
    [slug],
  );
  return (loja as LojaResolvida | undefined) ?? null;
}

export class SubdominioDesconhecidoError extends Error {
  constructor() {
    super("Este endereço não corresponde a nenhuma loja ativa. Verifique o link de acesso.");
  }
}

/**
 * Resolve o id da loja a filtrar num login (email/google_id/facebook_id),
 * a partir de um slug já extraído do host (ver slugDaRequisicaoAtual /
 * slugDaRequisicaoCrua). null = host não é um subdomínio de loja
 * reconhecível — quem chama segue sem filtro (comportamento pré-#338).
 * Lança SubdominioDesconhecidoError quando O SLUG existe mas não bate com
 * loja nenhuma ativa (subdomínio cadastrado errado, ou loja desativada).
 */
export async function lojaIdParaFiltroDeLogin(
  conn: PoolConnection,
  slug: string | null,
): Promise<string | null> {
  if (!slug) return null;
  const loja = await lojaPeloSlug(conn, slug);
  if (!loja) throw new SubdominioDesconhecidoError();
  return loja.id;
}
