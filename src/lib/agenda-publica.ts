import type { RowDataPacket } from "mysql2";
import { withLojaConnection } from "./backend/db";
import { sanitizarRichTextPublico } from "./rich-text-server";
import { LOJA_PORTAL_PUBLICO } from "./loja-portal-publico";

export type ItemAgendaPublica = {
  id: string;
  data: string;
  tipo: string;
  grau: number;
  nome_grau: string | null;
  corpo: string | null;
  observacao: string | null;
  trabalhos: Array<{
    titulo: string;
    nome_historico: string | null;
  }>;
};

type LinhaAgenda = RowDataPacket & {
  id: string;
  data: string;
  tipo: string;
  grau: number;
  nome_grau: string | null;
  corpo: string | null;
  observacao_publica: string | null;
  atividade: string | null;
  nome_historico: string | null;
};

/**
 * Agenda própria para publicação no portal institucional.
 *
 * A consulta deliberadamente não seleciona nome_civil, nome_extraido nem
 * qualquer outro identificador pessoal. Se o irmão não tiver nome simbólico
 * cadastrado, o trabalho permanece público, mas sem autoria identificada.
 *
 * `oculto_agenda_publica` (issue #367) deixa a secretaria tirar uma sessão
 * específica do site sem mexer na agenda interna nem apagar o registro.
 * `observacao_publica` é texto rico à parte de `sessoes.observacoes`
 * (anotação interna) — sanitizado aqui do mesmo jeito que noticias-publica.ts,
 * porque também sai para a internet sem autenticação.
 */
export async function carregarAgendaPublica(): Promise<ItemAgendaPublica[]> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [rows] = await conn.query<LinhaAgenda[]>(
      `SELECT s.id, s.data, s.tipo, s.grau,
              og.nome AS nome_grau, o.nome AS corpo, s.observacao_publica,
              sr.atividade, NULLIF(TRIM(i.nome_simbolico), '') AS nome_historico
       FROM sessoes s
       LEFT JOIN orgs o ON o.id = s.org_id
       LEFT JOIN orgs_graus og ON og.org_id = s.org_id AND og.grau = s.grau
       LEFT JOIN sessao_responsaveis sr ON sr.sessao_id = s.id
       LEFT JOIN irmaos i ON i.id = sr.irmao_id
       WHERE s.loja_id = @current_loja_id AND s.data >= CURRENT_DATE
         AND s.oculto_agenda_publica = FALSE
       ORDER BY s.data ASC, sr.criado_em ASC`,
    );

    const porSessao = new Map<string, ItemAgendaPublica>();
    for (const row of rows) {
      let item = porSessao.get(row.id);
      if (!item) {
        item = {
          id: row.id,
          data: row.data,
          tipo: row.tipo,
          grau: row.grau,
          nome_grau: row.nome_grau,
          corpo: row.corpo,
          observacao: row.observacao_publica
            ? sanitizarRichTextPublico(row.observacao_publica)
            : null,
          trabalhos: [],
        };
        porSessao.set(row.id, item);
      }

      const titulo = row.atividade?.trim();
      if (titulo) {
        item.trabalhos.push({
          titulo,
          nome_historico: row.nome_historico,
        });
      }
    }

    return [...porSessao.values()];
  });
}
