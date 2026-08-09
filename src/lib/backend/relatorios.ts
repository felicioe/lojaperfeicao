import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { listarIrmaos } from "./irmaos";

export type FrequenciaIrmao = {
  id: string;
  nome_civil: string;
  nome_simbolico: string | null;
  presencas: number;
};
export type RelatorioFrequencia = { totalSessoes: number; irmaos: FrequenciaIrmao[] };

// irmaos segue a mesma visibilidade de listarIrmaos (admin/secretario/
// tesoureiro vê todos, irmão comum só o próprio) — sessões/presenças em si
// são de leitura livre (mesma RLS original: "sessoes_select"/"presencas_select").
export const relatorioFrequencia = createServerFn({ method: "GET" }).handler(
  async (): Promise<RelatorioFrequencia> => {
    const irmaosVisiveis = await listarIrmaos();
    return comSessao(async (conn) => {
      const [[{ total }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM sessoes",
      );
      const [presencas] = await conn.query<RowDataPacket[]>(
        "SELECT irmao_id, COUNT(*) AS presencas FROM presencas WHERE presente = TRUE GROUP BY irmao_id",
      );
      const mapa = new Map(presencas.map((p) => [p.irmao_id as string, Number(p.presencas)]));
      return {
        totalSessoes: Number(total),
        irmaos: irmaosVisiveis
          .map((i) => ({
            id: i.id,
            nome_civil: i.nome_civil,
            nome_simbolico: i.nome_simbolico,
            presencas: mapa.get(i.id) ?? 0,
          }))
          .sort((a, b) => a.nome_civil.localeCompare(b.nome_civil)),
      };
    });
  },
);

// Mesma visibilidade "privilegiado ou próprio" de tesouraria-lancamentos.ts.
const PAPEIS_PRIVILEGIADOS = ["admin", "tesoureiro", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

export type ItemInadimplente = {
  id: string;
  irmao_id: string;
  valor: number;
  data_vencimento: string;
  competencia_mes: string | null;
  descricao: string;
  nome_civil: string;
  nome_simbolico: string | null;
};

export const relatorioInadimplentes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ hoje: z.string() }).parse(d))
  .handler(async ({ data }): Promise<ItemInadimplente[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const condicoes = ["l.is_mensalidade = TRUE", "l.pago = FALSE", "l.data_vencimento < ?"];
      const valores: unknown[] = [data.hoje];
      if (!privilegiado) {
        condicoes.push("l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ?)");
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.irmao_id, l.valor, l.data_vencimento, l.competencia_mes, l.descricao,
                i.nome_civil, i.nome_simbolico
         FROM lancamentos l
         JOIN irmaos i ON i.id = l.irmao_id
         WHERE ${condicoes.join(" AND ")}
         ORDER BY l.data_vencimento`,
        valores,
      );
      return rows as ItemInadimplente[];
    });
  });

// ---------- Relatório de recebimentos no mês (issue #112) ----------
// Mesmos papéis de tesouraria-lancamentos.ts/tesouraria-faturas.ts — é
// dado financeiro da loja como um todo, não "próprio irmão".
const PAPEIS_TESOURARIA = ["admin", "tesoureiro"];

export type ItemRecebimento = {
  id: string;
  data: string;
  data_pagamento: string;
  descricao: string;
  valor: number;
  forma_pagamento: string | null;
  categoria_recebimento: string | null;
  conta_nome: string | null;
  irmao_nome: string | null;
};

const filtroRecebimentosSchema = z.object({
  competenciaMes: z.string().nullable(),
  de: z.string().nullable(),
  ate: z.string().nullable(),
  contaId: z.string().uuid().nullable(),
  categoria: z.string().nullable(),
  irmaoId: z.string().uuid().nullable(),
  formaPagamento: z.string().nullable(),
});

export const relatorioRecebimentos = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtroRecebimentosSchema.parse(d))
  .handler(async ({ data }): Promise<ItemRecebimento[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (conn) => {
      const condicoes = ["l.tipo = 'entrada'", "l.pago = TRUE"];
      const valores: unknown[] = [];
      if (data.competenciaMes) {
        condicoes.push("l.competencia_mes = ?");
        valores.push(data.competenciaMes);
      }
      if (data.de) {
        condicoes.push("l.data_pagamento >= ?");
        valores.push(data.de);
      }
      if (data.ate) {
        condicoes.push("l.data_pagamento <= ?");
        valores.push(data.ate);
      }
      if (data.contaId) {
        condicoes.push("l.conta_id = ?");
        valores.push(data.contaId);
      }
      if (data.categoria) {
        condicoes.push("l.categoria_recebimento = ?");
        valores.push(data.categoria);
      }
      if (data.irmaoId) {
        condicoes.push("l.irmao_id = ?");
        valores.push(data.irmaoId);
      }
      if (data.formaPagamento) {
        condicoes.push("l.forma_pagamento LIKE ?");
        valores.push(`%${data.formaPagamento}%`);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.data, l.data_pagamento, l.descricao, l.valor, l.forma_pagamento,
                l.categoria_recebimento, cf.nome AS conta_nome, i.nome_civil AS irmao_nome
         FROM lancamentos l
         LEFT JOIN contas_financeiras cf ON cf.id = l.conta_id
         LEFT JOIN irmaos i ON i.id = l.irmao_id
         WHERE ${condicoes.join(" AND ")}
         ORDER BY l.data_pagamento DESC
         LIMIT 2000`,
        valores,
      );
      return rows as ItemRecebimento[];
    });
  });

