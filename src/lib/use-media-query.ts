import { useEffect, useState } from "react";

// Mesmo breakpoint "lg" (1024px) já usado no resto do AppShell para
// separar sidebar fixa (desktop) de drawer mobile.
const DESKTOP_QUERY = "(min-width: 1024px)";

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_QUERY).matches : true,
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
