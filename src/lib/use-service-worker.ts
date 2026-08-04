import { useEffect } from "react";

// Registro do service worker (issue #27) — client-only, roda uma vez no
// carregamento do app inteiro (chamado em RootComponent).
export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Falha ao registrar service worker:", err);
    });
  }, []);
}
