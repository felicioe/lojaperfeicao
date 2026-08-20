#!/usr/bin/env node
/**
 * Suíte de isolamento entre lojas — issue #351.
 *
 * `npm run checar:escopo-loja` prova que nenhuma consulta ESQUECEU de citar
 * loja_id. Não prova que o filtro está certo: um JOIN escopado na tabela
 * errada passa no verificador e vaza assim mesmo. Esta suíte é a outra
 * metade — duas lojas de verdade, dados idênticos entre elas, e a pergunta
 * feita do jeito que um invasor faria: chamando as funções do servidor com
 * o id da loja vizinha.
 *
 * Roda em banco descartável, criado e destruído aqui. Não toca no banco de
 * desenvolvimento nem depende do estado dele.
 *
 *   npm run testar:isolamento
 *   npm run testar:isolamento -- --manter    (não derruba o banco no fim)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as banco from "./isolamento/banco.mjs";
import * as seed from "./isolamento/seed.mjs";
import * as app from "./isolamento/app.mjs";
import { rodarProvas } from "./isolamento/provas.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANTER = process.argv.includes("--manter");
const LOG_APP = path.join(RAIZ, "isolamento-app.log");

/**
 * Todo id que pertence a outra loja. É contra esta lista que cada resposta é
 * conferida — assim a falha diz exatamente qual registro vazou, em vez de só
 * "deu diferente". Só entram tabelas cujo `id` é UUID: um id inteiro ("1")
 * casaria como substring em qualquer JSON e daria alarme falso.
 */
function idsDeFora(lojaId) {
  const tabelas = banco
    .sql(
      `SELECT t.TABLE_NAME
         FROM information_schema.TABLES t
         JOIN information_schema.COLUMNS ci
           ON ci.TABLE_SCHEMA = t.TABLE_SCHEMA AND ci.TABLE_NAME = t.TABLE_NAME
          AND ci.COLUMN_NAME = 'id' AND ci.CHARACTER_MAXIMUM_LENGTH = 36
         JOIN information_schema.COLUMNS cl
           ON cl.TABLE_SCHEMA = t.TABLE_SCHEMA AND cl.TABLE_NAME = t.TABLE_NAME
          AND cl.COLUMN_NAME = 'loja_id'
        WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY t.TABLE_NAME`,
    )
    .split("\n")
    .filter(Boolean);

  const uniao = tabelas
    .map((t) => `SELECT id FROM \`${t}\` WHERE loja_id <> '${lojaId}'`)
    .join(" UNION ");
  const ids = banco.sql(`${uniao} UNION SELECT id FROM lojas WHERE id <> '${lojaId}'`);
  return ids.split("\n").filter((i) => i.length === 36);
}

function imprimirRelatorio(resultados) {
  const grupos = [...new Set(resultados.map((r) => r.grupo))];
  const rotulos = {
    leitura: "1. Leituras — nenhuma resposta traz registro de outra loja",
    agregado: "2. Agregados — os números são só da loja de quem está logado",
    exportacao: "3. Exportação e backup — só dado da própria loja",
    idor: "4. IDOR — chamar com id da outra loja não devolve o registro",
    controle: "4b. Controle positivo — com o id da própria loja, responde normalmente",
    escrita: "5. Escrita cruzada — não altera dado da outra loja",
    login: "6. Login — sessão e resolução de conta por loja",
  };
  for (const grupo of grupos) {
    const doGrupo = resultados.filter((r) => r.grupo === grupo);
    const falhas = doGrupo.filter((r) => !r.ok);
    console.log(`\n${rotulos[grupo] ?? grupo}`);
    console.log(`   ${doGrupo.length - falhas.length}/${doGrupo.length} passaram`);
    for (const f of falhas) console.log(`   ✗ ${f.nome}: ${f.detalhe}`);
  }
}

async function principal() {
  let processoApp = null;
  const t0 = Date.now();
  try {
    process.stdout.write("Recriando banco descartável… ");
    banco.recriarBanco();
    const migracoes = banco.aplicarMigracoes(RAIZ);
    console.log(`${migracoes} migrações aplicadas.`);

    process.stdout.write("Semeando duas lojas com dados idênticos… ");
    seed.semear();
    const [lojaA, lojaB] = seed.LOJAS;
    console.log(`${lojaA.nome} e ${lojaB.nome} prontas.`);

    const usuarioApp = banco.concederAcessoAoApp(RAIZ);
    process.stdout.write(
      `Subindo o app em ${app.BASE}${usuarioApp ? ` (usuário ${usuarioApp})` : ""}… `,
    );
    processoApp = await app.subirApp(banco.BANCO, LOG_APP);
    console.log("no ar.");

    const forasteiros = idsDeFora(lojaA.id);
    console.log(
      `Rastreando ${forasteiros.length} ids que NÃO podem aparecer para a ${lojaA.nome}.`,
    );

    const resultados = await rodarProvas({
      base: app.BASE,
      lojaA,
      lojaB,
      senha: seed.SENHA,
      sql: (q) => banco.valor(q),
      idsDeFora: forasteiros,
      emailCompartilhado: seed.EMAIL_COMPARTILHADO,
    });

    imprimirRelatorio(resultados);

    const falhas = resultados.filter((r) => !r.ok);
    const segundos = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `\n${resultados.length - falhas.length}/${resultados.length} provas passaram em ${segundos}s.`,
    );
    if (falhas.length) {
      console.log("\nISOLAMENTO FALHOU — não implante enquanto houver falha acima.");
      process.exitCode = 1;
    } else {
      console.log("Isolamento íntegro.");
    }
  } finally {
    app.derrubarApp(processoApp);
    if (MANTER) {
      console.log(`\nBanco ${banco.BANCO} mantido para inspeção (--manter).`);
    } else {
      banco.derrubarBanco();
    }
  }
}

principal().catch((err) => {
  console.error(`\nA suíte não pôde ser executada: ${err.message}`);
  process.exit(1);
});
