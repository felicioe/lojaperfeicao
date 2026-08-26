const TAGS_PERMITIDAS = new Set(["p", "br", "strong", "em", "ul", "ol", "li", "a"]);

/**
 * Sanitização de HTML rico para uma resposta HTTP PÚBLICA, sem autenticação
 * (issue #366) — diferente de RichTextView.tsx, que deliberadamente só
 * sanitiza no navegador (DOMPurify) porque o conteúdo lá é visto só por
 * membros logados. Aqui o HTML vai para o site institucional, consumido por
 * qualquer visitante anônimo, então não dá pra confiar cegamente no que o
 * editor gerou: uma conta comprometida ou um bug futuro no editor não pode
 * virar XSS no site público.
 *
 * Não é um sanitizador HTML genérico — não usa jsdom/isomorphic-dompurify de
 * propósito (mesma decisão de não pesar o bundle do servidor, ver
 * RichTextView.tsx) e cobre só o que o RichTextEditor (Tiptap) de fato
 * produz: remove qualquer tag fora da lista permitida (inclusive os
 * atributos dela) e, na âncora `<a>`, mantém só um `href` http(s)/mailto.
 */
export function sanitizarRichTextPublico(html: string): string {
  return html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_match, barra, tagBruta, atributos) => {
    const tag = String(tagBruta).toLowerCase();
    if (!TAGS_PERMITIDAS.has(tag)) return "";
    if (barra) return `</${tag}>`;
    if (tag !== "a") return `<${tag}>`;

    const hrefMatch = /href\s*=\s*"([^"]*)"/i.exec(String(atributos));
    const href = hrefMatch?.[1] ?? "";
    if (!/^(https?:|mailto:)/i.test(href)) return "<a>";
    const escapado = href.replace(/"/g, "&quot;");
    return `<a href="${escapado}" target="_blank" rel="noopener noreferrer">`;
  });
}
