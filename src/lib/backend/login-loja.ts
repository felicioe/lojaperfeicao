/**
 * Resolução da loja (tenant) no login — issue #337.
 *
 * Depois da migração 0092, os identificadores de login (`email`, `google_id`,
 * `facebook_id`) são únicos **por loja**, não globalmente: o mesmo e-mail em
 * duas lojas são duas contas separadas. Isso significa que uma busca por
 * identificador pode devolver mais de uma linha, e escolher "a primeira"
 * seria autenticar a pessoa numa loja arbitrária — exatamente o tipo de bug
 * que não pode existir num SaaS.
 *
 * Enquanto a resolução por subdomínio (issue #338) não existe, não há como
 * saber em qual loja a pessoa quer entrar quando o identificador é ambíguo.
 * A resposta correta então é recusar, não adivinhar. Com uma loja só
 * cadastrada (situação atual), nada muda na prática.
 *
 * Quando a #338 entrar, o caminho é: filtrar a busca pela loja do subdomínio
 * antes de chamar esta função — aí a ambiguidade deixa de existir na origem.
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
