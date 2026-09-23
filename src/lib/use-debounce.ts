import { useEffect, useState } from "react";

/** Devolve `valor`, mas só depois de `atrasoMs` sem mudar — usado pela busca
 * ampla de conteúdo (issue #710) pra não disparar uma consulta ao banco a
 * cada tecla digitada (~300ms de debounce, conforme a issue). */
export function useDebounce<T>(valor: T, atrasoMs: number): T {
  const [debounced, setDebounced] = useState(valor);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(valor), atrasoMs);
    return () => clearTimeout(timer);
  }, [valor, atrasoMs]);

  return debounced;
}
