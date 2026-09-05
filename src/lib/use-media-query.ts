import { useEffect, useState } from "react";

// Mesmo breakpoint "lg" (1024px) já usado no resto do AppShell para
// separar sidebar fixa (desktop) de drawer mobile.
const DESKTOP_QUERY = "(min-width: 1024px)";

export function useIsDesktop(): boolean {
  // Estado inicial fixo (true), igual ao que o servidor sempre renderiza
  // (SSR não tem `window` pra saber a largura real) — o valor real só é
  // aplicado depois de montar, no effect abaixo. Calcular a largura real já
  // no useState (como era antes) faz a primeira renderização do cliente
  // divergir do HTML do servidor em telas < 1024px, e React trata isso como
  // erro de hidratação (mesma classe do erro #418 que já derrubou outra tela
  // nesta base — ver CLAUDE.md).
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
