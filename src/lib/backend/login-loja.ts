/**
 * Resolução da loja (tenant) no login — issues #337 e #338.
 *
 * Depois da migração 0092, os identificadores de login (`email`, `google_id`,
 * `facebook_id`) são únicos **por loja**, não globalmente: o mesmo e-mail em
 * duas lojas são duas contas separadas. Isso significa que uma busca por
 * identificador pode devolver mais de uma linha, e escolher "a primeira"
 * seria autenticar a pessoa numa loja arbitrária — exatamente o tipo de bug
 * que não pode existir num SaaS.
 *
 * A #338 (subdominio.ts) resolve a loja pelo subdomínio ANTES da busca —
 * quem chama (auth.ts, google/facebook-oauth-callback.ts) já filtra a
 * query por `loja_id` quando o host bate com um subdomínio de loja
 * reconhecível. A ambiguidade só sobrevive quando o host não é um
 * subdomínio de loja (domínio legado, dev sem DEV_LOJA_SLUG) — nesse caso a
 * resposta correta continua sendo recusar, não adivinhar.
 */

export class LoginAmbiguoError extends Error {
  constructor() {
    super("Este login existe em mais de uma loja. Acesse pelo endereço da sua loja para entrar.");
  }
}

/**
 * Recebe as linhas já buscadas por um identificador de login e devolve a
 * única correspondente — ou null se não houver nenhuma. Recusa (em vez de
 * escolher uma) quando o identificador casa em mais de uma loja.
 */
export function usuarioUnicoParaLogin<T>(linhas: T[]): T | null {
  if (linhas.length === 0) return null;
  if (linhas.length > 1) throw new LoginAmbiguoError();
  return linhas[0];
}
