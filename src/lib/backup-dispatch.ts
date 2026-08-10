import { mkdir, writeFile, unlink, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./backend/db";

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

export async function executarBackupAgendado(origem: "cron" | "manual"): Promise<ResultadoBackup> {
  return withUserConnection(null, async (conn) => {
    const [tabelas] = await conn.query<RowDataPacket[]>("SHOW TABLES");
    const nomeColuna = Object.keys(tabelas[0] ?? {})[0];
    const nomesTabelas = tabelas.map((t) => t[nomeColuna] as string);

    const dump: Record<string, RowDataPacket[]> = {};
    let totalLinhas = 0;
    for (const tabela of nomesTabelas) {
      // Nomes de tabela vêm de SHOW TABLES (não de entrada do cliente),
      // então interpolar aqui é seguro — mysql2 não parametriza identificadores.
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT * FROM \`${tabela}\``);
      dump[tabela] = redigirLinhas(tabela, rows);
      totalLinhas += rows.length;
    }

    await mkdir(BACKUPS_DIR, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const nomeArquivo = `backup-${carimbo}.json`;
    const conteudo = JSON.stringify(dump, null, 2);
    await writeFile(join(BACKUPS_DIR, nomeArquivo), conteudo, "utf-8");
    const { size } = await stat(join(BACKUPS_DIR, nomeArquivo));

    await conn.query(
      `INSERT INTO backups_gerados (nome_arquivo, tamanho_bytes, total_tabelas, total_linhas, origem)
       VALUES (?, ?, ?, ?, ?)`,
      [nomeArquivo, size, nomesTabelas.length, totalLinhas, origem],
    );

    await aplicarRetencao(conn);

    return {
      nomeArquivo,
      tamanhoBytes: size,
      totalTabelas: nomesTabelas.length,
      totalLinhas,
    };
  });
}

// Mantém só os últimos RETENCAO_MAXIMA backups — disco de hospedagem
// compartilhada é limitado (decisão confirmada na issue #85).
async function aplicarRetencao(conn: import("mysql2/promise").PoolConnection): Promise<void> {
  const [antigos] = await conn.query<RowDataPacket[]>(
    `SELECT id, nome_arquivo FROM backups_gerados
     ORDER BY criado_em DESC
     LIMIT 1000 OFFSET ?`,
    [RETENCAO_MAXIMA],
  );
  for (const antigo of antigos) {
    await unlink(join(BACKUPS_DIR, antigo.nome_arquivo)).catch(() => {
      // arquivo já não existe em disco — ainda assim remove o registro.
    });
    await conn.query("DELETE FROM backups_gerados WHERE id = ?", [antigo.id]);
  }
}

export async function lerConteudoBackup(nomeArquivo: string): Promise<string> {
  return readFile(join(BACKUPS_DIR, nomeArquivo), "utf-8");
}
