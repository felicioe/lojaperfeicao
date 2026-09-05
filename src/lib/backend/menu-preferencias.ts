import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { carregarUsuarioComPapeis, type UsuarioSessao } from "./usuario-sessao";
import { registrarAuditoria } from "./auditoria";
import { filtrarRotasValidas } from "../menu-catalogo";

// Issue #457: preferência pessoal de menu — cada usuário oculta, só pra si,
// itens que não usa. Roda sob comSessao (qualquer papel autenticado), nunca
// afeta outro usuário da mesma loja. Fica por baixo do que o super-admin já
// ocultou pra loja inteira (issue #456): esconder aqui um item que a loja já
// tirou é inofensivo (o item já não aparece de qualquer forma), então não há
// necessidade de checar sobreposição — AppShell.tsx simplesmente une os dois
// conjuntos de rotas ocultas.

const salvarSchema = z.object({ itens: z.array(z.string()) });

export const salvarMeuMenuOculto = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ data }): Promise<UsuarioSessao> =>
    comSessao(async (conn, usuarioId) => {
      const itens = filtrarRotasValidas(data.itens);
      await conn.query(
        `INSERT INTO usuario_menu_ocultos (usuario_id, itens_json)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE itens_json = VALUES(itens_json)`,
        [usuarioId, JSON.stringify(itens)],
      );
      await registrarAuditoria(
        conn,
        usuarioId,
        "editar_menu_oculto_pessoal",
        "usuario",
        usuarioId,
        null,
        {
          itens,
        },
      );
      const sessao = await carregarUsuarioComPapeis(usuarioId);
      if (!sessao) throw new Error("Não foi possível atualizar a preferência.");
      return sessao;
    }),
  );

// Devolve o que já está oculto (pessoal e pela loja) — a tela de
// preferências usa `daLoja` pra não deixar marcar/desmarcar algo que a
// plataforma já decidiu pra todo mundo (issue #456).
export const obterMeuMenuOculto = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ pessoal: string[]; daLoja: string[] }> =>
    comSessao(async (conn, usuarioId, lojaId) => {
      const [[pessoalRow]] = await conn.query<RowDataPacket[]>(
        "SELECT itens_json FROM usuario_menu_ocultos WHERE usuario_id = ?",
        [usuarioId],
      );
      const [[lojaRow]] = await conn.query<RowDataPacket[]>(
        "SELECT menu_itens_ocultos_json FROM lojas WHERE id = ?",
        [lojaId],
      );
      const parseJson = (v: unknown): string[] =>
        Array.isArray(v) ? (v as string[]) : JSON.parse((v as string | null) ?? "[]");
      return {
        pessoal: parseJson(pessoalRow?.itens_json),
        daLoja: parseJson(lojaRow?.menu_itens_ocultos_json),
      };
    }),
);
