const TAGS_PERMITIDAS = new Set(["p", "br", "strong", "em", "ul", "ol", "li", "a"]);

// Só reconhece uma tag ÚNICA, bem formada, sem nenhum outro '<' ou '>' no
// meio dos atributos — ver o comentário longo abaixo sobre por que isso é
// obrigatório e não só um detalhe de regex.
const TAG_UNICA = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)>$/;

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
 *
 * O regex externo (`/<[^>]*>/g`) é DELIBERADAMENTE guloso até o PRÓXIMO '>',
 * mesmo quando o conteúdo capturado não parece uma tag válida — isso é o
 * que torna a sanitização segura, não um detalhe cosmético. Uma primeira
 * versão desta função usava um regex que já exigia um nome de tag válido
 * logo após o '<', e por isso um `<` "solto" (ex.: `<<x>script>...`) nunca
 * virava parte de nenhum match: ele sobrava como texto literal ao lado de
 * um '>' igualmente solto de OUTRO match removido, e a concatenação dos
 * pedaços que sobravam formava uma tag nova que nunca existiu no HTML
 * original (`<<x>script>alert(1)<</x>/script>` virava
 * `<script>alert(1)</script>` de verdade — achado do review automático da
 * PR #369, confirmado como XSS armazenado explorável).
 *
 * Capturando cada bloco "<...>" por inteiro — válido ou não — como uma
 * unidade atômica a ser mantida ou descartada de uma vez, nenhum '<' pode
 * sobrar sem seu '>' correspondente (ou vice-versa) fora de uma tag que nós
 * mesmos emitimos como string literal logo abaixo. Só DEPOIS de capturado
 * o bloco inteiro é que TAG_UNICA decide se ele é uma tag reconhecida de
 * verdade (sem nenhum '<'/'>' extra nos atributos) — se não for, o bloco
 * inteiro vira "", nunca sobrando fragmento nenhum pra se recombinar.
 */
export function sanitizarRichTextPublico(html: string): string {
  return html.replace(/<[^>]*>/g, (match) => {
    const tagMatch = TAG_UNICA.exec(match);
    if (!tagMatch) return "";
    const [, barra, tagBruta, atributos] = tagMatch;
    const tag = tagBruta.toLowerCase();
    if (!TAGS_PERMITIDAS.has(tag)) return "";
    if (barra) return `</${tag}>`;
    if (tag !== "a") return `<${tag}>`;

    const hrefMatch = /href\s*=\s*"([^"]*)"/i.exec(atributos);
    const href = hrefMatch?.[1] ?? "";
    if (!/^(https?:|mailto:)/i.test(href)) return "<a>";
    const escapado = href.replace(/"/g, "&quot;");
    return `<a href="${escapado}" target="_blank" rel="noopener noreferrer">`;
  });
}
