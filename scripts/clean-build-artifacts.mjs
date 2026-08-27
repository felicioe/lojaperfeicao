import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const artefatos = [
  ".output",
  ".tanstack",
  "node_modules/.vite",
  "node_modules/.vite-temp",
  "node_modules/.nitro",
];

for (const artefato of artefatos) {
  await rm(resolve(process.cwd(), artefato), { recursive: true, force: true });
}

console.log("Artefatos de build limpos.");
