import { mkdir, writeFile, unlink, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { listarLojasAtivas, withUserConnection } from "./backend/db";

// Backup agendado (issue #85) — igual em espírito ao push-dispatch.ts:
// chamado pelo endpoint HTTP em src/server.ts, que um cron job da
// Hostinger aciona periodicamente, fora do contexto de sessão HTTP normal.
// Deliberadamente NÃO fica em src/lib/backend/backups.ts (que é
// diretamente importado pela rota /administracao/backups): manter a lógica
// pesada aqui garante que ela nunca é candidata a vazar pro bundle do
// cliente, mesmo que backups.ts volte a exportar algo por engano no
// futuro — mesma lição aprendida com o bug de bundle do passkey.
//
// Os arquivos ficam em BACKUPS_DIR, fora de public/ — nunca podem ser
// servidos estaticamente. Download só via rota autenticada admin-only
// (backups.ts).
//
// Campos sensíveis (issue de segurança, revisão pós-#87): senha_hash e o
// secret de TOTP nunca são gravados nem em disco nem no download — numa
// restauração de desastre, cada usuário redefine senha e 2FA do zero,
// decisão explícita do cliente (mais simples e mais seguro do que manter
// esses campos vivos em qualquer backup). usuario_passkeys NÃO entra
// nessa lista: por desenho do WebAuthn, o servidor só guarda a CHAVE
// PÚBLICA da passkey — não há segredo nenhum ali para redigir.
const BACKUPS_DIR = join(process.cwd(), "backups");
const RETENCAO_MAXIMA = 7;
const CAMPOS_SENSIVEIS: Record<string, string[]> = {
  usuarios: ["senha_hash"],
  usuario_totp: ["secret"],
  usuario_totp_codigos_backup: ["codigo_hash"],
};

function redigirLinhas(tabela: string, linhas: RowDataPacket[]): RowDataPacket[] {
  const campos = CAMPOS_SENSIVEIS[tabela];
  if (!campos) return linhas;
  return linhas.map((linha) => {
    const copia = { ...linha } as RowDataPacket;
    for (const campo of campos) delete copia[campo];
    return copia;
  });
}

export type ResultadoBackup = {
  nomeArquivo: string;
  tamanhoBytes: number;
  totalTabelas: number;
  totalLinhas: number;
};

/**
 * Tabelas que o backup de uma Loja NÃO deve conter, mesmo tendo dado (issue
 * #348). São infraestrutura global, compartilhada entre todas as Lojas — a
 * 0092 deliberadamente não deu `loja_id` a nenhuma delas:
 *
 * - tentativas_login guarda e-mail e IP de tentativas de TODAS as Lojas (o
 *   rate limit é pré-login, quando ainda não se sabe a loja);
 * - o cache de CNPJ é resposta de API pública, sem dono;
 * - o estado de OAuth expira em minutos e não é dado de negócio.
 *
 * Incluí-las num arquivo entregue ao admin de uma Loja seria vazar dado das
 * outras — exatamente o que este backup passou a evitar.
 */
const TABELAS_GLOBAIS_FORA_DO_BACKUP = new Set([
  "tentativas_login",
  "cnpj_consultas_cache",
  "cnpj_rate_limit",
  "google_oauth_state",
  "facebook_oauth_state",
  "google_login_tickets",
  "facebook_login_tickets",
]);

/**
 * Backup de UMA Loja.
 *
 * Antes isto fazia `SELECT * FROM <tabela>` em todas as tabelas do banco e
 * entregava o arquivo ao admin que clicou — ou seja, o admin de qualquer Loja
 * baixava o banco inteiro, com os dados pessoais de todas as outras. Escopar
 * só a listagem de `backups_gerados` esconderia isso em vez de resolver:
 * o arquivo continuaria contendo tudo.
 *
 * Agora cada tabela multi-tenant é filtrada por `loja_id`, `lojas` traz só a
 * linha da Loja, e as tabelas de infraestrutura global ficam de fora. A lista
 * de quem é multi-tenant sai do próprio schema (quem tem coluna `loja_id`),
 * não de uma lista fixa que envelheceria à primeira tabela nova.
 *
 * Agendar um backup por Loja no cron continua sendo a issue #341; aqui o
 * disparo do cron simplesmente percorre as Lojas ativas.
 */
export async function executarBackupDaLoja(
  origem: "cron" | "manual",
  lojaId: string,
): Promise<ResultadoBackup> {
  return withUserConnection(null, async (conn) => {
    const [tabelas] = await conn.query<RowDataPacket[]>("SHOW TABLES");
    const nomeColuna = Object.keys(tabelas[0] ?? {})[0];
    const nomesTabelas = tabelas.map((t) => t[nomeColuna] as string);

    const [comLoja] = await conn.query<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'loja_id'`,
    );
    const multiTenant = new Set(comLoja.map((r) => String(r.TABLE_NAME)));

    const dump: Record<string, RowDataPacket[]> = {};
    let totalLinhas = 0;
    let totalTabelas = 0;
    for (const tabela of nomesTabelas) {
      if (TABELAS_GLOBAIS_FORA_DO_BACKUP.has(tabela)) continue;
      // Nomes de tabela vêm de SHOW TABLES (não de entrada do cliente),
      // então interpolar aqui é seguro — mysql2 não parametriza identificadores.
      // O valor da loja continua indo por parâmetro.
      const [rows] = multiTenant.has(tabela)
        ? await conn.query<RowDataPacket[]>(`SELECT * FROM \`${tabela}\` WHERE loja_id = ?`, [
            lojaId,
          ])
        : tabela === "lojas"
          ? await conn.query<RowDataPacket[]>("SELECT * FROM lojas WHERE id = ?", [lojaId])
          : // Sobra o que não tem loja_id nem é infra global: tabelas de
            // catálogo sem dono (ex.: as criadas depois da 0092 sem escopo).
            // Vão inteiras, e é por isso que a #350 — que remove os DEFAULTs
            // e obriga toda tabela nova a declarar a loja — importa aqui.
            await conn.query<RowDataPacket[]>(`SELECT * FROM \`${tabela}\``);
      dump[tabela] = redigirLinhas(tabela, rows);
      totalLinhas += rows.length;
      totalTabelas++;
    }

    await mkdir(BACKUPS_DIR, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    // A loja entra no nome do arquivo: com mais de uma Loja, uma pasta com
    // "backup-<data>.json" repetido não diz de quem é cada arquivo.
    const nomeArquivo = `backup-${lojaId}-${carimbo}.json`;
    const conteudo = JSON.stringify(dump, null, 2);
    await writeFile(join(BACKUPS_DIR, nomeArquivo), conteudo, "utf-8");
    const { size } = await stat(join(BACKUPS_DIR, nomeArquivo));

    await conn.query(
      `INSERT INTO backups_gerados (loja_id, nome_arquivo, tamanho_bytes, total_tabelas, total_linhas, origem)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [lojaId, nomeArquivo, size, totalTabelas, totalLinhas, origem],
    );

    await aplicarRetencao(conn, lojaId);

    return { nomeArquivo, tamanhoBytes: size, totalTabelas, totalLinhas };
  });
}

/** Disparo do cron: um backup por Loja ativa. */
export async function executarBackupAgendado(
  origem: "cron" | "manual" = "cron",
): Promise<ResultadoBackup[]> {
  const lojas = await listarLojasAtivas();
  const resultados: ResultadoBackup[] = [];
  for (const loja of lojas) {
    resultados.push(await executarBackupDaLoja(origem, loja.id));
  }
  return resultados;
}

// Mantém só os últimos RETENCAO_MAXIMA backups DA LOJA — disco de hospedagem
// compartilhada é limitado (decisão confirmada na issue #85). A retenção é por
// Loja porque global significaria que, com N Lojas, cada uma guardaria
// 7/N backups — e a Loja que gerasse um manual apagaria o da outra.
async function aplicarRetencao(
  conn: import("mysql2/promise").PoolConnection,
  lojaId: string,
): Promise<void> {
  const [antigos] = await conn.query<RowDataPacket[]>(
    `SELECT id, nome_arquivo FROM backups_gerados
      WHERE loja_id = ?
      ORDER BY criado_em DESC
      LIMIT 1000 OFFSET ?`,
    [lojaId, RETENCAO_MAXIMA],
  );
  for (const antigo of antigos) {
    await unlink(join(BACKUPS_DIR, antigo.nome_arquivo)).catch(() => {
      // arquivo já não existe em disco — ainda assim remove o registro.
    });
    await conn.query("DELETE FROM backups_gerados WHERE id = ? AND loja_id = ?", [
      antigo.id,
      lojaId,
    ]);
  }
}

export async function lerConteudoBackup(nomeArquivo: string): Promise<string> {
  return readFile(join(BACKUPS_DIR, nomeArquivo), "utf-8");
}
