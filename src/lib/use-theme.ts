import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

function lerPreferencia() {
  return typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "dark";
}

// Aplica a classe .dark (já totalmente definida em styles.css) conforme a
// preferência salva. Cada componente que chama este hook mantém seu próprio
// estado, mas todos leem/escrevem a mesma chave no localStorage e a mesma
// classe no <html>, então ficam consistentes entre si.
export function useTheme() {
  const [dark, setDark] = useState(lerPreferencia);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((v) => !v) };
}
