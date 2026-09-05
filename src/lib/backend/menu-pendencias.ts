import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";

// Issue #455: contagens de pendências pra exibir como badge nos itens do
// menu lateral — "Visibility of System Status" apontado no critique
// automático (usuário só descobria que havia pendência ao entrar na tela).
// Cross-cutting de propósito (chamados + CMS), por isso não vive dentro de
// chamados.ts nem de noticias.ts/paginas-site.ts. Roda sob comSessao
// (qualquer papel) — a exibição de cada contagem é decidida no cliente
// (AppShell.tsx) conforme quem tem permissão de agir sobre aquela fila; o
// cálculo em si é uma consulta barata e não vaza nada sensível na resposta.

export type ContagensMenu = {
  // "Meus" chamados (abertos por mim) cuja última mensagem é do
  // super-admin e ainda seguem abertos/em andamento — ou seja, uma resposta
  // que eu ainda não vi. Vale pra qualquer papel, inclusive irmão comum.
  chamadosComRespostaPendente: number;
  // Notícias + páginas do site aguardando aprovação. Só relevante pra quem
  // pode agir (super_admin/aprovador_cms) — AppShell.tsx decide se mostra.
  aprovacoesPendentes: number;
};

export const obterContagensMenu = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContagensMenu> =>
    comSessao(async (conn, usuarioId) => {
      const [[chamadosRow]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n
           FROM chamados c
          WHERE c.loja_id = @current_loja_id AND c.aberto_por = ?
            AND c.status IN ('aberto', 'em_andamento')
            AND (
              SELECT m.eh_super_admin FROM chamados_mensagens m
               WHERE m.chamado_id = c.id ORDER BY m.criado_em DESC LIMIT 1
            ) = TRUE`,
        [usuarioId],
      );
      const [[aprovacoesRow]] = await conn.query<RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM noticias WHERE loja_id = @current_loja_id AND status = 'aguardando_aprovacao')
           +
           (SELECT COUNT(*) FROM paginas_site WHERE loja_id = @current_loja_id AND status = 'aguardando_aprovacao')
           AS n`,
      );
      return {
        chamadosComRespostaPendente: Number(chamadosRow.n),
        aprovacoesPendentes: Number(aprovacoesRow.n),
      };
    }),
);
