// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
// - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
// nitro (build-only), VITE_* env injection, @ path alias, React/TanStack dedupe, error logger
// plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const floatingUiReactDomEsm = fileURLToPath(
  new URL("./node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs", import.meta.url),
);
const nodeProcessShim = fileURLToPath(
  new URL("./src/lib/backend/process-shim.cjs", import.meta.url),
);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      // Force the ESM distribution. The UMD/CommonJS variant is corrupted by
      // the current Nitro/Vite production SSR bundling path on Hostinger.
      alias: {
        "@floating-ui/react-dom": floatingUiReactDomEsm,
        // O sandbox Node da Hostinger lança `open EEXIST` ao materializar a
        // fachada ESM do builtin `process` (ela tenta sincronizar stdin).
        // mysql2 usa `require("process")`; apontá-lo para o process global
        // evita essa fachada sem alterar nenhuma API consumida pelo driver.
        process: nodeProcessShim,
      },
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
    // `minify` não está no tipo exposto por LovableViteTanstackOptions (a
    // interface só cobre preset/output/cloudflare de propósito), mas é
    // repassado como está para o nitro() real — cast só para calar o tsc.
    minify: false,
  } as import("@lovable.dev/vite-tanstack-config").LovableViteTanstackOptions["nitro"],
});
