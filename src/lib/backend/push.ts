import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { comSessao } from "./authz";

// Chave pública VAPID — não é segredo (vai pro navegador em toda inscrição
// de push, é assim que a Web Push API funciona), mas mesmo assim só vem de
// env var, nunca hardcoded: é o mesmo par de chaves que push-dispatch.ts usa
// pra assinar o envio, e as duas pontas precisam bater. Exposta via server
// function (não import.meta.env) pra poder trocar as chaves na Hostinger
// sem precisar de rebuild do frontend.
export const obterChavePushPublica = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ chave: string | null }> => {
    return comSessao(async () => ({ chave: process.env.VAPID_PUBLIC_KEY ?? null }));
  },
);

// Inscrição em notificações push (achado #647 — o backend de disparo já
// existia desde a issue #27, mas nunca houve como uma inscrição nascer:
// nenhuma tela pedia Notification.requestPermission()/PushManager.subscribe(),
// e nenhuma server function gravava em push_subscriptions. A tabela ficava
// permanentemente vazia — o cron de push-dispatch.ts nunca tinha pra quem
// mandar nada.
//
// Disponível pra qualquer papel autenticado (comSessao, não comPapel): hoje
// só admin/secretario/tesoureiro recebem algo (PAPEIS_NOTIFICACOES, em
// notificacoes.ts), mas a inscrição em si não é privilégio — é só "este
// aparelho aceita push". Um irmão comum que ativar não recebe nada agora,
// mas a infraestrutura já fica pronta pra um tipo de notificação futuro
// dirigido a ele (ex.: lembrete da própria mensalidade).
const inscricaoSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const inscreverPush = createServerFn({ method: "POST" })
  .validator((d: unknown) => inscricaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      // ON DUPLICATE KEY (endpoint é UNIQUE): o mesmo navegador/aparelho
      // pode reinscrever depois de limpar dados ou trocar de conta — sem
      // isso, a segunda tentativa esbarraria no UNIQUE com um erro cru.
      await conn.query(
        `INSERT INTO push_subscriptions (loja_id, usuario_id, endpoint, p256dh, auth)
         VALUES (@current_loja_id, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE loja_id = @current_loja_id, usuario_id = VALUES(usuario_id),
           p256dh = VALUES(p256dh), auth = VALUES(auth)`,
        [usuarioId, data.endpoint, data.p256dh, data.auth],
      );
    });
  });

const cancelarSchema = z.object({ endpoint: z.string().url() });

export const cancelarInscricaoPush = createServerFn({ method: "POST" })
  .validator((d: unknown) => cancelarSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      // usuario_id no WHERE: mesmo que alguém descubra o endpoint de outra
      // pessoa (não é segredo, mas por hábito), só cancela a própria
      // inscrição.
      await conn.query(
        "DELETE FROM push_subscriptions WHERE endpoint = ? AND usuario_id = ? AND loja_id = @current_loja_id",
        [data.endpoint, usuarioId],
      );
    });
  });
