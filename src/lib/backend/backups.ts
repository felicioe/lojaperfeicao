import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { executarBackupDaLoja } from "../backup-dispatch";

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
      // Sem `conteudo` (LONGTEXT) aqui de propósito: a listagem só precisa
      // dos metadados, e trazer o dump inteiro de cada um dos últimos 7
      // backups a cada carga da tela seria desperdício de banda sem motivo.
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, nome_arquivo, tamanho_bytes, total_tabelas, total_linhas, origem, criado_em
           FROM backups_gerados WHERE loja_id = @current_loja_id ORDER BY criado_em DESC`,
      );
      return rows as BackupGerado[];
    });
  },
);

export const gerarBackupAgora = createServerFn({ method: "POST" }).handler(async () => {
  return comPapel(PAPEIS, async (conn, usuarioIdAtual, lojaId) => {
    // Backup DESTA Loja: a loja vem da sessão, nunca do request.
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
        "SELECT nome_arquivo, conteudo FROM backups_gerados WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (!registro) throw new Error("Backup não encontrado nesta Loja.");
      // conteudo NULL = backup gerado antes da migração 0112 (arquivo ficava
      // em disco, e não sobreviveu ao deploy seguinte) — não tem mais como
      // recuperar; a mensagem diz isso em vez de um erro técnico de arquivo
      // não encontrado.
      if (!registro.conteudo) {
        throw new Error(
          "Este backup foi gerado antes de uma correção de armazenamento e não está mais disponível para download. Gere um novo backup.",
        );
      }
      await registrarAuditoria(conn, usuarioIdAtual, "baixar", "backup", data.id, null, {
        nome_arquivo: registro.nome_arquivo,
      });
      return { nomeArquivo: registro.nome_arquivo, conteudo: registro.conteudo };
    });
  });
