import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

// Limite diário por Loja pros crons de disparo em massa (issue #341) — não
// é sobre abuso de um usuário mal-intencionado (esses já são barrados por
// comPapel/autenticação), é sobre um bug de dados numa Loja (ex.: um laço
// que gera notificação duplicada, ou uma importação que criou milhares de
// faturas vencidas de uma vez) não conseguir monopolizar o SMTP/push
// compartilhado da plataforma e atrasar todas as outras Lojas.
export const LIMITE_DIARIO_PUSH_POR_LOJA = 500;
export const LIMITE_DIARIO_EMAIL_POR_LOJA = 500;

/** Quantas linhas `tabela` já tem hoje para esta Loja, pela coluna de data informada. */
export async function contarEnviosHoje(
  conn: PoolConnection,
  tabela: "notificacoes_enviadas" | "filas_email",
  colunaData: "enviado_em",
  lojaId: string,
): Promise<number> {
  const [[linha]] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ${tabela} WHERE loja_id = ? AND ${colunaData} >= CURDATE()`,
    [lojaId],
  );
  return Number(linha.total);
}
