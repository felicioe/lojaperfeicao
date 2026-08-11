// Heurística pra distinguir HTML real (produzido pelo RichTextEditor) de
// texto puro legado — o importador de PDF de cronograma e o antigo
// Textarea de eventos gravaram observações/descrição como texto puro em
// sessoes/eventos antes desta feature (issue #228). Sem isso, um "<", ">"
// ou "&" nesse texto legado é interpretado como tag/entidade quebrada
// tanto pelo parser HTML do editor quanto pelo DOMPurify na exibição,
// corrompendo silenciosamente o conteúdo original.
export function pareceHtml(valor: string): boolean {
  return /^\s*<[a-z][a-z0-9]*(\s|>|\/)/i.test(valor);
}

export function normalizarRichText(valor: string): string {
  if (!valor) return "";
  if (pareceHtml(valor)) return valor;
  const escapado = valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escapado
    .split(/\n{2,}/)
    .map((par) => `<p>${par.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