// ---------- Relatório de extrato da conciliação (issue #113) ----------
// Uma linha do OFX pode ter sido conciliada de duas formas diferentes,
// dependendo de quando/como foi feita:
// - "legado" (conciliar_ofx_existente/conciliar_ofx_baixando_lancamento/
//   criar_lancamento_de_ofx, ainda em uso pelo botão "Criar lançamento"
//   de linha órfã): grava só `ofx_lancamentos.lancamento_id`, 1 pra 1.
// - "lote" (conciliar_ofx_lote, issue #110): grava `conciliacao_id` tanto
//   no(s) lançamento(s) quanto na(s) linha(s) OFX do mesmo evento — N:N.
// O relatório precisa juntar os dois casos pra mostrar o vínculo correto
// nos dois.

export type ItemExtratoConciliacao = {
  id: string;
  data: string;
  valor: number;
  tipo_ofx: string | null;
  descricao: string | null;
  conciliado: boolean;
  conciliacao_id: string | null;
  lancamentos_vinculados: { id: string; descricao: string; valor: number }[];
};

const filtroExtratoConciliacaoSchema = z.object({
  contaId: z.string().uuid(),
  de: z.string().nullable(),
  ate: z.string().nullable(),
});

export const relatorioExtratoConciliacao = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtroExtratoConciliacaoSchema.parse(d))
  .handler(async ({ data }): Promise<ItemExtratoConciliacao[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (conn) => {
      const condicoes = ["o.conta_financeira_id = ?"];
      const valores: unknown[] = [data.contaId];
      if (data.de) {
        condicoes.push("o.data >= ?");
        valores.push(data.de);
      }
      if (data.ate) {
        condicoes.push("o.data <= ?");
        valores.push(data.ate);
      }
      const [linhas] = await conn.query<RowDataPacket[]>(
        `SELECT o.id, o.data, o.valor, o.tipo_ofx, o.descricao, o.conciliado,
                o.lancamento_id, o.conciliacao_id
         FROM ofx_lancamentos o
         WHERE ${condicoes.join(" AND ")}
         ORDER BY o.data DESC
         LIMIT 2000`,
        valores,
      );

      const idsLegado = [...new Set(linhas.map((l) => l.lancamento_id).filter(Boolean))];
      const idsConciliacao = [...new Set(linhas.map((l) => l.conciliacao_id).filter(Boolean))];

      const legadoMap = new Map<string, { id: string; descricao: string; valor: number }>();
      if (idsLegado.length > 0) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT id, descricao, valor FROM lancamentos WHERE id IN (?)`,
          [idsLegado],
        );
        for (const r of rows)
          legadoMap.set(r.id, { id: r.id, descricao: r.descricao, valor: r.valor });
      }

      const loteMap = new Map<string, { id: string; descricao: string; valor: number }[]>();
      if (idsConciliacao.length > 0) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT id, descricao, valor, conciliacao_id FROM lancamentos WHERE conciliacao_id IN (?)`,
          [idsConciliacao],
        );
        for (const r of rows) {
          const lista = loteMap.get(r.conciliacao_id) ?? [];
          lista.push({ id: r.id, descricao: r.descricao, valor: r.valor });
          loteMap.set(r.conciliacao_id, lista);
        }
      }

      return linhas.map((l) => ({
        id: l.id,
        data: l.data,
        valor: l.valor,
        tipo_ofx: l.tipo_ofx,
        descricao: l.descricao,
        conciliado: !!l.conciliado,
        conciliacao_id: l.conciliacao_id,
        lancamentos_vinculados: l.conciliacao_id
          ? (loteMap.get(l.conciliacao_id) ?? [])
          : l.lancamento_id && legadoMap.has(l.lancamento_id)
            ? [legadoMap.get(l.lancamento_id)!]
            : [],
      }));
    });
  });

