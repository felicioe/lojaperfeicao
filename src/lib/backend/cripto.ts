import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Cifragem simétrica de segredos guardados no banco (issue #352 — senha SMTP
// por loja). Server-only: só é importado por módulos que já rodam no servidor.
//
// A chave é DERIVADA do SESSION_SECRET em vez de vir de uma variável própria.
// A alternativa (uma APP_CRYPTO_KEY separada) criaria mais um segredo que o
// administrador precisa guardar e nunca perder — e perder significaria dados
// indecifráveis. Derivando, o número de segredos continua o mesmo, e trocar o
// SESSION_SECRET degrada de forma previsível: a senha deixa de ser lida, a
// tela volta a pedi-la, e as sessões caem junto (que é o efeito esperado de
// trocar o segredo de sessão de qualquer forma).
const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12; // padrão do GCM
const TAMANHO_TAG = 16;

let chaveCache: Buffer | undefined;

function chave(): Buffer {
  if (chaveCache) return chaveCache;
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 16) {
    throw new Error(
      "SESSION_SECRET ausente ou muito curto — é dele que sai a chave de cifragem dos segredos guardados no banco.",
    );
  }
  // Salt fixo: o objetivo aqui é derivar uma chave estável a partir de um
  // segredo que já é aleatório e longo, não proteger uma senha de usuário
  // contra dicionário. Salt aleatório exigiria guardá-lo em algum lugar, o
  // que recria o problema que a derivação resolve.
  chaveCache = scryptSync(segredo, "sglfm:parametros-email:v1", 32);
  return chaveCache;
}

/** Cifra um segredo para gravar no banco. Formato: iv.tag.conteudo, em base64. */
export function cifrar(textoPuro: string): string {
  const iv = randomBytes(TAMANHO_IV);
  const cifrador = createCipheriv(ALGORITMO, chave(), iv);
  const conteudo = Buffer.concat([cifrador.update(textoPuro, "utf8"), cifrador.final()]);
  return [
    iv.toString("base64"),
    cifrador.getAuthTag().toString("base64"),
    conteudo.toString("base64"),
  ].join(".");
}

/**
 * Decifra um segredo lido do banco. Devolve null quando o valor não pode ser
 * lido — formato inesperado, ou SESSION_SECRET diferente do que cifrou.
 * Devolver null em vez de lançar é deliberado: quem chama trata como "não
 * configurado" e pede a senha de novo, em vez de derrubar a tela inteira.
 */
export function decifrar(valorGuardado: string): string | null {
  try {
    const [ivB64, tagB64, conteudoB64] = valorGuardado.split(".");
    if (!ivB64 || !tagB64 || !conteudoB64) return null;
    const tag = Buffer.from(tagB64, "base64");
    if (tag.length !== TAMANHO_TAG) return null;
    const decifrador = createDecipheriv(ALGORITMO, chave(), Buffer.from(ivB64, "base64"));
    decifrador.setAuthTag(tag);
    return Buffer.concat([
      decifrador.update(Buffer.from(conteudoB64, "base64")),
      decifrador.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
