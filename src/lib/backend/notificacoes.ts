import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

// Sino de notificações in-app (issue #27) — equivalente ao `gerarNotificacoes()`
// do legado: calculado em tempo real a cada abertura do sino, sem tabela de
// notificações persistida. A mesma função é reaproveitada pelo disparo de
// push via cron (src/lib/push-dispatch.ts), que roda fora do contexto de
// sessão HTTP — por isso ela recebe a conexão já aberta em vez de usar
// comPapel/comSessao diretamente.
export const PAPEIS_NOTIFICACOES = ["admin", "secretario", "tesoureiro"];

export type NotificacaoItem = {
  tipo: "aniversario" | "fatura_vencida" | "recorrente_pendente";
  chave: string;
  titulo: string;
  mensagem: string;
};

export async function gerarNotificacoes(conn: PoolConnection): Promise<NotificacaoItem[]> {
  const itens: NotificacaoItem[] = [];

  const [aniversariantes] = await conn.query<RowDataPacket[]>(
    `SELECT id, nome_civil FROM irmaos
     WHERE data_nascimento IS NOT NULL
       AND MONTH(data_nascimento) = MONTH(CURRENT_DATE)
       AND DAY(data_nascimento) = DAY(CURRENT_DATE)`,
  );
  for (const irmao of aniversariantes) {
    itens.push({
      tipo: "aniversario",
      chave: `aniversario:${irmao.id}:${new Date().toISOString().slice(0, 10)}`,
      titulo: "Aniversário hoje",
      mensagem: `${irmao.nome_civil} faz aniversário hoje.`,
    });
  }

  const [faturasVencidas] = await conn.query<RowDataPacket[]>(
    `SELECT l.id, l.valor, l.data_vencimento, i.nome_civil
     FROM lancamentos l JOIN irmaos i ON i.id = l.irmao_id
     WHERE l.tipo = 'entrada' AND l.is_mensalidade = TRUE AND l.pago = FALSE
       AND l.data_vencimento < CURRENT_DATE`,
  );
  for (const fatura of faturasVencidas) {
    itens.push({
      tipo: "fatura_vencida",
      chave: `fatura_vencida:${fatura.id}`,
      titulo: "Mensalidade vencida",
      mensagem: `${fatura.nome_civil} — vencida em ${fatura.data_vencimento}.`,
    });
  }

  const [recorrentesPendentes] = await conn.query<RowDataPacket[]>(
    `SELECT dr.id, dr.descricao
     FROM despesas_recorrentes dr
     WHERE dr.ativo = TRUE
       AND dr.data_inicio <= CURRENT_DATE
       AND (dr.data_fim IS NULL OR dr.data_fim >= CURRENT_DATE)
       AND DAYOFMONTH(CURRENT_DATE) >= dr.dia_vencimento
       AND NOT EXISTS (
         SELECT 1 FROM lancamentos l
         WHERE l.recorrente_id = dr.id AND l.competencia_mes = mes_competencia(CURRENT_DATE)
       )`,
  );
  for (const rec of recorrentesPendentes) {
    itens.push({
      tipo: "recorrente_pendente",
      chave: `recorrente_pendente:${rec.id}:${new Date().toISOString().slice(0, 7)}`,
      titulo: "Despesa recorrente pendente",
      mensagem: `${rec.descricao} — ainda não efetivada este mês.`,
    });
  }

  return itens;
}

export const listarNotificacoes = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificacaoItem[]> => {
    return comPapel(PAPEIS_NOTIFICACOES, async (conn) => gerarNotificacoes(conn));
  },
);

export const obterChavePublicaVapid = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    return comSessao(async () => process.env.VAPID_PUBLIC_KEY ?? null);
  },
);

const inscricaoSchema = z.object({
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const salvarInscricaoPush = createServerFn({ method: "POST" })
  .validator((d: unknown) => inscricaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_NOTIFICACOES, async (conn, usuarioIdAtual) => {
      await conn.query(
        `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
        [usuarioIdAtual, data.endpoint, data.p256dh, data.auth],
      );
    });
  });

export const removerInscricaoPush = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ endpoint: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn) => {
      await conn.query("DELETE FROM push_subscriptions WHERE endpoint = ?", [data.endpoint]);
    });
  });
