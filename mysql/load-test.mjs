// Teste de carga básico do pool de conexões MySQL, para rodar ANTES do
// corte final de produção (issue #55) — tanto contra o MariaDB local
// quanto (mais importante) contra o MySQL real da Hostinger, para validar
// que o MYSQL_CONNECTION_LIMIT escolhido aguenta a concorrência esperada
// sem estourar o limite de conexões da hospedagem compartilhada.
//
// Uso:
//   MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=... \
//   MYSQL_CONNECTION_LIMIT=5 CONCURRENCY=20 REQUESTS=200 node mysql/load-test.mjs
//
// CONCURRENCY = quantas requisições simultâneas simular (pense em "quantos
// irmãos acessando ao mesmo tempo"). REQUESTS = total de requisições a
// disparar no teste inteiro.

import mysql from "mysql2/promise";

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);
const REQUESTS = Number(process.env.REQUESTS ?? 200);
const CONNECTION_LIMIT = process.env.MYSQL_CONNECTION_LIMIT ? Number(process.env.MYSQL_CONNECTION_LIMIT) : 5;

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? "localhost",
  port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: CONNECTION_LIMIT,
  waitForConnections: true,
  queueLimit: 0,
  dateStrings: true,
});

// Consulta representativa: um SELECT com JOIN, parecido com o que qualquer
// tela de leitura do app faz — mais realista que um "SELECT 1" puro.
const QUERY = `
  SELECT pc.id, pc.codigo, pc.nome, pc.tipo
  FROM plano_contas pc
  WHERE pc.analitica = TRUE
  ORDER BY pc.codigo
  LIMIT 50
`;

async function umaRequisicao() {
  const inicio = performance.now();
  const conn = await pool.getConnection();
  try {
    await conn.query("SET @current_usuario_id = NULL");
    await conn.query(QUERY);
    return { ok: true, ms: performance.now() - inicio };
  } catch (e) {
    return { ok: false, ms: performance.now() - inicio, erro: e instanceof Error ? e.message : String(e) };
  } finally {
    conn.release();
  }
}

async function worker(fila) {
  const resultados = [];
  while (fila.restantes > 0) {
    fila.restantes -= 1;
    resultados.push(await umaRequisicao());
  }
  return resultados;
}

async function main() {
  console.log(`Teste de carga: ${REQUESTS} requisições, concorrência ${CONCURRENCY}, pool connectionLimit=${CONNECTION_LIMIT}`);
  console.log(`Alvo: ${process.env.MYSQL_HOST ?? "localhost"}:${process.env.MYSQL_PORT ?? 3306}/${process.env.MYSQL_DATABASE ?? "(não definido)"}`);

  const fila = { restantes: REQUESTS };
  const inicioTotal = performance.now();
  const workers = Array.from({ length: CONCURRENCY }, () => worker(fila));
  const resultadosPorWorker = await Promise.all(workers);
  const totalMs = performance.now() - inicioTotal;

  const todos = resultadosPorWorker.flat();
  const sucesso = todos.filter((r) => r.ok);
  const falha = todos.filter((r) => !r.ok);
  const latencias = sucesso.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = latencias[Math.floor(latencias.length * 0.5)] ?? 0;
  const p95 = latencias[Math.floor(latencias.length * 0.95)] ?? 0;
  const max = latencias[latencias.length - 1] ?? 0;

  console.log("\n=== Resultado ===");
  console.log(`Total: ${todos.length} | Sucesso: ${sucesso.length} | Falha: ${falha.length}`);
  console.log(`Tempo total da corrida: ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`Latência por requisição — p50: ${p50.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms | máx: ${max.toFixed(1)}ms`);
  if (falha.length > 0) {
    const porErro = new Map();
    for (const f of falha) porErro.set(f.erro, (porErro.get(f.erro) ?? 0) + 1);
    console.log("\nErros encontrados:");
    for (const [erro, qtd] of porErro) console.log(`  (${qtd}x) ${erro}`);
    console.log(
      "\nSe o erro for de limite de conexões (ex.: 'Too many connections' ou timeout esperando conexão livre),\n" +
        "reduza CONCURRENCY na aplicação real ou peça um limite maior de conexões à Hostinger — não aumente\n" +
        "MYSQL_CONNECTION_LIMIT além do que o plano de hospedagem realmente permite.",
    );
  }

  await pool.end();
  process.exit(falha.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro fatal no teste de carga:", e);
  process.exit(1);
});
