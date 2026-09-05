import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { carregarUsuarioComPapeis, type UsuarioSessao } from "./usuario-sessao";
import { registrarAuditoria } from "./auditoria";
import { filtrarRotasValidas } from "../menu-catalogo";

// Preferências pessoais de menu — cada usuário pode ocultar itens que não
// usa (issue #457) e fixar até MAX_FAVORITOS como favoritos, exibidos em
// destaque no topo da sidebar (issue #453). Roda sob comSessao (qualquer
// papel autenticado), nunca afeta outro usuário da mesma loja. O oculto
// aqui fica por baixo do que o super-admin já ocultou pra loja inteira
// (issue #456): esconder um item que a loja já tirou é inofensivo (o item
// já não aparece de qualquer forma) — AppShell.tsx só une os conjuntos.

const MAX_FAVORITOS = 8;

const salvarSchema = z.object({
  ocultos: z.array(z.string()),
  favoritos: z
    .array(z.string())
    .max(MAX_FAVORITOS, `Escolha no máximo ${MAX_FAVORITOS} favoritos.`),
});

export const salvarMinhasPreferenciasMenu = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ data }): Promise<UsuarioSessao> =>
    comSessao(async (conn, usuarioId) => {
      const ocultos = filtrarRotasValidas(data.ocultos);
      const favoritos = filtrarRotasValidas(data.favoritos);
      await conn.query(
        `INSERT INTO preferencias_menu_usuario (usuario_id, ocultos_json, favoritos_json)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE ocultos_json = VALUES(ocultos_json), favoritos_json = VALUES(favoritos_json)`,
        [usuarioId, JSON.stringify(ocultos), JSON.stringify(favoritos)],
      );
      await registrarAuditoria(
        conn,
        usuarioId,
        "editar_preferencias_menu",
        "usuario",
        usuarioId,
        null,
        { ocultos, favoritos },
      );
      const sessao = await carregarUsuarioComPapeis(usuarioId);
      if (!sessao) throw new Error("Não foi possível atualizar as preferências.");
      return sessao;
    }),
  );

// Devolve o que já está salvo (pessoal: ocultos + favoritos) e o que a loja
// já esconde pra todo mundo — a tela de preferências usa `daLoja` pra não
// deixar marcar/desmarcar algo que a plataforma já decidiu (issue #456).
export const obterMinhasPreferenciasMenu = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ocultos: string[]; favoritos: string[]; daLoja: string[] }> =>
    comSessao(async (conn, usuarioId, lojaId) => {
      const [[pessoalRow]] = await conn.query<RowDataPacket[]>(
        "SELECT ocultos_json, favoritos_json FROM preferencias_menu_usuario WHERE usuario_id = ?",
        [usuarioId],
      );
      const [[lojaRow]] = await conn.query<RowDataPacket[]>(
        "SELECT menu_itens_ocultos_json FROM lojas WHERE id = ?",
        [lojaId],
      );
      const parseJson = (v: unknown): string[] =>
        Array.isArray(v) ? (v as string[]) : JSON.parse((v as string | null) ?? "[]");
      return {
        ocultos: parseJson(pessoalRow?.ocultos_json),
        favoritos: parseJson(pessoalRow?.favoritos_json),
        daLoja: parseJson(lojaRow?.menu_itens_ocultos_json),
      };
    }),
);
