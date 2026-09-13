#!/usr/bin/env node
/**
 * Verificador de migração pendente em produção (issue #503).
 *
 * Compara os arquivos de `mysql/migrations/*.sql` do repositório com uma
 * lista de nomes de arquivo que você exporta manualmente da tabela
 * `schema_migrations` (migração 0143) via phpMyAdmin — este script nunca
 * conecta em produção diretamente (decisão do usuário: nenhuma credencial
 * de produção fica acessível a partir do ambiente de desenvolvimento).
 *
 * Como usar:
 *   1. No phpMyAdmin, aba SQL, rode:
 *        SELECT nome_arquivo FROM schema_migrations ORDER BY nome_arquivo;
 *   2. Exporte o resultado (ou copie a coluna) e salve, um nome de arquivo
 *      por linha, em scripts/aplicadas-em-producao.txt (esse arquivo é
 *      local, não é versionado — ver .gitignore).
 *   3. Rode: npm run checar:migracoes-pendentes
 *
 * Sai com código 1 se houver alguma migração pendente (existe no
 * repositório, não está na lista exportada).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_MIGRACOES = path.join(RAIZ, "mysql", "migrations");
const ARQUIVO_APLICADAS = path.join(RAIZ, "scripts", "aplicadas-em-producao.txt");

function listarMigracoesDoRepositorio() {
  return fs
    .readdirSync(PASTA_MIGRACOES)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();
}

function listarMigracoesAplicadas() {
  if (!fs.existsSync(ARQUIVO_APLICADAS)) {
    console.error(
      `Não encontrei ${path.relative(RAIZ, ARQUIVO_APLICADAS)}.\n\n` +
        "Exporte a tabela schema_migrations do phpMyAdmin primeiro — ver o " +
        "comentário no topo deste script pra saber como.",
    );
    process.exitCode = 1;
    return null;
  }
  return new Set(
    fs
      .readFileSync(ARQUIVO_APLICADAS, "utf8")
      .split("\n")
      .map((linha) => linha.trim())
      .filter(Boolean)
      // tolera vir de um export CSV com aspas/vírgula ao redor do nome
      .map((linha) => linha.replace(/^["',]+|["',]+$/g, "")),
  );
}

function principal() {
  const doRepositorio = listarMigracoesDoRepositorio();
  const aplicadas = listarMigracoesAplicadas();
  if (!aplicadas) return;

  const pendentes = doRepositorio.filter((nome) => !aplicadas.has(nome));
  const soNaProducao = [...aplicadas].filter((nome) => !doRepositorio.includes(nome));

  if (pendentes.length === 0) {
    console.log(`OK: as ${doRepositorio.length} migrações do repositório já constam como aplicadas.`);
  } else {
    console.error(`\nATENÇÃO: ${pendentes.length} migração(ões) no repositório sem registro de aplicação:\n`);
    for (const nome of pendentes) console.error(`  ✗ ${nome}`);
    console.error(
      "\nAplique cada uma via phpMyAdmin (na ordem acima) antes de considerar o deploy concluído.",
    );
    process.exitCode = 1;
  }

  if (soNaProducao.length > 0) {
    console.warn(
      `\nAviso: ${soNaProducao.length} nome(s) registrado(s) em produção sem arquivo correspondente no repositório (renomeado ou removido?):`,
    );
    for (const nome of soNaProducao) console.warn(`  ? ${nome}`);
  }
}

principal();
