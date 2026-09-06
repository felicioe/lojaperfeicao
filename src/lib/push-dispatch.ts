import webpush from "web-push";
import type { RowDataPacket } from "mysql2";
import { listarLojasAtivas, withLojaConnection } from "./backend/db";
import { gerarNotificacoes, PAPEIS_NOTIFICACOES } from "./backend/notificacoes";
import { contarEnviosHoje, LIMITE_DIARIO_PUSH_POR_LOJA } from "./rate-limit";
import { enviarEmailIntersticioCompleto } from "./email-dispatch";

// Disparo real de Web Push (issue #27) — chamado pelo endpoint HTTP em
// src/server.ts, que um cron job da Hostinger aciona periodicamente (ver
// mysql/README.md e instruções de deploy).
export type ResultadoDisparoLoja = {
  lojaId: string;
  lojaSlug: string;
  avaliadas: number;
  enviadas: number;
  falhas: number;
  limitado: boolean;
};
export type ResultadoDisparo = {
  avaliadas: number;
  enviadas: number;
  falhas: number;
  porLoja: ResultadoDisparoLoja[];
};

// Num SaaS o cron não tem uma sessão pra restringir a busca a uma só Loja:
// itera todas as Lojas ativas, cada uma com sua própria conexão escopada
// (withLojaConnection), e um erro de UMA Loja (ex.: uma query que falha por
// dado inconsistente) não pode derrubar o disparo das outras — daí o
// try/catch por Loja em vez de deixar a exceção subir do laço inteiro.
// Antes desta correção a função usava withUserConnection(null, ...), que
// deixa @current_loja_id NULL — e como gerarNotificacoes() filtra tudo por
// `loja_id = @current_loja_id`, o cron rodava sem erro nenhum mas nunca
// gerava uma notificação sequer, para Loja nenhuma.
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

  const lojas = await listarLojasAtivas();
  const porLoja: ResultadoDisparoLoja[] = [];

  for (const loja of lojas) {
    let resultado: ResultadoDisparoLoja;
    try {
      resultado = await withLojaConnection(loja.id, async (conn) => {
        const jaEnviadasHoje = await contarEnviosHoje(
          conn,
          "notificacoes_enviadas",
          "enviado_em",
          loja.id,
        );
        if (jaEnviadasHoje >= LIMITE_DIARIO_PUSH_POR_LOJA) {
          console.warn(
            `[cron:notificacoes] loja ${loja.slug}: limite diário de ${LIMITE_DIARIO_PUSH_POR_LOJA} notificações atingido, pulando.`,
          );
          return {
            lojaId: loja.id,
            lojaSlug: loja.slug,
            avaliadas: 0,
            enviadas: 0,
            falhas: 0,
            limitado: true,
          };
        }

        const itens = await gerarNotificacoes(conn);
        let enviadas = 0;
        let falhas = 0;

        for (const item of itens) {
          const [insercao] = await conn.query<import("mysql2").ResultSetHeader>(
            "INSERT IGNORE INTO notificacoes_enviadas (chave, loja_id) VALUES (?, @current_loja_id)",
            [item.chave],
          );
          if (insercao.affectedRows === 0) continue; // já disparada antes — dedup

          // Interstício completo (issue #106): além do push pra
          // admin/secretaria abaixo, avisa o próprio irmão por e-mail — ele
          // não tem papel elegível pra inscrição de push. Um erro aqui (SMTP
          // fora do ar, por exemplo) não pode derrubar o push desta Loja nem
          // das próximas no laço de fora.
          if (item.tipo === "interstico_completo" && item.irmaoId) {
            try {
              await enviarEmailIntersticioCompleto(item.irmaoId, loja.id);
            } catch (err) {
              console.error(
                `[cron:notificacoes] loja ${loja.slug}: falha ao enviar e-mail de interstício pro irmão ${item.irmaoId}:`,
                err,
              );
            }
          }

          const papeisAlvo = item.papeis ?? PAPEIS_NOTIFICACOES;
          const condicoes = papeisAlvo.map(() => "up.papel = ?").join(" OR ");
          const [inscricoes] = await conn.query<RowDataPacket[]>(
            `SELECT DISTINCT ps.id, ps.endpoint, ps.p256dh, ps.auth
             FROM push_subscriptions ps
             JOIN usuarios_papeis up ON up.usuario_id = ps.usuario_id AND up.loja_id = ps.loja_id
             WHERE ps.loja_id = @current_loja_id AND (${condicoes})`,
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
                await conn.query(
                  "DELETE FROM push_subscriptions WHERE id = ? AND loja_id = @current_loja_id",
                  [inscricao.id],
                );
              }
            }
          }
        }

        return {
          lojaId: loja.id,
          lojaSlug: loja.slug,
          avaliadas: itens.length,
          enviadas,
          falhas,
          limitado: false,
        };
      });
    } catch (err) {
      console.error(`[cron:notificacoes] falha ao processar loja ${loja.slug}:`, err);
      resultado = {
        lojaId: loja.id,
        lojaSlug: loja.slug,
        avaliadas: 0,
        enviadas: 0,
        falhas: 1,
        limitado: false,
      };
    }
    console.log(
      `[cron:notificacoes] loja ${loja.slug}: ${resultado.avaliadas} avaliada(s), ${resultado.enviadas} enviada(s), ${resultado.falhas} falha(s)${resultado.limitado ? " (limite diário atingido)" : ""}.`,
    );
    porLoja.push(resultado);
  }

  return {
    avaliadas: porLoja.reduce((soma, r) => soma + r.avaliadas, 0),
    enviadas: porLoja.reduce((soma, r) => soma + r.enviadas, 0),
    falhas: porLoja.reduce((soma, r) => soma + r.falhas, 0),
    porLoja,
  };
}
