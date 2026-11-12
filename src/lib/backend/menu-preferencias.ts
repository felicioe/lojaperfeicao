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

// Estrela de favorito direto no item do menu (issue #782). A tela
// /conta/menu continua sendo o lugar de ocultar itens, mas marcar um
// favorito ali exigia sair da tela em que se estava trabalhando — que é
// justamente a fadiga que o favorito deveria resolver.
//
// Server fn própria (em vez de reenviar ocultos + favoritos inteiros pelo
// salvarMinhasPreferenciasMenu) por dois motivos: o clique precisa ser
// otimista e rápido, e mandar o array de ocultos inteiro a cada estrela
// criaria a chance de uma tela desatualizada sobrescrever o oculto de
// outra. Aqui só a lista de favoritos é lida e reescrita, dentro de uma
// única transação, então dois cliques seguidos não se perdem.
const alternarFavoritoSchema = z.object({
  // Toda rota do menu, incluindo as que ficam fora do CATALOGO_MENU
  // (`/dashboard`, `/painel`, `/tesouraria`) — a estrela aparece em
  // qualquer item da navegação, e validar contra o catálogo recusaria
  // justamente o Início.
  rota: z
    .string()
    .min(1)
    .max(200)
    // Só caminho absoluto, sem esquema nem host: o valor é comparado com
    // rotas do app e gravado em JSON; uma URL externa aqui nunca casaria
    // com item nenhum do menu e só poluiria a preferência.
    .regex(/^\/(?!\/)/, "Rota inválida."),
});

export type ResultadoAlternarFavorito = {
  favoritos: string[];
  // true quando o limite de MAX_FAVORITOS impediu a marcação — a UI usa
  // isto pra explicar o motivo em vez de simplesmente não fazer nada.
  limiteAtingido: boolean;
};

export const alternarFavoritoMenu = createServerFn({ method: "POST" })
  .validator((d: unknown) => alternarFavoritoSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoAlternarFavorito> =>
    comSessao(async (conn, usuarioId) => {
      // FOR UPDATE trava a linha até o COMMIT: dois cliques rápidos na
      // estrela (ou duas abas) leriam a mesma lista e um sobrescreveria o
      // outro, perdendo a marcação. A linha pode não existir ainda (usuário
      // que nunca salvou preferência) — nesse caso é criada vazia.
      await conn.beginTransaction();
      try {
        const [[atual]] = await conn.query<RowDataPacket[]>(
          `SELECT favoritos_json FROM preferencias_menu_usuario
            WHERE usuario_id = ? FOR UPDATE`,
          [usuarioId],
        );
        // O driver devolve JSON já desserializado quando a coluna é JSON;
        // senão vem string. Cobre os dois casos — mesmo cuidado do
        // parseJson em obterMinhasPreferenciasMenu, abaixo.
        const lidos = atual?.favoritos_json as unknown;
        const favoritos: string[] = Array.isArray(lidos)
          ? (lidos as string[])
          : JSON.parse(typeof lidos === "string" ? lidos : "[]");

        // Cópia do estado anterior para a auditoria — `favoritos` é mutado
        // logo abaixo, e registrarAuditoria precisa do antes e do depois
        // distintos (passar o mesmo array nos dois campos registraria uma
        // alteração que não aconteceu).
        const antes = [...favoritos];

        const jaEra = favoritos.includes(data.rota);
        if (jaEra) {
          favoritos.splice(favoritos.indexOf(data.rota), 1);
        } else if (favoritos.length >= MAX_FAVORITOS) {
          await conn.rollback();
          return { favoritos, limiteAtingido: true };
        } else {
          favoritos.push(data.rota);
        }

        // ocultos_json fica intacto: quem chega por aqui é o clique na
        // estrela, que não tem opinião sobre o que está oculto.
        await conn.query(
          `INSERT INTO preferencias_menu_usuario (usuario_id, ocultos_json, favoritos_json)
           VALUES (?, '[]', ?)
           ON DUPLICATE KEY UPDATE favoritos_json = VALUES(favoritos_json)`,
          [usuarioId, JSON.stringify(favoritos)],
        );
        await registrarAuditoria(
          conn,
          usuarioId,
          "editar_preferencias_menu",
          "usuario",
          usuarioId,
          { favoritos: antes },
          { favoritos },
        );
        await conn.commit();
        return { favoritos, limiteAtingido: false };
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    }),
  );

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
