import { useMemo, useState } from "react";

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

  const alternar = (col: string) => {
    if (coluna === col) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setColuna(col);
      setDirecao("asc");
    }
  };

  const itensOrdenados = useMemo(() => {
    const extrator = coluna ? extratores[coluna] : null;
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
  }, [itens, coluna, direcao, extratores]);

  return { itensOrdenados, coluna, direcao, alternar };
}
