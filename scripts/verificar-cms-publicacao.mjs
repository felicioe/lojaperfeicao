import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const raiz = process.cwd();

const arquivosObrigatorios = [
  "src/routes/_authenticated/noticias-site/index.tsx",
  "src/routes/_authenticated/paginas-site/index.tsx",
  "src/routes/_authenticated/menu-site/index.tsx",
  "src/lib/backend/noticias.ts",
  "src/lib/backend/paginas-site.ts",
  "src/lib/backend/menu-site.ts",
  "src/lib/noticias-publica.ts",
  "src/lib/paginas-site-publica.ts",
  "src/lib/menu-site-publica.ts",
  "mysql/migrations/0113_noticias_site.sql",
  "mysql/migrations/0114_agenda_publica_edicao.sql",
  "mysql/migrations/0119_paginas_site.sql",
  "mysql/migrations/0120_menu_site.sql",
];

async function existe(relativo) {
  try {
    await access(path.join(raiz, relativo));
    return true;
  } catch {
    return false;
  }
}

async function validarArquivos() {
  const faltando = [];
  for (const arquivo of arquivosObrigatorios) {
    if (!(await existe(arquivo))) faltando.push(arquivo);
  }
  return faltando;
}

async function validarRouteTree() {
  const arquivo = path.join(raiz, "src/routeTree.gen.ts");
  const conteudo = await readFile(arquivo, "utf8");
  const rotas = ["/noticias-site/", "/paginas-site/", "/menu-site/"];
  return rotas.filter((rota) => !conteudo.includes(rota));
}

async function validarServerEntrypoints() {
  const arquivo = path.join(raiz, "src/server.ts");
  const conteudo = await readFile(arquivo, "utf8");
  const endpoints = [
    "/api/publico/agenda",
    "/api/publico/noticias",
    "/api/publico/paginas",
    "/api/publico/menu",
    "/api/health",
  ];
  return endpoints.filter((endpoint) => !conteudo.includes(endpoint));
}

async function main() {
  const faltando = await validarArquivos();
  const rotasAusentes = await validarRouteTree();
  const endpointsAusentes = await validarServerEntrypoints();

  if (faltando.length || rotasAusentes.length || endpointsAusentes.length) {
    console.error("Falha na verificação de prontidão do CMS.");
    if (faltando.length) {
      console.error("\nArquivos obrigatórios ausentes:");
      for (const item of faltando) console.error(`- ${item}`);
    }
    if (rotasAusentes.length) {
      console.error("\nRotas CMS ausentes em src/routeTree.gen.ts:");
      for (const item of rotasAusentes) console.error(`- ${item}`);
    }
    if (endpointsAusentes.length) {
      console.error("\nEndpoints públicos/saúde ausentes em src/server.ts:");
      for (const item of endpointsAusentes) console.error(`- ${item}`);
    }
    process.exit(1);
  }

  console.log("CMS pronto para publicação:");
  console.log("- rotas administrativas localizadas");
  console.log("- loaders públicos localizados");
  console.log("- migrações do CMS localizadas");
  console.log("- endpoints públicos e healthcheck localizados");
}

await main();
