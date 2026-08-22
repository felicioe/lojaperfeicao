#!/usr/bin/env node
/**
 * Verificador do fim da transição multi-tenant (issue #350).
 *
 * A migração 0092 deu a toda coluna `loja_id` um DEFAULT transitório: um
 * INSERT que esquecesse a loja não falhava, gravava calado na Loja semente.
 * A 0097 removeu esses DEFAULT depois que #337/#349 escoparam todo o
 * caminho de escrita — a partir dela, esquecer a loja vira erro na hora do
 * INSERT, que é o comportamento que se quer.
 *
 * Este script prova isso contra um banco reconstruído do zero (mesmo
 * padrão do testar-isolamento.mjs): aplica todas as migrações em ordem e
 * confere, via information_schema, que nenhuma coluna `loja_id` de tabela
 * multi-tenant ainda tem DEFAULT. `auditoria.loja_id` é a única aceita como
 * NULLable (ações de super-admin, issue #339) — isso não muda aqui: o que
 * se verifica é a ausência de DEFAULT, não a nulidade da coluna.
 *
 * Uso:  node scripts/checar-defaults-loja-id.mjs
 * Sai com código 1 se alguma coluna loja_id ainda tiver DEFAULT.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as banco from "./isolamento/banco.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANCO_ANTERIOR = banco.BANCO;
process.env.ISOLAMENTO_DATABASE = "saas_teste_defaults_loja_id";

async function principal() {
  console.log("Recriando banco descartável…");
  banco.recriarBanco();
  try {
    const total = banco.aplicarMigracoes(RAIZ);
    console.log(`${total} migrações aplicadas.`);

    // Uma coluna loja_id NULLable sem DEFAULT explícito (caso de
    // auditoria.loja_id, de propósito — issue #339) aparece no
    // information_schema com COLUMN_DEFAULT igual à STRING 'NULL', não ao
    // valor SQL NULL: é o "não tem default" de uma coluna que aceita NULL,
    // bem diferente do DEFAULT '<uuid da loja semente>' transitório que esta
    // verificação existe pra provar que sumiu. Só esse valor entra na lista
    // de exceções — qualquer outra coisa não-NULL ainda é o DEFAULT antigo.
    const saida = banco.sql(
      `SELECT TABLE_NAME, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'loja_id'
          AND COLUMN_DEFAULT IS NOT NULL AND COLUMN_DEFAULT <> 'NULL'
        ORDER BY TABLE_NAME`,
    );
    const comDefault = saida ? saida.split("\n").filter(Boolean) : [];

    const [[totalColunas]] = [
      banco
        .sql(
          `SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'loja_id'`,
        )
        .split("\n"),
    ];

    if (comDefault.length > 0) {
      console.error(`\nFALHOU: ${comDefault.length} coluna(s) loja_id ainda com DEFAULT:\n`);
      for (const linha of comDefault) {
        const [tabela, valorPadrao] = linha.split("\t");
        console.error(`  ✗ ${tabela}.loja_id  DEFAULT ${valorPadrao}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `OK: nenhuma das ${totalColunas} colunas loja_id tem DEFAULT — a transição da 0092 terminou.`,
    );
  } finally {
    banco.derrubarBanco();
    if (BANCO_ANTERIOR) process.env.ISOLAMENTO_DATABASE = BANCO_ANTERIOR;
  }
}

principal().catch((err) => {
  console.error("\nA verificação não pôde ser executada:", err.message ?? err);
  process.exitCode = 1;
});
