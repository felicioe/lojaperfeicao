// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
// - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
// nitro (build-only), VITE_* env injection, @ path alias, React/TanStack dedupe, error logger
// plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    ssr: {
      // Nitro 3 beta corrupts this package's generated CommonJS helper when
      // bundling the production SSR service. Keep the dependency external.
      external: ["@floating-ui/react-dom"],
    },
  },
  // O deploy é feito pelo Hostinger puxando do GitHub e rodando o build ele
  // mesmo (fora do sandbox do Lovable), num Node normal — não Cloudflare
  // Workers. Sem isso, o preset padrão do Nitro ("cloudflare-module") gera um
  // build para runtime edge, que não tem filesystem gravável nem socket TCP
  // cru — quebraria o backend MySQL (mysql2 usa TCP direto) e o upload de
  // fotos (node:fs/promises). Ver mysql/README.md, seção 13.
  nitro: {
    preset: "node-server",
    minify: false,
  },
});
