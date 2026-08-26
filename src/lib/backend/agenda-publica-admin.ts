import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { LOJA_PORTAL_PUBLICO } from "../loja-portal-publico";

// Editor da agenda pública do site institucional (issue #367). Mesmo
// papel exclusivo de noticias.ts — manutenção do site é tarefa do super
// administrador (dono do domínio), não de qualquer admin/secretário de
// Loja.
const PAPEIS_ESCRITA = ["super_admin"];

/**
 * agenda-publica.ts (o loader consumido por /api/publico/agenda) só lê da
 * Loja hardcoded em loja-portal-publico.ts. Sem esta checagem, um
 * super_admin de outra Loja curaria uma agenda que nunca apareceria no
 * site — mesma falha silenciosa corrigida em noticias.ts (achado do review
 * automático da PR #368).
 */
function comPapelPortalPublico<T>(
  fn: (conn: PoolConnection, usuarioId: string, lojaId: string) => Promise<T>,
): Promise<T> {
  return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId, lojaId) => {
    if (lojaId !== LOJA_PORTAL_PUBLICO) {
      throw new Error("A agenda pública só pode ser gerida pela Loja do portal institucional.");
    }
    return fn(conn, usuarioId, lojaId);
  });
}

export type ItemAgendaPublicaAdmin = {
  id: string;
  data: string;
  tipo: "ordinaria" | "magna" | "branca" | "administrativa" | "iniciacao";
  grau: number;
  nome_grau: string | null;
  corpo: string | null;
  observacao_publica: string | null;
  oculto_agenda_publica: boolean;
};

export const listarAgendaPublicaAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<ItemAgendaPublicaAdmin[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.data, s.tipo, s.grau, og.nome AS nome_grau, o.nome AS corpo,
                s.observacao_publica, s.oculto_agenda_publica
         FROM sessoes s
         LEFT JOIN orgs o ON o.id = s.org_id AND o.loja_id = @current_loja_id
         LEFT JOIN orgs_graus og ON og.org_id = s.org_id AND og.grau = s.grau
                                AND og.loja_id = @current_loja_id
         WHERE s.loja_id = @current_loja_id AND s.data >= CURRENT_DATE
         ORDER BY s.data ASC`,
      );
      return rows as ItemAgendaPublicaAdmin[];
    });
  },
);

// Lista própria em vez de reaproveitar listarIrmaosNomes (irmaos.ts): lá o
// filtro de "privilegiado" é admin/secretario/tesoureiro — um super_admin
// puro cairia no fallback de "só o próprio irmão vinculado" e o seletor de
// responsável ficaria praticamente vazio. Aqui quem já passou por
// comPapelPortalPublico tem toda a autoridade de curadoria da agenda.
export const listarIrmaosParaTrabalho = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; nome_civil: string }[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_civil FROM irmaos WHERE loja_id = @current_loja_id ORDER BY nome_civil",
      );
      return rows as { id: string; nome_civil: string }[];
    });
  },
);

const salvarSchema = z.object({
  id: z.string().uuid(),
  data: z.string(),
  observacaoPublica: z.string().nullable(),
  oculto: z.boolean(),
});

// A data da sessão é editável só por aqui (issue #383) — pedido do usuário
// pra corrigir erros de importação do PDF do cronograma direto na Agenda
// Pública, sem depender de reabrir o assistente de importação. Fora deste
// contexto (Calendário normal, comSessao/comPapel de sessoes.ts) data/tipo/
// corpo/grau continuam imutáveis pós-criação — decisão que não muda aqui.
export const salvarAgendaPublicaSessao = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual) => {
      await conn.query(
        `UPDATE sessoes SET data = ?, observacao_publica = ?, oculto_agenda_publica = ?
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.data, data.observacaoPublica, data.oculto, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar",
        "agenda_publica_sessao",
        data.id,
        null,
        {
          data: data.data,
          observacaoPublica: data.observacaoPublica,
          oculto: data.oculto,
        },
      );
    });
  });

export type TrabalhoSessaoAdmin = {
  id: string;
  atividade: string;
  irmao_id: string | null;
  irmao_nome_civil: string | null;
};

