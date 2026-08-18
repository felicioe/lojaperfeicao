#!/usr/bin/env node
/**
 * Verificador de escopo de loja (multi-tenant) — issue #337.
 *
 * Num SaaS, esquecer um `AND loja_id = @current_loja_id` numa única query é
 * vazamento de dados entre lojas. São ~620 statements SQL no backend: revisar
 * "no olho" não é garantia de nada, e nem protege contra a próxima query que
 * alguém escrever daqui a seis meses.
 *
 * Este script lê a lista de tabelas multi-tenant direto da migração 0092
 * (fonte única — se uma tabela nova ganhar loja_id, o verificador aprende
 * sozinho), extrai todo SQL do backend e reprova qualquer statement que toque
 * uma tabela multi-tenant sem se referir a loja_id.
 *
 * Uso:  node scripts/checar-escopo-loja.mjs [--verboso]
 * Sai com código 1 se houver pendência — serve como gate de CI.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MIGRACAO = join(RAIZ, "mysql/migrations/0092_saas_lojas_multi_tenant.sql");
const DIRS = ["src/lib/backend", "src/lib"];

// ---------------------------------------------------------------------------
// Exceções conscientes: statements que NÃO devem ser escopados por loja, com
// o motivo. Toda entrada aqui é uma decisão de segurança e precisa ser
// revisada na PR — a chave é `arquivo::trecho-do-sql`.
// ---------------------------------------------------------------------------
const EXCECOES = [
  {
    arquivo: "src/lib/backend/auth.ts",
    contem: "SELECT id, senha_hash, ativo FROM usuarios WHERE email",
    motivo:
      "Login: ainda não há loja no contexto (é justamente o que se vai descobrir). " +
      "A ambiguidade entre lojas é tratada por usuarioUnicoParaLogin (login-loja.ts).",
  },
  {
    arquivo: "src/lib/backend/passkeys.ts",
    contem: "SELECT id FROM usuarios WHERE email = ? AND ativo = TRUE",
    motivo: "Login por passkey, pré-autenticação — mesmo caso do login por senha.",
  },
  {
    arquivo: "src/lib/google-oauth-callback.ts",
    contem: "SELECT id FROM usuarios WHERE google_id",
    motivo: "Login por Google, pré-autenticação — mesmo caso do login por senha.",
  },
  // ---- Autenticação por passkey e 2FA: tudo abaixo roda ANTES da sessão
  // existir, com @current_usuario_id e @current_loja_id ainda NULL. Escopar
  // por loja aqui não é "mais seguro": é quebrar o login, porque a condição
  // nunca casaria. O que protege estas consultas é outra coisa — o
  // usuario_id vem do desafio WebAuthn/do ticket de 2FA guardado no cookie
  // assinado do servidor, nunca do corpo da requisição.
  {
    arquivo: "src/lib/backend/passkeys.ts",
    contem: "SELECT credential_id, transportes FROM usuario_passkeys WHERE usuario_id = ?",
    motivo:
      "iniciarLoginPasskey: monta a lista de credenciais permitidas antes do login. " +
      "O usuário já foi resolvido por usuarioUnicoParaLogin, que é quem trata a ambiguidade entre lojas.",
  },
  {
    arquivo: "src/lib/backend/passkeys.ts",
    contem: "FROM usuario_passkeys WHERE credential_id = ? AND usuario_id = ?",
    motivo:
      "confirmarLoginPasskey: busca a credencial para verificar a assinatura. " +
      "O usuario_id vem do desafio guardado no cookie assinado, não do request.",
  },
  {
    arquivo: "src/lib/backend/passkeys.ts",
    contem: "UPDATE usuario_passkeys SET contador = ?, usado_em = NOW() WHERE id = ?",
    motivo:
      "Atualiza o contador anti-replay logo após a verificação, ainda sem sessão. " +
      "O id é o da linha que acabou de ser verificada.",
  },
  {
    arquivo: "src/lib/backend/totp.ts",
    contem: "SELECT email FROM usuarios WHERE id = ?",
    motivo:
      "validarCodigoTotpOuBackup precisa do e-mail para reconstruir o TOTP, e roda também " +
      "no login (sem loja no contexto). Escopar aqui derrubaria o segundo fator na entrada.",
  },
  {
    arquivo: "src/lib/backend/totp.ts",
    contem: "SELECT secret FROM usuario_totp WHERE usuario_id = ? AND ativado_em IS NOT NULL",
    motivo:
      "validarCodigoTotpOuBackup é compartilhado entre o login (sem sessão) e as telas " +
      "autenticadas. Escopar quebraria o segundo fator no login.",
  },
  {
    arquivo: "src/lib/backend/totp.ts",
    contem:
      "SELECT id, codigo_hash FROM usuario_totp_codigos_backup WHERE usuario_id = ? AND usado_em IS NULL",
    motivo: "Mesmo helper compartilhado: códigos de backup conferidos durante o login.",
  },
  {
    arquivo: "src/lib/backend/totp.ts",
    contem: "UPDATE usuario_totp_codigos_backup SET usado_em = NOW() WHERE id = ?",
    motivo:
      "Queima o código de backup recém-conferido, ainda no login. O id é o da linha conferida.",
  },
  {
    arquivo: "src/lib/backend/totp.ts",
    contem: "SELECT 1 FROM usuario_totp WHERE usuario_id = ? AND ativado_em IS NOT NULL",
    motivo:
      "usuarioTemTotpAtivo: decide se o login pede segundo fator — roda entre a senha e a sessão.",
  },
  {
    arquivo: "src/lib/facebook-oauth-callback.ts",
    contem: "SELECT id FROM usuarios WHERE facebook_id",
    motivo: "Login por Facebook, pré-autenticação — mesmo caso do login por senha.",
  },
];

// Uma exceção que deixou de casar (a query foi reescrita, o arquivo sumiu)
// é pior que inútil: fica na lista dando falsa sensação de cobertura
// revisada. O verificador rastreia o uso e reprova as que ficaram órfãs.
const excecoesUsadas = new Set();

function ehExcecao(arquivo, sql) {
  const normalizado = sql.replace(/\s+/g, " ");
  const achada = EXCECOES.find(
    (e) => arquivo === e.arquivo && normalizado.includes(e.contem.replace(/\s+/g, " ")),
  );
  if (achada) excecoesUsadas.add(achada);
  return !!achada;
}

// ---------------------------------------------------------------------------
// 1. Tabelas multi-tenant, lidas da migração 0092
// ---------------------------------------------------------------------------
function tabelasMultiTenant() {
  const sql = readFileSync(MIGRACAO, "utf8");
  const tabelas = new Set();
  for (const m of sql.matchAll(/^ALTER TABLE (\w+)/gm)) tabelas.add(m[1]);
  return tabelas;
}

// ---------------------------------------------------------------------------
// 2. Extração de SQL dos fontes TypeScript
// ---------------------------------------------------------------------------
function arquivosTs(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) continue; // backend é plano; não descer em rotas
    if (nome.endsWith(".ts")) saida.push(caminho);
  }
  return saida;
}

const INICIO_SQL = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CALL)\b/i;

/** Literais de string (aspas simples/duplas/crase) que contenham SQL. */
function extrairSql(fonte) {
  const achados = [];
  const re = /(`(?:[^`\\]|\\.)*`)|('(?:[^'\\\n]|\\.)*')|("(?:[^"\\\n]|\\.)*")/g;
  let m;
  while ((m = re.exec(fonte)) !== null) {
    const bruto = m[0];
    const conteudo = bruto.slice(1, -1);
    if (!INICIO_SQL.test(conteudo)) continue;
    const linha = fonte.slice(0, m.index).split("\n").length;
    achados.push({ sql: conteudo, linha });
  }
  return achados;
}

/** Tabelas referenciadas depois de FROM / JOIN / INTO / UPDATE / DELETE FROM. */
function tabelasDoSql(sql, multiTenant) {
  const encontradas = new Set();
  const re = /\b(?:FROM|JOIN|INTO|UPDATE)\s+`?(\w+)`?/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const t = m[1].toLowerCase();
    if (multiTenant.has(t)) encontradas.add(t);
  }
  return encontradas;
}

// ---------------------------------------------------------------------------
// 3. Verificação
// ---------------------------------------------------------------------------
const verboso = process.argv.includes("--verboso");
const multiTenant = tabelasMultiTenant();

let totalSql = 0;
let totalEscopados = 0;
let totalExcecoes = 0;
const pendencias = [];

for (const dir of DIRS) {
  for (const caminho of arquivosTs(join(RAIZ, dir))) {
    const rel = relative(RAIZ, caminho);
    const fonte = readFileSync(caminho, "utf8");
    for (const { sql, linha } of extrairSql(fonte)) {
      const tabelas = tabelasDoSql(sql, multiTenant);
      if (tabelas.size === 0) continue; // não toca tabela multi-tenant
      totalSql++;

      if (/loja_id/i.test(sql)) {
        totalEscopados++;
        continue;
      }
      if (ehExcecao(rel, sql)) {
        totalExcecoes++;
        continue;
      }
      pendencias.push({
        arquivo: rel,
        linha,
        tabelas: [...tabelas].join(", "),
        sql: sql.replace(/\s+/g, " ").trim().slice(0, 110),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Relatório
// ---------------------------------------------------------------------------
const porArquivo = new Map();
for (const p of pendencias) {
  porArquivo.set(p.arquivo, (porArquivo.get(p.arquivo) ?? 0) + 1);
}

console.log(`Tabelas multi-tenant conhecidas: ${multiTenant.size}`);
console.log(
  `SQL que toca tabela multi-tenant: ${totalSql}  ` +
    `(escopados: ${totalEscopados} · exceções: ${totalExcecoes} · pendentes: ${pendencias.length})`,
);

const orfas = EXCECOES.filter((e) => !excecoesUsadas.has(e));
if (orfas.length > 0) {
  console.log("\nExceções órfãs (não casam mais com nenhuma query — remova ou corrija):");
  for (const o of orfas) console.log(`  ${o.arquivo}: ${o.contem}`);
}

if (pendencias.length > 0) {
  console.log("\nPendências por arquivo:");
  for (const [arq, n] of [...porArquivo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${arq}`);
  }
  if (verboso) {
    console.log("\nDetalhe:");
    for (const p of pendencias) {
      console.log(`\n  ${p.arquivo}:${p.linha}  [${p.tabelas}]`);
      console.log(`    ${p.sql}`);
    }
  } else {
    console.log("\n(use --verboso para ver cada statement)");
  }
  process.exit(1);
}

if (orfas.length > 0) process.exit(1);
console.log("\nOK: todo SQL que toca tabela multi-tenant está escopado por loja.");
