/**
 * Texto de erro para mostrar ao usuário, a partir de qualquer coisa lançada.
 *
 * Existe porque o padrão `(e: any) => toast.error(e.message)` estava repetido
 * em vários `onError` de mutation: `any` só para alcançar `.message` sem o
 * compilador reclamar. O tipo real do que um catch recebe é `unknown` — pode
 * ser um Error, uma string, ou qualquer valor —, e é isso que esta função
 * trata.
 *
 * O segundo parâmetro é o texto de reserva quando não há mensagem
 * aproveitável; sem ele o usuário veria "undefined" ou "[object Object]".
 */
export function mensagemDeErro(erro: unknown, reserva = "Ocorreu um erro."): string {
  if (erro instanceof Error && erro.message) return erro.message;
  if (typeof erro === "string" && erro) return erro;
  if (typeof erro === "object" && erro !== null && "message" in erro) {
    const message = (erro as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return reserva;
}