// Programação da sessão (peça de arquitetura + responsável) — issue #383.
// Só existia hoje via importação de PDF (sessao_responsaveis populado pelo
// importador); esta é a primeira tela que permite editar isso à mão.
export const listarTrabalhosSessao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ sessaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<TrabalhoSessaoAdmin[]> => {
    return comPapelPortalPublico(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT sr.id, sr.atividade, sr.irmao_id, i.nome_civil AS irmao_nome_civil
         FROM sessao_responsaveis sr
         JOIN sessoes s ON s.id = sr.sessao_id AND s.loja_id = @current_loja_id
         LEFT JOIN irmaos i ON i.id = sr.irmao_id AND i.loja_id = @current_loja_id
         WHERE sr.sessao_id = ? AND sr.loja_id = @current_loja_id
         ORDER BY sr.criado_em`,
        [data.sessaoId],
      );
      return rows.map((r) => ({
        id: r.id as string,
        atividade: (r.atividade as string) ?? "",
        irmao_id: r.irmao_id as string | null,
        irmao_nome_civil: r.irmao_nome_civil as string | null,
      }));
    });
  });

const trabalhoSchema = z.object({
  id: z.string().uuid().nullable(),
  atividade: z.string().trim().min(1, "Descreva a peça.").max(500),
  irmaoId: z.string().uuid().nullable(),
});

const salvarTrabalhosSchema = z.object({
  sessaoId: z.string().uuid(),
  trabalhos: z.array(trabalhoSchema).max(50),
  removerIds: z.array(z.string().uuid()).max(50),
});

// Um único server fn pra tudo (criar/atualizar/excluir) em vez de um por
// linha — a tela edita a lista inteira de uma vez e "Salvar" precisa
// refletir o que está na tela sem risco de metade salvar e metade falhar.
export const salvarTrabalhosSessao = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarTrabalhosSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelPortalPublico(async (conn, usuarioIdAtual, lojaId) => {
      const [[sessao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM sessoes WHERE id = ? AND loja_id = @current_loja_id",
        [data.sessaoId],
      );
      if (!sessao) throw new Error("Sessão não encontrada nesta Loja.");

      if (data.removerIds.length > 0) {
        await conn.query(
          `DELETE FROM sessao_responsaveis
           WHERE sessao_id = ? AND loja_id = @current_loja_id AND id IN (${data.removerIds.map(() => "?").join(",")})`,
          [data.sessaoId, ...data.removerIds],
        );
      }

      for (const trabalho of data.trabalhos) {
        if (trabalho.id) {
          await conn.query(
            `UPDATE sessao_responsaveis SET atividade = ?, irmao_id = ?
             WHERE id = ? AND sessao_id = ? AND loja_id = @current_loja_id`,
            [trabalho.atividade, trabalho.irmaoId, trabalho.id, data.sessaoId],
          );
          continue;
        }
        // nome_extraido é legado da importação de PDF (NOT NULL na tabela) —
        // não aparece mais em lugar nenhum da exibição (agenda-publica.ts usa
        // só o nome_simbolico do irmão vinculado), então qualquer texto serve.
        let nomeExtraido = "(cadastrado manualmente)";
        if (trabalho.irmaoId) {
          const [[irmao]] = await conn.query<RowDataPacket[]>(
            "SELECT nome_civil FROM irmaos WHERE id = ? AND loja_id = @current_loja_id",
            [trabalho.irmaoId],
          );
          if (!irmao) throw new Error("Irmão não encontrado nesta Loja.");
          nomeExtraido = irmao.nome_civil as string;
        }
        await conn.query(
          `INSERT INTO sessao_responsaveis (loja_id, sessao_id, irmao_id, nome_extraido, atividade)
           VALUES (?, ?, ?, ?, ?)`,
          [lojaId, data.sessaoId, trabalho.irmaoId, nomeExtraido, trabalho.atividade],
        );
      }

      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar",
        "sessao_responsaveis",
        data.sessaoId,
        null,
        { trabalhos: data.trabalhos.length, removidos: data.removerIds.length },
      );
    });
  });
