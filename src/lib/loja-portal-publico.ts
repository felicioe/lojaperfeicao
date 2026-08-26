// Portal institucional público é hoje um site só, hardcoded (ver o CORS fixo
// em src/server.ts para os endpoints /api/publico/*) — não há ainda um
// mecanismo de escolher a Loja a partir da requisição pública (issue #341).
// Compartilhado entre os loaders públicos (agenda-publica.ts,
// noticias-publica.ts) e os backends de escrita que alimentam essas telas
// (noticias.ts, agenda-publica-admin.ts), para que ambos os lados apontem
// sempre para a mesma Loja.
export const LOJA_PORTAL_PUBLICO = "00000000-0000-4000-8000-000000000001";