// ---------- Relatório de extrato do irmão / histórico (issue #114) ----------
// Admin/tesoureiro apenas (mesmo padrão do resto do módulo de Tesouraria) —
// diferente do relatorioInadimplentes, que também deixa o próprio irmão
// ver o dele: aqui é uma consulta administrativa ("me dá o extrato do
// Fulano"), não uma tela de autoatendimento.

export type ItemExtratoIrmao = {
  id: string;
  data: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  descricao: string;
  valor: number;
  tipo: string;
  pago: boolean;
  forma_pagamento: string | null;
};

const filtroExtratoIrmaoSchema = z.object({
  irmaoId: z.string().uuid(),
  de: z.string().nullable(),
  ate: z.string().nullable(),
});

export const relatorioExtratoIrmao = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtroExtratoIrmaoSchema.parse(d))
  .handler(async ({ data }): Promise<ItemExtratoIrmao[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (conn) => {
      const condicoes = ["l.irmao_id = ?"];
      const valores: unknown[] = [data.irmaoId];
      if (data.de) {
        condicoes.push("l.data >= ?");
        valores.push(data.de);
      }
      if (data.ate) {
        condicoes.push("l.data <= ?");
        valores.push(data.ate);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.data, l.data_vencimento, l.data_pagamento, l.descricao, l.valor,
                l.tipo, l.pago, l.forma_pagamento
         FROM lancamentos l
         WHERE ${condicoes.join(" AND ")}
         ORDER BY l.data DESC
         LIMIT 2000`,
        valores,
      );
      return rows as ItemExtratoIrmao[];
    });
  });

// ---------- Relatório de inadimplência detalhado (issue #115) ----------
// Multa/juros calculados até hoje via a mesma procedure calcular_multa_juros
// já usada em baixar_faturas/BaixaDialog — não duplica a fórmula em JS,
// só chama a procedure por fatura (lista de inadimplentes tende a ser
// pequena/moderada, LIMIT 500 evita N chamadas descontroladas).

export type ItemInadimplenciaDetalhado = {
  id: string;
  irmao_id: string;
  nome_civil: string;
  nome_simbolico: string | null;
  descricao: string;
  data_vencimento: string;
  dias_atraso: number;
  valor_original: number;
  valor_multa: number;
  valor_juros: number;
  valor_total: number;
};

export const relatorioInadimplenciaDetalhado = createServerFn({ method: "GET" }).handler(
  async (): Promise<ItemInadimplenciaDetalhado[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (conn) => {
      const hoje = new Date().toISOString().slice(0, 10);
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.irmao_id, l.valor, l.data_vencimento, l.descricao,
                i.nome_civil, i.nome_simbolico
         FROM lancamentos l
         JOIN irmaos i ON i.id = l.irmao_id
         WHERE l.tipo = 'entrada' AND l.pago = FALSE AND l.data_vencimento < ?
         ORDER BY l.data_vencimento
         LIMIT 500`,
        [hoje],
      );

      const itens: ItemInadimplenciaDetalhado[] = [];
      for (const r of rows) {
        await conn.query("CALL calcular_multa_juros(?, ?, ?, @multa, @juros, @dias, @total)", [
          r.valor,
          r.data_vencimento,
          hoje,
        ]);
        const [[out]] = await conn.query<RowDataPacket[]>(
          "SELECT @multa AS multa, @juros AS juros, @dias AS dias, @total AS total",
        );
        itens.push({
          id: r.id,
          irmao_id: r.irmao_id,
          nome_civil: r.nome_civil,
          nome_simbolico: r.nome_simbolico,
          descricao: r.descricao,
          data_vencimento: r.data_vencimento,
          dias_atraso: Number(out.dias),
          valor_original: Number(r.valor),
          valor_multa: Number(out.multa),
          valor_juros: Number(out.juros),
          valor_total: Number(out.total),
        });
      }
      return itens;
    });
  },
);

const gerarCobrancaLoteSchema = z.object({ lancamentoIds: z.array(z.string().uuid()).min(1) });

export const gerarCobrancaLote = createServerFn({ method: "POST" })
  .validator((d: unknown) => gerarCobrancaLoteSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string; sucesso: boolean }[]> => {
    return comPapel(PAPEIS_TESOURARIA, async () => {
      const { enviarCobrancaManual } = await import("../email-dispatch");
      const resultados: { id: string; sucesso: boolean }[] = [];
      for (const id of data.lancamentoIds) {
        resultados.push({ id, sucesso: await enviarCobrancaManual(id) });
      }
      return resultados;
    });
  });
