import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// Grava uma entrada no log de auditoria (tabela append-only, ver migration
// 0013 — triggers bloqueiam UPDATE/DELETE mesmo por SQL direto). Chamado de
// dentro dos handlers de escrita que já têm a conexão e o usuarioId da
// sessão via comPapel/comSessao — não abre conexão própria.
export async function registrarAuditoria(
  conn: PoolConnection,
  usuarioId: string | null,
  acao: string,
  entidadeTipo: string,
  entidadeId: string | null,
  dadosAntes: unknown = null,
  dadosDepois: unknown = null,
): Promise<void> {
  // A loja sai de @current_loja_id, que a conexão já traz (db.ts a deriva do
  // usuário autenticado). Fica NULL só em contexto de sistema de verdade —
  // um cron sem loja —, e nunca é informada por quem chama: um parâmetro aqui
  // seria mais uma coisa para 90 chamadas diferentes errarem.
  await conn.query(
    `INSERT INTO auditoria (loja_id, usuario_id, acao, entidade_tipo, entidade_id, dados_antes, dados_depois)
     VALUES (@current_loja_id, ?, ?, ?, ?, ?, ?)`,
    [
      usuarioId,
      acao,
      entidadeTipo,
      entidadeId,
      dadosAntes === null ? null : JSON.stringify(dadosAntes),
      dadosDepois === null ? null : JSON.stringify(dadosDepois),
    ],
  );
}

/**
 * Auditoria de ação do administrador da PLATAFORMA (issue #339): cadastro,
 * edição e suspensão de lojas.
 *
 * Grava `loja_id` explicitamente como NULL, e é por isso que existe em vez
 * de reaproveitar registrarAuditoria: `auditoria.loja_id` tem DEFAULT na
 * loja seed (migração 0092, removido pela #350), então um INSERT que omite a
 * coluna carimbaria a Adonhiram numa ação que não é dela — e a auditoria da
 * Adonhiram passaria a mostrar "loja X suspensa", que não é assunto dela.
 * NULL é o valor certo: a ação aconteceu fora de qualquer loja. A loja
 * afetada fica em entidade_id, que é o que a tela da plataforma consulta.
 */
export async function registrarAuditoriaPlataforma(
  conn: PoolConnection,
  usuarioId: string,
  acao: string,
  entidadeAfetadaId: string | null,
  dadosAntes: unknown = null,
  dadosDepois: unknown = null,
  // 'usuario' foi acrescentado pela issue #361 (gestão de super_admins) —
  // mesma ideia de "ação fora de qualquer Loja", mas a entidade afetada é
  // uma conta, não uma Loja.
  entidadeTipo: "loja" | "usuario" = "loja",
): Promise<void> {
  await conn.query(
    `INSERT INTO auditoria (loja_id, usuario_id, acao, entidade_tipo, entidade_id, dados_antes, dados_depois)
     VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
    [
      usuarioId,
      acao,
      entidadeTipo,
      entidadeAfetadaId,
      dadosAntes === null ? null : JSON.stringify(dadosAntes),
      dadosDepois === null ? null : JSON.stringify(dadosDepois),
    ],
  );
}

type Json = string | number | boolean | null | Json[] | { [chave: string]: Json };

export type EntradaAuditoria = {
  id: string;
  usuario_id: string | null;
  usuario_email: string | null;
  acao: string;
  entidade_tipo: string;
  entidade_id: string | null;
  dados_antes: Json;
  dados_depois: Json;
  criado_em: string;
};

const listarSchema = z.object({
  limite: z.number().int().positive().max(500).default(200),
});

// Só admin — tela de consulta em /administracao/auditoria.
export const listarAuditoria = createServerFn({ method: "GET" })
  .validator((d: unknown) => listarSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<EntradaAuditoria[]> => {
    return comPapel(["admin"], async (conn) => {
      // Mostra a trilha DESTA Loja mais as ações de sistema (loja_id NULL,
      // vindas de crons sem loja). As ações de PLATAFORMA — cadastrar,
      // suspender e reativar Loja (issue #339) — também têm loja_id NULL, mas
      // são excluídas por entidade_tipo: a auditoria de uma Loja não é lugar
      // para "Loja X suspensa", que é assunto de outra.
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT a.id, a.usuario_id, u.email AS usuario_email, a.acao, a.entidade_tipo,
                a.entidade_id, a.dados_antes, a.dados_depois, a.criado_em
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id AND u.loja_id = @current_loja_id
         WHERE a.loja_id = @current_loja_id
            OR (a.loja_id IS NULL AND a.entidade_tipo <> 'loja')
         ORDER BY a.criado_em DESC
         LIMIT ?`,
        [data.limite],
      );
      return rows as EntradaAuditoria[];
    });
  });
