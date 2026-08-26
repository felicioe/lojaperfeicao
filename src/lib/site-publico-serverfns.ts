import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { carregarAgendaPublica } from "./agenda-publica";
import { carregarNoticiasPublicas, carregarNoticiaPublicaPorId } from "./noticias-publica";
import { carregarMenuPublico } from "./menu-site-publica";
import { listarPaginasPublicas, carregarPaginaPublicaPorSlug } from "./paginas-site-publica";

// Wrappers createServerFn em torno dos loaders públicos (agenda-publica.ts,
// noticias-publica.ts, menu-site-publica.ts, paginas-site-publica.ts) — as
// rotas públicas embutidas no app (issue #382: /, /agenda, /noticias,
// /paginas/:slug) precisam chamá-los tanto durante o SSR quanto na
// navegação client-side, e createServerFn é o único jeito, neste projeto,
// de fazer isso sem vazar código server-only (mysql2 etc.) pro bundle do
// cliente — mesmo motivo por trás de cada outro createServerFn do backend.

export const obterAgendaPublicaFn = createServerFn({ method: "GET" }).handler(() =>
  carregarAgendaPublica(),
);

export const obterNoticiasPublicasFn = createServerFn({ method: "GET" }).handler(() =>
  carregarNoticiasPublicas(),
);

export const obterNoticiaPublicaPorIdFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(({ data }) => carregarNoticiaPublicaPorId(data.id));

export const obterMenuPublicoFn = createServerFn({ method: "GET" }).handler(() =>
  carregarMenuPublico(),
);

export const obterPaginasPublicasFn = createServerFn({ method: "GET" }).handler(() =>
  listarPaginasPublicas(),
);

export const obterPaginaPublicaPorSlugFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(({ data }) => carregarPaginaPublicaPorSlug(data.slug));
