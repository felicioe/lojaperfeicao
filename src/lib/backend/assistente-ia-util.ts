// Funções compartilhadas entre os assistentes de IA (Legislação #648,
// Biblioteca de Peças #657) — pré-filtro por termos, sem embeddings/busca
// vetorial, barato e sem IA, pra escolher os candidatos mais prováveis
// antes de gastar qualquer processamento (extração de PDF, chamada ao
// modelo).
export function normalizarTexto(texto: string): string {
  return texto.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function pontuarRelevancia(pergunta: string, texto: string): number {
  const termos = normalizarTexto(pergunta)
    .split(/\W+/)
    .filter((termo) => termo.length > 2);
  const textoNormalizado = normalizarTexto(texto);
  return termos.reduce((soma, termo) => soma + (textoNormalizado.includes(termo) ? 1 : 0), 0);
}
