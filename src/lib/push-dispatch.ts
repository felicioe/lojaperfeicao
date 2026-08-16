import webpush from "web-push";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./backend/db";
import { gerarNotificacoes, PAPEIS_NOTIFICACOES } from "./backend/notificacoes";

// Disparo real de Web Push (issue #27) — chamado pelo endpoint HTTP em
// src/server.ts, que um cron job da Hostinger aciona periodicamente (ver
// mysql/README.md e instruções de deploy). Roda fora do contexto de sessão
// HTTP normal (por isso usa withUserConnection(null, ...), contexto de
// sistema, igual aos outros jobs de fundo do projeto).
export type ResultadoDisparo = { avaliadas: number; enviadas: number; falhas: number };

export async function executarDisparoNotificacoes(): Promise<ResultadoDisparo> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas.");
  }
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT_EMAIL ?? "mailto:admin@example.com",
    publicKey,
    privateKey,
  );

  return withUserConnection(null, async (conn) => {
    const itens = await gerarNotificacoes(conn);
    let enviadas = 0;
    let falhas = 0;

    for (const item of itens) {
      const [resultado] = await conn.query<import("mysql2").ResultSetHeader>(
        "INSERT IGNORE INTO notificacoes_enviadas (chave) VALUES (?)",
        [item.chave],
      );
      if (resultado.affectedRows === 0) continue; // já disparada antes — dedup

      const papeisAlvo = item.papeis ?? PAPEIS_NOTIFICACOES;
      const condicoes = papeisAlvo.map(() => "up.papel = ?").join(" OR ");
      const [inscricoes] = await conn.query<RowDataPacket[]>(
        `SELECT DISTINCT ps.id, ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps
         JOIN usuarios_papeis up ON up.usuario_id = ps.usuario_id
         WHERE ${condicoes}`,
        papeisAlvo,
      );

      for (const inscricao of inscricoes) {
        try {
          await webpush.sendNotification(
            {
              endpoint: inscricao.endpoint,
              keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
            },
            JSON.stringify({ title: item.titulo, body: item.mensagem }),
          );
          enviadas++;
        } catch (err) {
          falhas++;
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await conn.query("DELETE FROM push_subscriptions WHERE id = ?", [inscricao.id]);
          }
        }
      }
    }

    return { avaliadas: itens.length, enviadas, falhas };
  });
}
