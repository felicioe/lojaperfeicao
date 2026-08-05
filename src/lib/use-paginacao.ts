import { useEffect, useMemo, useState } from "react";

// Paginação client-side: a lista completa (já filtrada/buscada pela
// própria tela, se houver busca) entra aqui e só a fatia da página atual
// sai. Volume de dados de uma loja não justifica paginação no backend, e
// isso evitaria quebrar a busca client-side que várias telas já têm
// (que precisa rodar sobre a lista inteira, não só a página visível).
export function usePaginacao<T>(itens: T[], tamanhoPagina = 15) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanhoPagina));

  // Volta pra página 1 quando o tamanho da lista muda (nova busca/filtro,
  // item excluído etc.) — evita ficar numa página que não existe mais.
  useEffect(() => {
    setPagina(1);
  }, [itens.length]);

  const paginaAtual = Math.min(pagina, totalPaginas);

  const itensPagina = useMemo(() => {
    const inicio = (paginaAtual - 1) * tamanhoPagina;
    return itens.slice(inicio, inicio + tamanhoPagina);
  }, [itens, paginaAtual, tamanhoPagina]);

  return {
    itensPagina,
    pagina: paginaAtual,
    totalPaginas,
    totalItens: itens.length,
    tamanhoPagina,
    setPagina,
  };
}
