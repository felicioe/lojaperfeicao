import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

const PAPEIS = ["admin"];

export type BackupGerado = {
  id: string;
  nome_arquivo: string;
  tamanho_bytes: number;
  total_tabelas: number;
  total_linhas: number;
  origem: "cron" | "manual";
  criado_em: string;
};

export const listarBackupsGerados = createServerFn({ method: "GET" }).handler(
  async (): Promise<BackupGerado[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM backups_gerados WHERE loja_id = @current_loja_id ORDER BY criado_em DESC",
      );
      return rows as BackupGerado[];
    });
  },
);

export const gerarBackupAgora = createServerFn({ method: "POST" }).handler(async () => {
  return comPapel(PAPEIS, async (conn, usuarioIdAtual, lojaId) => {
    // Backup DESTA Loja: a loja vem da sessão, nunca do request.
    const { executarBackupDaLoja } = await import("../backup-dispatch");
    const resultado = await executarBackupDaLoja("manual", lojaId);
    await registrarAuditoria(conn, usuarioIdAtual, "gerar", "backup", null, null, resultado);
    return resultado;
  });
});

const baixarSchema = z.object({ id: z.string().uuid() });

export const baixarBackup = createServerFn({ method: "POST" })
  .validator((d: unknown) => baixarSchema.parse(d))
  .handler(async ({ data }): Promise<{ nomeArquivo: string; conteudo: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      const [[registro]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_arquivo FROM backups_gerados WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (!registro) throw new Error("Backup não encontrado nesta Loja.");
      // nome_arquivo só é lido do banco (nunca do client) — sem risco de
      // path traversal apontando pra fora de BACKUPS_DIR.
      const { lerConteudoBackup } = await import("../backup-dispatch");
      const conteudo = await lerConteudoBackup(registro.nome_arquivo);
      await registrarAuditoria(conn, usuarioIdAtual, "baixar", "backup", data.id, null, {
        nome_arquivo: registro.nome_arquivo,
      });
      return { nomeArquivo: registro.nome_arquivo, conteudo };
    });
  });
