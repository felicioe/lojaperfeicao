import { useMemo, useRef, useState } from "react";

export type DirecaoOrdenacao = "asc" | "desc";

type ValorOrdenavel = string | number | boolean | null | undefined;
type Extrator<T> = (item: T) => ValorOrdenavel;

// Reutilizar o colator evita reconstruir as regras de comparação do pt-BR
// para cada par de itens durante a ordenação.
const colatorPtBr = new Intl.Collator("pt-BR", { sensitivity: "base" });

// Ordenação client-side reutilizável por qualquer tabela: guarda qual
// coluna está ativa e a direção, e devolve a lista já ordenada. Roda
// antes da paginação (usePaginacao) e depois de qualquer filtro/busca
// que a própria tela já aplique — mesmo espírito do usePaginacao.
export function useOrdenacao<T>(itens: T[], extratores: Record<string, Extrator<T>>) {
  const [coluna, setColuna] = useState<string | null>(null);
  const [direcao, setDirecao] = useState<DirecaoOrdenacao>("asc");

  // A maioria das telas chama useOrdenacao(itens, { data: (i) => ..., ... })
  // com o objeto de extratores inline — recriado a cada render. Depender
  // dele no useMemo abaixo invalidaria a memoização toda vez que qualquer
  // outro state do componente mudasse (digitar num filtro, marcar um
  // checkbox), reordenando a lista inteira à toa (achado #545 da auditoria
  // de performance). Guardar na ref em vez de como dependência resolve isso
  // pra todo chamador de uma vez, sem exigir que cada tela extraia o objeto
  // pra uma constante de módulo.
  const extratoresRef = useRef(extratores);
  extratoresRef.current = extratores;

  const alternar = (col: string) => {
    if (coluna === col) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setColuna(col);
      setDirecao("asc");
    }
  };

  const itensOrdenados = useMemo(() => {
    const extrator = coluna ? extratoresRef.current[coluna] : null;
    if (!extrator) return itens;
    const copia = [...itens];
    copia.sort((a, b) => {
      const va = extrator(a);
      const vb = extrator(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return colatorPtBr.compare(va, vb);
      }
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
    if (direcao === "desc") copia.reverse();
    return copia;
  }, [itens, coluna, direcao]);

  return { itensOrdenados, coluna, direcao, alternar };
}
