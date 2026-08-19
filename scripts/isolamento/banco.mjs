// Banco descartável da suíte de isolamento (issue #351).
//
// Roda contra um banco criado e destruído pela própria suíte — não contra o
// banco de desenvolvimento. Isso é de propósito: o resultado tem que depender
// só das migrações e do seed, nunca do estado que sobrou de outro teste.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BANCO = process.env.ISOLAMENTO_DATABASE ?? "saas_teste_isolamento";

const CLIENTE = process.env.ISOLAMENTO_MYSQL_CLIENT ?? "mariadb";
const USUARIO = process.env.ISOLAMENTO_MYSQL_USER ?? "root";
const SENHA = process.env.ISOLAMENTO_MYSQL_PASSWORD ?? "";
const HOST = process.env.ISOLAMENTO_MYSQL_HOST ?? "";

/**
 * Qual usuário MySQL a aplicação usa. Passar MYSQL_USER no ambiente do
 * processo não adianta: o carregamento do .env do projeto sobrescreve o que
 * já estava em process.env, então quem manda é o .env. Em vez de brigar com
 * isso, a suíte lê de lá e concede acesso a esse usuário no banco
 * descartável — o app continua se conectando exatamente como se conecta no
 * dia a dia, que é o comportamento que se quer testar.
 */
function usuarioDaAplicacao(raizProjeto) {
  const arquivo = path.join(raizProjeto, ".env");
  if (!fs.existsSync(arquivo)) return process.env.MYSQL_USER ?? null;
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*MYSQL_USER\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return process.env.MYSQL_USER ?? null;
}

/** Dá ao usuário da aplicação acesso ao banco descartável desta execução. */
export function concederAcessoAoApp(raizProjeto) {
  const usuario = usuarioDaAplicacao(raizProjeto);
  if (!usuario || usuario === USUARIO) return usuario;
  for (const origem of ["localhost", "%"]) {
    try {
      execFileSync(
        CLIENTE,
        [
          ...argsBase(null),
          "-e",
          `GRANT ALL PRIVILEGES ON \`${BANCO}\`.* TO '${usuario}'@'${origem}'`,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch {
      // Nem toda instalação tem as duas origens — basta uma funcionar.
    }
  }
  execFileSync(CLIENTE, [...argsBase(null), "-e", "FLUSH PRIVILEGES"]);
  return usuario;
}

function argsBase(banco) {
  const args = [`-u${USUARIO}`];
  if (SENHA) args.push(`-p${SENHA}`);
  if (HOST) args.push(`-h${HOST}`);
  if (banco) args.push(banco);
  return args;
}

/** Executa SQL e devolve a saída crua (linhas separadas por tab, sem cabeçalho). */
export function sql(consulta, banco = BANCO) {
  return execFileSync(CLIENTE, [...argsBase(banco), "-N", "-e", consulta], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** Uma única linha de valores, já quebrada por coluna. */
export function linha(consulta, banco = BANCO) {
  const saida = sql(consulta, banco);
  return saida === "" ? [] : saida.split("\n")[0].split("\t");
}

export function valor(consulta, banco = BANCO) {
  return linha(consulta, banco)[0];
}

export function recriarBanco() {
  execFileSync(CLIENTE, [
    ...argsBase(null),
    "-e",
    `DROP DATABASE IF EXISTS \`${BANCO}\`; CREATE DATABASE \`${BANCO}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  ]);
}

export function derrubarBanco() {
  execFileSync(CLIENTE, [...argsBase(null), "-e", `DROP DATABASE IF EXISTS \`${BANCO}\``]);
}

/**
 * Aplica todas as migrações em ordem numérica. Cada arquivo vai inteiro pro
 * cliente (e não statement a statement) porque as migrações usam DELIMITER
 * para as procedures — quebrar por ";" corromperia os corpos.
 */
export function aplicarMigracoes(raizProjeto) {
  const dir = path.join(raizProjeto, "mysql", "migrations");
  const arquivos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(path.join(dir, arquivo));
    try {
      execFileSync(CLIENTE, argsBase(BANCO), { input: conteudo, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      const detalhe = (err.stderr ?? Buffer.from("")).toString().trim();
      throw new Error(`Migração ${arquivo} falhou:\n${detalhe}`);
    }
  }
  return arquivos.length;
}
