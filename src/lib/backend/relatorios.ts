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
        "SELECT COUNT(*) AS total FROM sessoes WHERE loja_id = @current_loja_id",
      );
      const [presencas] = await conn.query<RowDataPacket[]>(
        `SELECT irmao_id, COUNT(*) AS presencas
           FROM presencas
          WHERE presente = TRUE AND loja_id = @current_loja_id
          GROUP BY irmao_id`,
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
      const condicoes = ["l.tipo = 'entrada'", "l.pago = FALSE", "l.data_vencimento < ?"];
      const valores: unknown[] = [data.hoje];
      if (!privilegiado) {
        condicoes.push(
          "l.irmao_id IN (SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id)",
        );
        valores.push(usuarioId);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.irmao_id, (l.valor - l.valor_pago) AS valor, l.data_vencimento, l.competencia_mes, l.descricao,
                i.nome_civil, i.nome_simbolico
         FROM lancamentos l
         JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
         WHERE l.loja_id = @current_loja_id AND ${condicoes.join(" AND ")}
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

// Desde o pagamento parcial (issue #131), uma fatura pode ser recebida em
// mais de um evento (baixa manual e/ou conciliação), cada um com sua
// própria data e valor — l.valor/l.data_pagamento representam só o
// fechamento final, não cada recebimento. Pra "quanto entrou em cada
// mês" bater com a realidade, a fonte de verdade é o evento de
// recebimento (recibo_itens pra baixa manual, conciliacao_lancamentos
// pra conciliação), não mais a fatura. Um terceiro braço cobre o que
// ainda ficar pago=TRUE sem nenhum dos dois (ex.: o caminho legado de
// conciliação 1:1 de antes da issue #110, que nunca gerou recibo nem
// evento de conciliação em lote) — usa o valor/data cheios da fatura
// como sempre foi.
export const relatorioRecebimentos = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtroRecebimentosSchema.parse(d))
  .handler(async ({ data }): Promise<ItemRecebimento[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (conn) => {
      // Filtros que são atributo da fatura em si (não do evento de
      // recebimento) — batem igual nos 3 ramos da UNION.
      const condicoesComuns = ["l.tipo = 'entrada'"];
      const valoresComuns: unknown[] = [];
      if (data.competenciaMes) {
        condicoesComuns.push("l.competencia_mes = ?");
        valoresComuns.push(data.competenciaMes);
      }
      if (data.categoria) {
        condicoesComuns.push("l.categoria_recebimento = ?");
        valoresComuns.push(data.categoria);
      }
      if (data.irmaoId) {
        condicoesComuns.push("l.irmao_id = ?");
        valoresComuns.push(data.irmaoId);
      }

      // Conta e forma de pagamento são atributos do EVENTO de recebimento,
      // que pode divergir do que está gravado na fatura (l.conta_id/
      // l.forma_pagamento refletem só o fechamento final — uma fatura paga
      // em mais de uma leva pode ter usado contas/formas diferentes em
      // cada evento). Filtrar pela coluna errada excluía recebimentos que
      // deveriam aparecer. Cada ramo usa a coluna que de fato representa
      // "onde/como esse evento específico entrou".
      function comFiltroEvento(condicoesBase: string[], colConta: string, colForma: string) {
        const condicoes = [...condicoesBase];
        const valores = [...valoresComuns];
        if (data.contaId) {
          condicoes.push(`${colConta} = ?`);
          valores.push(data.contaId);
        }
        if (data.formaPagamento) {
          condicoes.push(`${colForma} LIKE ?`);
          valores.push(`%${data.formaPagamento}%`);
        }
        return { where: condicoes.join(" AND "), valores };
      }

      const recibo = comFiltroEvento(condicoesComuns, "r.conta_financeira_id", "r.forma_pagamento");
      const conciliacao = comFiltroEvento(
        condicoesComuns,
        "c.conta_financeira_id",
        "l.forma_pagamento",
      );
      const fora = comFiltroEvento(
        [
          ...condicoesComuns,
          "l.pago = TRUE",
          // criar_parcelamento marca as faturas originais como pago=TRUE
          // (parcelado=TRUE) sem nenhum evento de caixa de verdade — a
          // dívida foi restruturada em parcelas, não recebida. Contar essa
          // linha aqui somava o valor de face inteiro na data do acordo,
          // e de novo quando cada parcela fosse paga (achado #7 da
          // auditoria financeira: recebimento em dobro).
          "l.parcelado = FALSE",
          "NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id)",
          "NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id AND co.status = 'ativa' WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id)",
        ],
        "l.conta_id",
        "l.forma_pagamento",
      );

      const condicoesData: string[] = [];
      const valoresData: unknown[] = [];
      if (data.de) {
        condicoesData.push("data_pagamento >= ?");
        valoresData.push(data.de);
      }
      if (data.ate) {
        condicoesData.push("data_pagamento <= ?");
        valoresData.push(data.ate);
      }
      const havingData = condicoesData.length > 0 ? `WHERE ${condicoesData.join(" AND ")}` : "";

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT * FROM (
           SELECT ri.id, l.data, r.data AS data_pagamento, l.descricao,
                  (ri.valor_original + ri.valor_multa + ri.valor_juros) AS valor,
                  r.forma_pagamento, l.categoria_recebimento,
                  cf.nome AS conta_nome, i.nome_civil AS irmao_nome
           FROM recibo_itens ri
           JOIN recibos r ON r.id = ri.recibo_id AND r.loja_id = ri.loja_id
           JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
           LEFT JOIN contas_financeiras cf ON cf.id = r.conta_financeira_id AND cf.loja_id = r.loja_id
           LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
           WHERE ri.loja_id = @current_loja_id AND ${recibo.where}
           UNION ALL
           SELECT cl.id, l.data, c.data_conciliacao AS data_pagamento, l.descricao,
                  cl.valor_aplicado AS valor,
                  l.forma_pagamento, l.categoria_recebimento,
                  cf.nome AS conta_nome, i.nome_civil AS irmao_nome
           FROM conciliacao_lancamentos cl
           JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id AND c.status = 'ativa'
           JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = cl.loja_id
           LEFT JOIN contas_financeiras cf ON cf.id = c.conta_financeira_id AND cf.loja_id = c.loja_id
           LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
           WHERE cl.loja_id = @current_loja_id AND ${conciliacao.where}
           UNION ALL
           SELECT l.id, l.data, l.data_pagamento, l.descricao, l.valor,
                  l.forma_pagamento, l.categoria_recebimento,
                  cf.nome AS conta_nome, i.nome_civil AS irmao_nome
           FROM lancamentos l
           LEFT JOIN contas_financeiras cf ON cf.id = l.conta_id AND cf.loja_id = l.loja_id
           LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
           WHERE l.loja_id = @current_loja_id AND ${fora.where}
         ) rec
         ${havingData}
         ORDER BY data_pagamento DESC
         LIMIT 2000`,
        [...recibo.valores, ...conciliacao.valores, ...fora.valores, ...valoresData],
      );
      // Busca as 2000 mais recentes (LIMIT precisa do DESC pra não cortar
      // fora justamente os recebimentos mais novos quando há mais de 2000
      // no filtro) e inverte só na saída — exibição sempre do mais antigo
      // pro mais novo, sem arriscar sumir com dado recente por causa do cap.
      return (rows as ItemRecebimento[]).reverse();
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

export type LancamentoVinculado = {
  id: string;
  descricao: string;
  valor: number;
  tipo: "entrada" | "saida" | "transferencia";
  irmao_id: string | null;
  irmao_nome: string | null;
};

// Reconstrói, por evento de conciliação em lote, qual linha do OFX pagou
// qual lançamento — a procedure conciliar_ofx_lote (0044) só grava que a
// SOMA de N linhas do banco bateu com a SOMA de M lançamentos, nunca o
// par individual. Achado do usuário: um evento com 6 Pix de R$ 70 em datas
// diferentes, batido contra 6 mensalidades de meses diferentes, aparecia
// nos relatórios com as 6 mensalidades penduradas em CADA uma das 6 linhas
// do banco — cada Pix "vinculado" a mensalidades que na prática outro Pix
// pagou.
//
// Só reconstrói quando dá pra deduzir com certeza: mesma quantidade dos
// dois lados. Tenta primeiro casar por VALOR idêntico (quando os dois
// lados trazem valor e isso decompõe o lote em grupos do mesmo tamanho,
// sem sobra de nenhum lado) — é o caso mais comum e mais seguro: várias
// linhas do mesmo dia com valores diferentes (achado do usuário, comparado
// com o extrato real do Sicoob — ex.: uma pessoa pagando 3 coisas
// diferentes no mesmo Pix/dia) ficam pareadas certas mesmo sem depender de
// ordem cronológica nenhuma. Só cai pra ordem por data (1º por data ↔ 1º
// por vencimento) quando o valor não decompõe (ex.: as 6 mensalidades de
// R$ 70 do achado original — todas do mesmo valor, só a data separa).
// Quantidades diferentes, ou valor que não decompõe E data repetida dentro
// do mesmo valor, não permitem nenhuma dedução segura — nesse caso quem
// chama deve mostrar que é um lote sem separação possível, não inventar
// um vínculo.
function parearLotePorOrdem(
  ofx: { id: string; data: string; valor?: number }[],
  lancamentos: { id: string; ordenacao: string; valor?: number }[],
): Map<string, string> | null {
  if (ofx.length === 0 || ofx.length !== lancamentos.length) return null;

  if (ofx.every((o) => o.valor != null) && lancamentos.every((l) => l.valor != null)) {
    const porValorOfx = new Map<string, typeof ofx>();
    for (const o of ofx) {
      const chave = Math.abs(o.valor!).toFixed(2);
      porValorOfx.set(chave, [...(porValorOfx.get(chave) ?? []), o]);
    }
    const porValorLanc = new Map<string, typeof lancamentos>();
    for (const l of lancamentos) {
      const chave = Math.abs(l.valor!).toFixed(2);
      porValorLanc.set(chave, [...(porValorLanc.get(chave) ?? []), l]);
    }
    const chaves = new Set([...porValorOfx.keys(), ...porValorLanc.keys()]);
    const decompoeSemSobra = [...chaves].every(
      (chave) => (porValorOfx.get(chave)?.length ?? 0) === (porValorLanc.get(chave)?.length ?? 0),
    );
    if (decompoeSemSobra) {
      const pares = new Map<string, string>();
      for (const chave of chaves) {
        const ofxDoValor = [...(porValorOfx.get(chave) ?? [])].sort(
          (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
        );
        const lancDoValor = [...(porValorLanc.get(chave) ?? [])].sort(
          (a, b) => a.ordenacao.localeCompare(b.ordenacao) || a.id.localeCompare(b.id),
        );
        ofxDoValor.forEach((o, i) => pares.set(o.id, lancDoValor[i].id));
      }
      return pares;
    }
  }

  const ofxOrdenado = [...ofx].sort(
    (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
  );
  const lancOrdenado = [...lancamentos].sort(
    (a, b) => a.ordenacao.localeCompare(b.ordenacao) || a.id.localeCompare(b.id),
  );
  const pares = new Map<string, string>();
  ofxOrdenado.forEach((o, i) => pares.set(o.id, lancOrdenado[i].id));
  return pares;
}

export type ItemExtratoConciliacao = {
  id: string;
  data: string;
  valor: number;
  tipo_ofx: string | null;
  descricao: string | null;
  conciliado: boolean;
  conciliacao_id: string | null;
  anulacao_ofx: boolean;
  historico: string | null;
  lancamentos_vinculados: LancamentoVinculado[];
  // true = esta linha faz parte de um evento de conciliação em lote com
  // quantidades de linhas OFX/lançamentos que não permitem deduzir com
  // certeza qual pagou qual (ver parearLotePorOrdem) — lancamentos_vinculados
  // vem vazio de propósito nesse caso, pra tela mostrar o aviso de lote em
  // vez de uma lista que misturaria vínculos de outras linhas do mesmo lote.
  lote_sem_separacao: boolean;
  lote_qtd_ofx: number | null;
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
      const [linhasDesc] = await conn.query<RowDataPacket[]>(
        `SELECT o.id, o.data, o.valor, o.tipo_ofx, o.descricao,
                (o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
                  SELECT 1 FROM conciliacoes c
                  WHERE c.id = o.conciliacao_id AND c.loja_id = o.loja_id AND c.status = 'ativa'
                ) OR EXISTS (
                  SELECT 1 FROM ofx_anulacoes oa
                  WHERE oa.loja_id = o.loja_id
                    AND (oa.ofx_credito_id = o.id OR oa.ofx_debito_id = o.id)
                )) AS conciliado,
                o.lancamento_id, o.conciliacao_id,
                EXISTS(SELECT 1 FROM ofx_anulacoes oa
                  WHERE oa.loja_id = o.loja_id
                    AND (oa.ofx_credito_id = o.id OR oa.ofx_debito_id = o.id)) AS anulacao_ofx,
                (SELECT oa.historico FROM ofx_anulacoes oa
                  WHERE oa.loja_id = o.loja_id
                    AND (oa.ofx_credito_id = o.id OR oa.ofx_debito_id = o.id)
                  LIMIT 1) AS historico
         FROM ofx_lancamentos o
         WHERE o.loja_id = @current_loja_id AND ${condicoes.join(" AND ")}
         ORDER BY o.data DESC
         LIMIT 2000`,
        valores,
      );
      // Mesmo motivo do relatório de recebimentos: busca as 2000 mais
      // recentes (DESC) e só inverte na saída, pra exibir do mais antigo
      // pro mais novo sem arriscar cortar fora dado recente.
      const linhas = linhasDesc.reverse();

      const idsLegado = [...new Set(linhas.map((l) => l.lancamento_id).filter(Boolean))];
      const idsConciliacao = [...new Set(linhas.map((l) => l.conciliacao_id).filter(Boolean))];

      const legadoMap = new Map<string, LancamentoVinculado>();
      if (idsLegado.length > 0) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT l.id, l.descricao, l.valor, l.tipo, l.irmao_id, i.nome_civil AS irmao_nome
           FROM lancamentos l LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
           WHERE l.id IN (?) AND l.loja_id = @current_loja_id`,
          [idsLegado],
        );
        for (const r of rows)
          legadoMap.set(r.id, {
            id: r.id,
            descricao: r.descricao,
            valor: r.valor,
            tipo: r.tipo,
            irmao_id: r.irmao_id,
            irmao_nome: r.irmao_nome,
          });
      }

      const loteMap = new Map<string, LancamentoVinculado[]>();
      // Ordenação pra reconstruir o par (ver parearLotePorOrdem): vencimento
      // quando existe, senão a própria data do lançamento (saída/estorno sem
      // vencimento formal) — mesmo fallback já usado no extrato do irmão.
      const ordenacaoLancPorId = new Map<string, string>();
      if (idsConciliacao.length > 0) {
        // cl.valor_aplicado (não l.valor): o valor de face da fatura só bate
        // com o que essa conciliação aplicou quando ela fechou a fatura
        // inteira — numa alocação parcial diverge, e a linha nem apareceria
        // usando l.conciliacao_id (só gravado no lançamento quando
        // fechou_fatura=TRUE; conciliacao_lancamentos é a fonte completa,
        // mesma correção já aplicada em relatorioExtratoBancario).
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT l.id, l.descricao, cl.valor_aplicado AS valor, l.tipo, l.irmao_id,
                  cl.conciliacao_id, i.nome_civil AS irmao_nome,
                  COALESCE(l.data_vencimento, l.data) AS data_ordenacao
           FROM conciliacao_lancamentos cl
           JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = cl.loja_id
           LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
           WHERE cl.conciliacao_id IN (?) AND cl.loja_id = @current_loja_id`,
          [idsConciliacao],
        );
        for (const r of rows) {
          const lista = loteMap.get(r.conciliacao_id) ?? [];
          lista.push({
            id: r.id,
            descricao: r.descricao,
            valor: r.valor,
            tipo: r.tipo,
            irmao_id: r.irmao_id,
            irmao_nome: r.irmao_nome,
          });
          loteMap.set(r.conciliacao_id, lista);
          ordenacaoLancPorId.set(r.id, String(r.data_ordenacao));
        }
      }

      // Reconstrói o vínculo linha-a-linha por evento (ver parearLotePorOrdem)
      // — precisa de TODAS as linhas OFX do evento, não só as que passaram no
      // filtro de data/conta desta consulta, pra saber a quantidade real N.
      const parPorOfxId = new Map<string, string>();
      const qtdOfxPorConciliacao = new Map<string, number>();
      if (idsConciliacao.length > 0) {
        const [ofxDoLote] = await conn.query<RowDataPacket[]>(
          `SELECT id, conciliacao_id, data, valor FROM ofx_lancamentos
           WHERE conciliacao_id IN (?) AND loja_id = @current_loja_id`,
          [idsConciliacao],
        );
        const porConciliacao = new Map<string, { id: string; data: string; valor: number }[]>();
        for (const o of ofxDoLote) {
          const lista = porConciliacao.get(o.conciliacao_id) ?? [];
          lista.push({ id: o.id, data: String(o.data), valor: Number(o.valor) });
          porConciliacao.set(o.conciliacao_id, lista);
        }
        for (const conciliacaoId of idsConciliacao) {
          const ofxDesteLote = porConciliacao.get(conciliacaoId) ?? [];
          qtdOfxPorConciliacao.set(conciliacaoId, ofxDesteLote.length);
          const lancDesteLote = (loteMap.get(conciliacaoId) ?? []).map((lv) => ({
            id: lv.id,
            ordenacao: ordenacaoLancPorId.get(lv.id) ?? "",
            valor: Number(lv.valor),
          }));
          const pares = parearLotePorOrdem(ofxDesteLote, lancDesteLote);
          if (pares) for (const [ofxId, lancId] of pares) parPorOfxId.set(ofxId, lancId);
        }
      }

      return linhas.map((l) => {
        if (!l.conciliacao_id) {
          return {
            id: l.id,
            data: l.data,
            valor: l.valor,
            tipo_ofx: l.tipo_ofx,
            descricao: l.descricao,
            conciliado: !!l.conciliado,
            conciliacao_id: null,
            anulacao_ofx: !!l.anulacao_ofx,
            historico: l.historico,
            lancamentos_vinculados:
              l.lancamento_id && legadoMap.has(l.lancamento_id)
                ? [legadoMap.get(l.lancamento_id)!]
                : [],
            lote_sem_separacao: false,
            lote_qtd_ofx: null,
          };
        }
        const qtdOfx = qtdOfxPorConciliacao.get(l.conciliacao_id) ?? 1;
        const lancamentosDoLote = loteMap.get(l.conciliacao_id) ?? [];
        // Só 1 linha OFX no evento: sem ambiguidade nenhuma, ela é mesmo a
        // origem de todos os lançamentos do lote (ex.: um depósito único
        // cobrindo várias faturas de uma vez — issue #131).
        let lancamentosVinculados: LancamentoVinculado[];
        let loteSemSeparacao: boolean;
        if (qtdOfx <= 1) {
          lancamentosVinculados = lancamentosDoLote;
          loteSemSeparacao = false;
        } else {
          const lancId = parPorOfxId.get(l.id);
          const vinculado = lancId ? lancamentosDoLote.find((lv) => lv.id === lancId) : undefined;
          lancamentosVinculados = vinculado ? [vinculado] : [];
          loteSemSeparacao = !vinculado;
        }
        return {
          id: l.id,
          data: l.data,
          valor: l.valor,
          tipo_ofx: l.tipo_ofx,
          descricao: l.descricao,
          conciliado: !!l.conciliado,
          conciliacao_id: l.conciliacao_id,
          anulacao_ofx: !!l.anulacao_ofx,
          historico: l.historico,
          lancamentos_vinculados: lancamentosVinculados,
          lote_sem_separacao: loteSemSeparacao,
          lote_qtd_ofx: qtdOfx,
        };
      });
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
  valor_pago: number;
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
      // Filtra por vencimento (com fallback pra emissão nos lançamentos sem
      // vencimento formal — saída/estorno/transferência), não por emissão:
      // a tela inteira é organizada em torno de vencimento (ordenação
      // padrão, "Atrasado"/"A vencer", cards de total), então "De"/"Até"
      // filtrando por outra coisa surpreendia o usuário — um "Até" sem
      // "De" cortava faturas com vencimento dentro do período mas emitidas
      // antes dele (achado do usuário). Mesmo padrão já usado no extrato
      // SGCAB logo abaixo (COALESCE(sf.vencimento, DATE(sf.criado_em))).
      const condicoes = ["l.irmao_id = ?"];
      const valores: unknown[] = [data.irmaoId];
      if (data.de) {
        condicoes.push("COALESCE(l.data_vencimento, l.data) >= ?");
        valores.push(data.de);
      }
      if (data.ate) {
        condicoes.push("COALESCE(l.data_vencimento, l.data) <= ?");
        valores.push(data.ate);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.data, l.data_vencimento, l.data_pagamento AS data_pagamento_evento,
                (SELECT o.data FROM ofx_lancamentos o
                  WHERE o.loja_id = l.loja_id AND o.lancamento_id = l.id LIMIT 1) AS data_pagamento_direta,
                (SELECT cl.conciliacao_id FROM conciliacao_lancamentos cl
                   JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id
                                       AND c.status = 'ativa'
                  WHERE cl.loja_id = l.loja_id AND cl.lancamento_id = l.id LIMIT 1) AS conciliacao_id_lote,
                l.descricao, l.valor, l.valor_pago,
                l.tipo, l.pago, l.forma_pagamento
         FROM lancamentos l
         WHERE l.loja_id = @current_loja_id AND ${condicoes.join(" AND ")}
         ORDER BY l.data DESC
         LIMIT 2000`,
        valores,
      );

      // Mesma reconstrução de src/lib/backend/relatorios.ts#parearLotePorOrdem:
      // a data de pagamento de um lançamento pago via conciliação em lote
      // (issue #110) não pode ser "a data mais recente entre todas as linhas
      // do lote" (o que era MAX(o.data) antes) — isso mostra a data de um Pix
      // de outro mês como se fosse quando ESTE lançamento foi pago. Só
      // resolve com certeza quando dá pra parear 1:1 por ordem; senão cai
      // pra l.data_pagamento (a data do evento, que já é o melhor dado
      // honesto disponível quando não dá pra separar por linha).
      const idsConciliacaoLote = [
        ...new Set(rows.map((r) => r.conciliacao_id_lote).filter(Boolean)),
      ];
      const dataPagamentoPorLancamento = new Map<string, string>();
      if (idsConciliacaoLote.length > 0) {
        const [ofxDoLote] = await conn.query<RowDataPacket[]>(
          `SELECT id, conciliacao_id, data, valor FROM ofx_lancamentos
           WHERE conciliacao_id IN (?) AND loja_id = @current_loja_id`,
          [idsConciliacaoLote],
        );
        const [lancDoLote] = await conn.query<RowDataPacket[]>(
          `SELECT cl.conciliacao_id, cl.lancamento_id, cl.valor_aplicado AS valor,
                  COALESCE(l2.data_vencimento, l2.data) AS ordenacao
           FROM conciliacao_lancamentos cl
           JOIN lancamentos l2 ON l2.id = cl.lancamento_id AND l2.loja_id = cl.loja_id
           WHERE cl.conciliacao_id IN (?) AND cl.loja_id = @current_loja_id`,
          [idsConciliacaoLote],
        );
        const ofxPorConciliacao = new Map<string, { id: string; data: string; valor: number }[]>();
        const dataPorOfxId = new Map<string, string>();
        for (const o of ofxDoLote) {
          const lista = ofxPorConciliacao.get(o.conciliacao_id) ?? [];
          lista.push({ id: o.id, data: String(o.data), valor: Number(o.valor) });
          ofxPorConciliacao.set(o.conciliacao_id, lista);
          dataPorOfxId.set(o.id, String(o.data));
        }
        const lancPorConciliacao = new Map<
          string,
          { id: string; ordenacao: string; valor: number }[]
        >();
        for (const r of lancDoLote) {
          const lista = lancPorConciliacao.get(r.conciliacao_id) ?? [];
          lista.push({
            id: r.lancamento_id,
            ordenacao: String(r.ordenacao),
            valor: Number(r.valor),
          });
          lancPorConciliacao.set(r.conciliacao_id, lista);
        }
        for (const conciliacaoId of idsConciliacaoLote) {
          const ofxDesteLote = ofxPorConciliacao.get(conciliacaoId) ?? [];
          if (ofxDesteLote.length === 1) {
            // Sem ambiguidade: só 1 linha do banco no evento, é ela mesma.
            for (const l of lancPorConciliacao.get(conciliacaoId) ?? []) {
              dataPagamentoPorLancamento.set(l.id, ofxDesteLote[0].data);
            }
            continue;
          }
          const pares = parearLotePorOrdem(
            ofxDesteLote,
            lancPorConciliacao.get(conciliacaoId) ?? [],
          );
          if (!pares) continue;
          for (const [ofxId, lancId] of pares) {
            dataPagamentoPorLancamento.set(lancId, dataPorOfxId.get(ofxId)!);
          }
        }
      }

      const itens: ItemExtratoIrmao[] = rows.map((r) => ({
        id: r.id,
        data: r.data,
        data_vencimento: r.data_vencimento,
        data_pagamento:
          r.data_pagamento_direta ??
          dataPagamentoPorLancamento.get(r.id) ??
          r.data_pagamento_evento,
        descricao: r.descricao,
        valor: r.valor,
        valor_pago: r.valor_pago,
        tipo: r.tipo,
        pago: r.pago,
        forma_pagamento: r.forma_pagamento,
      }));
      // Mesmo motivo do relatório de recebimentos: DESC+LIMIT pra pegar os
      // 2000 mais recentes desse irmão, invertendo só na saída.
      return itens.reverse();
    });
  });

// ---------- Taxas SGCAB no extrato do irmão --------------------------------
// Permanecem gerenciais e separadas dos lançamentos da Loja. A consulta existe
// apenas para oferecer uma visão global das obrigações do irmão.
export type ItemExtratoSgcab = {
  id: string;
  data: string;
  vencimento: string | null;
  data_pagamento: string | null;
  titulo: string;
  itens_descricao: string | null;
  total: number;
  status: "pendente" | "pago" | "cancelado";
};

export const relatorioExtratoSgcabIrmao = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtroExtratoIrmaoSchema.parse(d))
  .handler(async ({ data }): Promise<ItemExtratoSgcab[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (conn) => {
      const condicoes = ["sf.irmao_id = ?"];
      const valores: unknown[] = [data.irmaoId];
      if (data.de) {
        condicoes.push("COALESCE(sf.vencimento, DATE(sf.criado_em)) >= ?");
        valores.push(data.de);
      }
      if (data.ate) {
        condicoes.push("COALESCE(sf.vencimento, DATE(sf.criado_em)) <= ?");
        valores.push(data.ate);
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT sf.id, DATE(sf.criado_em) AS data, sf.vencimento, sf.data_pagamento,
                sf.titulo, sf.total, sf.status,
                GROUP_CONCAT(sfi.descricao ORDER BY sfi.ordem, sfi.criado_em SEPARATOR ' · ') AS itens_descricao
         FROM sgcab_faturas sf
         LEFT JOIN sgcab_fatura_itens sfi ON sfi.fatura_id = sf.id AND sfi.loja_id = sf.loja_id
         WHERE sf.loja_id = @current_loja_id AND ${condicoes.join(" AND ")}
         GROUP BY sf.id
         ORDER BY sf.vencimento IS NULL, sf.vencimento, sf.criado_em DESC
         LIMIT 2000`,
        valores,
      );
      return rows as ItemExtratoSgcab[];
    });
  });

// ---------- Relatório de inadimplência detalhado (issue #115) ----------
// Multa/juros calculados até hoje com a MESMA fórmula da procedure
// calcular_multa_juros (também usada em baixar_faturas/BaixaDialog), só que
// inline numa única consulta em vez de 1 CALL + 1 SELECT por fatura vencida
// (até 1000 idas ao banco no pior caso, com até 500 inadimplentes). Inline
// em SQL — não em JS — porque usa o mesmo ROUND/DATEDIFF do MySQL, sem risco
// de arredondamento divergir por causa de diferença de ponto flutuante entre
// linguagens. Se a fórmula da procedure mudar, atualizar aqui também.

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
      // parametros_financeiros era um singleton global (pf.id = 1, CROSS JOIN).
      // Depois da 0092 é uma linha POR LOJA, e uma Loja recém-criada só ganha a
      // dela quando alguém salva a tela de parâmetros — com CROSS JOIN o
      // relatório inteiro sairia vazio nesse meio-tempo, escondendo justamente
      // os inadimplentes. Com LEFT JOIN as faturas continuam aparecendo e
      // multa/juros ficam zerados, que é a leitura certa de "sem multa e juros
      // configurados".
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, irmao_id, valor, data_vencimento, descricao, nome_civil, nome_simbolico,
                dias_atraso,
                IF(dias_atraso > 0 AND multa_ativa, ROUND(valor * multa_percentual / 100, 2), 0)
                  AS valor_multa,
                IF(dias_atraso > 0 AND juros_ativo,
                   ROUND(valor * juros_diario_percentual / 100 * dias_atraso, 2), 0) AS valor_juros
         FROM (
           SELECT l.id, l.irmao_id, (l.valor - l.valor_pago) AS valor, l.data_vencimento, l.descricao,
                  i.nome_civil, i.nome_simbolico,
                  GREATEST(0, DATEDIFF(?, l.data_vencimento)) AS dias_atraso,
                  pf.multa_ativa, pf.multa_percentual, pf.juros_ativo, pf.juros_diario_percentual
           FROM lancamentos l
           JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
           LEFT JOIN parametros_financeiros pf ON pf.loja_id = l.loja_id
           WHERE l.loja_id = @current_loja_id
             AND l.tipo = 'entrada' AND l.pago = FALSE AND l.data_vencimento < ?
           ORDER BY l.data_vencimento
           LIMIT 500
         ) t`,
        [hoje, hoje],
      );

      return rows.map((r): ItemInadimplenciaDetalhado => ({
        id: r.id,
        irmao_id: r.irmao_id,
        nome_civil: r.nome_civil,
        nome_simbolico: r.nome_simbolico,
        descricao: r.descricao,
        data_vencimento: r.data_vencimento,
        dias_atraso: Number(r.dias_atraso),
        valor_original: Number(r.valor),
        valor_multa: Number(r.valor_multa),
        valor_juros: Number(r.valor_juros),
        valor_total: Number(r.valor) + Number(r.valor_multa) + Number(r.valor_juros),
      }));
    });
  },
);

// ---------- Extrato Bancário (issue #142) ----------
// Extrato tradicional de UMA conta financeira, com saldo corrente
// (acumulado a partir do saldo_inicial). O saldo corrente sempre reflete o
// caixa real da conta — só considera lançamentos pago=TRUE (faturas em
// aberto não entram, decisão explícita do cliente) — e é calculado sobre
// TODO o histórico da conta até "ate" (ou hoje, sem "ate"), pra não ficar
// errado quando o usuário aplica um filtro de "de"/tipo/categoria: o filtro
// só decide QUAIS linhas aparecem na lista, nunca recalcula o saldo a
// partir de um subconjunto (isso daria um saldo corrente fictício,
// diferente do saldo real do banco).
// A data exibida/ordenadora é data_pagamento (quando é fatura emitida numa
// data e paga só em outra) — é a data em que o dinheiro de fato
// entrou/saiu, que é o que um extrato bancário mostra (issue #196).

export type FaturaExtratoBancario = { id: string; descricao: string; valor: number };

export type ItemExtratoBancario = {
  id: string;
  data: string;
  descricao: string;
  tipo: "entrada" | "saida" | "transferencia";
  categoria_recebimento: string | null;
  irmao_nome: string | null;
  plano_conta_nome: string | null;
  valor_sinal: number;
  saldo_corrente: number;
  // Só preenchido no modo "creditado": a(s) fatura(s) quitada(s) por esse
  // pagamento — um recibo ou uma conciliação em lote pode fechar várias de
  // uma vez (issue do usuário: extrato deve bater com o extrato do banco
  // de verdade, não com o valor de face de cada fatura).
  faturas: FaturaExtratoBancario[] | null;
};

const filtroExtratoBancarioSchema = z.object({
  contaId: z.string().uuid(),
  de: z.string().nullable(),
  ate: z.string().nullable(),
  tipo: z.enum(["entrada", "saida", "transferencia"]).nullable(),
  categoria: z.string().nullable(),
  irmaoId: z.string().uuid().nullable(),
  // "compensado" (padrão histórico): uma linha por fatura, com o valor de
  // face dela — bate com "quais faturas foram quitadas", não com o
  // extrato real do banco quando há multa/juros/desconto ou um pagamento
  // único quitando várias faturas juntas. "creditado": uma linha por
  // evento real de caixa (recibo, conciliação em lote, ou lançamento
  // avulso/legado), com o valor que de fato entrou/saiu da conta — bate
  // com o extrato do banco.
  modo: z.enum(["compensado", "creditado"]),
});

type LinhaBrutaExtratoBancario = {
  id: string;
  data: string;
  criado_em: unknown;
  descricao: string;
  tipo: "entrada" | "saida" | "transferencia";
  categoria_recebimento: string | null;
  irmao_nome: string | null;
  irmao_ids: string | null;
  plano_conta_nome: string | null;
  valor_sinal: number | string;
  saldo_corrente: number | string;
};

export const relatorioExtratoBancario = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtroExtratoBancarioSchema.parse(d))
  .handler(async ({ data }): Promise<ItemExtratoBancario[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (conn) => {
      if (data.modo === "compensado") return relatorioExtratoBancarioCompensado(conn, data);
      return relatorioExtratoBancarioCreditado(conn, data);
    });
  });

type FiltroExtratoBancario = z.infer<typeof filtroExtratoBancarioSchema>;

async function relatorioExtratoBancarioCompensado(
  conn: PoolConnection,
  data: FiltroExtratoBancario,
): Promise<ItemExtratoBancario[]> {
  const movimentosSql = `SELECT l.id, COALESCE(l.data_pagamento, l.data) AS data, l.criado_em, l.descricao, l.tipo,
              l.categoria_recebimento, i.nome_civil AS irmao_nome, l.irmao_id AS irmao_ids,
              pc.nome AS plano_conta_nome,
              CASE
                WHEN l.conta_destino_id = ? THEN l.valor
                WHEN l.tipo = 'entrada' THEN l.valor
                ELSE -l.valor
              END AS valor_sinal
       FROM lancamentos l
       LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
       LEFT JOIN plano_contas pc ON pc.id = l.plano_conta_id AND pc.loja_id = l.loja_id
       WHERE l.loja_id = @current_loja_id
         AND l.pago = TRUE AND (l.conta_id = ? OR l.conta_destino_id = ?)`;
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, data, criado_em, descricao, tipo, categoria_recebimento, irmao_nome, irmao_ids,
            plano_conta_nome, valor_sinal,
            (SELECT saldo_inicial FROM contas_financeiras
              WHERE id = ? AND loja_id = @current_loja_id)
              + SUM(valor_sinal) OVER (ORDER BY data, criado_em, id) AS saldo_corrente
     FROM (${movimentosSql}) movimentos
     WHERE ? IS NULL OR data <= ?
     ORDER BY data, criado_em, id`,
    [data.contaId, data.contaId, data.contaId, data.contaId, data.ate, data.ate],
  );
  return filtrarOrdenarExtratoBancario(rows as LinhaBrutaExtratoBancario[], data, null);
}

// "creditado": issue do usuário — deve ser uma "cópia do extrato bancário"
// (comparado com o extrato real do Sicoob), com a relação com fatura/irmão
// mostrada por cima, não no lugar. Duas fontes SEM relação de banco (recibo:
// pode ser dinheiro; avulso: lançamento pago sem nenhum vínculo de OFX,
// caso legado/manual) continuam vindo prontas do SQL. TODO o resto — cada
// linha de `ofx_lancamentos` da conta, sempre, mesmo sem lançamento
// correspondente (tarifa, boleto pago direto, linha ainda não conciliada)
// — é montado em JS a partir de uma única leitura de todas as linhas do
// extrato importado, porque ela cobre 4 casos, só 2 dos quais dá pra
// resolver com um JOIN direto:
//   - legado (o.lancamento_id set, sem lote): 1 lançamento certo.
//   - lote (o.conciliacao_id set, issue #110): N:M sem par gravado — usa
//     parearLotePorOrdem pra reconstruir, mesmo motivo/lógica da correção
//     em relatorioExtratoConciliacao/relatorioExtratoIrmao.
//   - anulação (issue de usuário — lançamento indevido estornado): é um
//     movimento bancário real (entrou e saiu), mas sem fatura nenhuma.
//   - sem vínculo (linha nunca conciliada): idem, sem fatura.
// `descricao` para linhas de OFX é sempre o texto cru do banco (o.descricao)
// — é isso que faz o relatório bater com o extrato real; a fatura/irmão
// aparecem à parte, em `faturas`/`irmao_nome`, nunca substituindo o texto
// do banco. Como as linhas de OFX não vêm da mesma query que recibo/avulso,
// o saldo corrente é somado aqui em JS sobre o conjunto completo.
async function relatorioExtratoBancarioCreditado(
  conn: PoolConnection,
  data: FiltroExtratoBancario,
): Promise<ItemExtratoBancario[]> {
  const [reciboRowsBase] = await conn.query<RowDataPacket[]>(
    `SELECT r.id, r.data AS data, r.criado_em,
            CASE WHEN COUNT(*) = 1 THEN MAX(l.descricao)
                 ELSE CONCAT(COUNT(*), ' fatura(s) quitada(s)') END AS descricao,
            'entrada' AS tipo,
            CASE WHEN COUNT(DISTINCT l.categoria_recebimento) = 1 THEN MAX(l.categoria_recebimento) END AS categoria_recebimento,
            MAX(i.nome_civil) AS irmao_nome, GROUP_CONCAT(DISTINCT l.irmao_id) AS irmao_ids,
            NULL AS plano_conta_nome, r.valor_total AS valor_sinal
     FROM recibos r
     JOIN recibo_itens ri ON ri.recibo_id = r.id AND ri.loja_id = r.loja_id
     JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
     LEFT JOIN irmaos i ON i.id = r.irmao_id AND i.loja_id = r.loja_id
     WHERE r.loja_id = @current_loja_id AND r.conta_financeira_id = ?
     GROUP BY r.id, r.data, r.criado_em, r.valor_total`,
    [data.contaId],
  );

  const [avulsoRowsBase] = await conn.query<RowDataPacket[]>(
    `SELECT l.id, COALESCE(l.data_pagamento, l.data) AS data, l.criado_em, l.descricao, l.tipo,
            l.categoria_recebimento, i.nome_civil AS irmao_nome, l.irmao_id AS irmao_ids,
            pc.nome AS plano_conta_nome,
            CASE
              WHEN l.conta_destino_id = ? THEN l.valor
              WHEN l.tipo = 'entrada' THEN l.valor
              ELSE -l.valor
            END AS valor_sinal
     FROM lancamentos l
     LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
     LEFT JOIN plano_contas pc ON pc.id = l.plano_conta_id AND pc.loja_id = l.loja_id
     WHERE l.loja_id = @current_loja_id
       AND l.pago = TRUE
       AND (l.conta_id = ? OR l.conta_destino_id = ?)
       AND NOT EXISTS (SELECT 1 FROM recibo_itens ri WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id)
       AND NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id AND co.status = 'ativa' WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id)
       AND NOT EXISTS (
         SELECT 1 FROM ofx_lancamentos o
          WHERE o.lancamento_id = l.id AND o.loja_id = l.loja_id AND o.conciliacao_id IS NULL
       )`,
    [data.contaId, data.contaId, data.contaId],
  );

  const linhasBase: LinhaBrutaExtratoBancario[] = [...reciboRowsBase, ...avulsoRowsBase].map(
    (r) => ({
      id: r.id,
      data: String(r.data),
      criado_em: r.criado_em,
      descricao: r.descricao,
      tipo: r.tipo,
      categoria_recebimento: r.categoria_recebimento,
      irmao_nome: r.irmao_nome,
      irmao_ids: r.irmao_ids,
      plano_conta_nome: r.plano_conta_nome,
      valor_sinal: r.valor_sinal,
      saldo_corrente: 0,
    }),
  );

  const [reciboFaturaRows] = await conn.query<RowDataPacket[]>(
    `SELECT r.id AS recibo_id, l.id, l.descricao,
            (ri.valor_original + ri.valor_multa + ri.valor_juros) AS valor
     FROM recibos r
     JOIN recibo_itens ri ON ri.recibo_id = r.id AND ri.loja_id = r.loja_id
     JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
     WHERE r.loja_id = @current_loja_id AND r.conta_financeira_id = ?`,
    [data.contaId],
  );
  const faturasPorRecibo = agruparFaturas(reciboFaturaRows, "recibo_id");

  // Toda linha importada do extrato desta conta — sem nenhuma condição de
  // status, é isso que faz virar "cópia do extrato bancário" (achado do
  // usuário, comparado com o extrato real do Sicoob).
  const [ofxRows] = await conn.query<RowDataPacket[]>(
    `SELECT o.id, o.data, o.importado_em AS criado_em, o.valor, o.descricao,
            o.lancamento_id, o.conciliacao_id
     FROM ofx_lancamentos o
     WHERE o.loja_id = @current_loja_id AND o.conta_financeira_id = ?`,
    [data.contaId],
  );

  const idsLegado = [
    ...new Set(
      ofxRows
        .filter((o) => o.lancamento_id && !o.conciliacao_id)
        .map((o) => o.lancamento_id as string),
    ),
  ];
  const legadoMap = new Map<string, RowDataPacket>();
  if (idsLegado.length > 0) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT l.id, l.descricao, l.categoria_recebimento, l.irmao_id, i.nome_civil AS irmao_nome, l.valor
       FROM lancamentos l LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
       WHERE l.id IN (?) AND l.loja_id = @current_loja_id`,
      [idsLegado],
    );
    for (const r of rows) legadoMap.set(r.id, r);
  }

  const idsConciliacao = [
    ...new Set(ofxRows.filter((o) => o.conciliacao_id).map((o) => o.conciliacao_id as string)),
  ];
  const lancPorConciliacao = new Map<string, RowDataPacket[]>();
  if (idsConciliacao.length > 0) {
    const [lancDoLote] = await conn.query<RowDataPacket[]>(
      `SELECT cl.conciliacao_id, l.id, l.descricao, cl.valor_aplicado AS valor,
              l.categoria_recebimento, l.irmao_id, i.nome_civil AS irmao_nome,
              COALESCE(l.data_vencimento, l.data) AS ordenacao
       FROM conciliacao_lancamentos cl
       JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = cl.loja_id
       LEFT JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = l.loja_id
       WHERE cl.conciliacao_id IN (?) AND cl.loja_id = @current_loja_id`,
      [idsConciliacao],
    );
    for (const l of lancDoLote) {
      const lista = lancPorConciliacao.get(l.conciliacao_id) ?? [];
      lista.push(l);
      lancPorConciliacao.set(l.conciliacao_id, lista);
    }
  }
  const ofxPorConciliacao = new Map<string, RowDataPacket[]>();
  for (const o of ofxRows) {
    if (!o.conciliacao_id) continue;
    const lista = ofxPorConciliacao.get(o.conciliacao_id) ?? [];
    lista.push(o);
    ofxPorConciliacao.set(o.conciliacao_id, lista);
  }
  const paresPorConciliacao = new Map<string, Map<string, string> | null>();
  for (const conciliacaoId of idsConciliacao) {
    const ofxDoEvento = ofxPorConciliacao.get(conciliacaoId) ?? [];
    const lancDoEvento = lancPorConciliacao.get(conciliacaoId) ?? [];
    paresPorConciliacao.set(
      conciliacaoId,
      ofxDoEvento.length > 1
        ? parearLotePorOrdem(
            ofxDoEvento.map((o) => ({ id: o.id, data: String(o.data), valor: Number(o.valor) })),
            lancDoEvento.map((l) => ({
              id: l.id,
              ordenacao: String(l.ordenacao),
              valor: Number(l.valor),
            })),
          )
        : null,
    );
  }

  const linhasOfx: LinhaBrutaExtratoBancario[] = [];
  const faturasPorOfxId = new Map<string, FaturaExtratoBancario[]>();
  for (const o of ofxRows) {
    type Ligado = {
      id: string;
      descricao: string;
      valor: number;
      categoria_recebimento: string | null;
      irmao_id: string | null;
      irmao_nome: string | null;
    };
    let ligados: Ligado[] = [];
    if (o.lancamento_id && !o.conciliacao_id) {
      const l = legadoMap.get(o.lancamento_id);
      if (l) ligados = [l as Ligado];
    } else if (o.conciliacao_id) {
      const lancDoEvento = lancPorConciliacao.get(o.conciliacao_id) ?? [];
      const ofxDoEvento = ofxPorConciliacao.get(o.conciliacao_id) ?? [];
      const pares = paresPorConciliacao.get(o.conciliacao_id) ?? null;
      ligados = (
        ofxDoEvento.length <= 1
          ? lancDoEvento
          : lancDoEvento.filter((l) => l.id === pares?.get(o.id))
      ) as Ligado[];
    }

    const categorias = new Set(ligados.map((l) => l.categoria_recebimento).filter(Boolean));
    const irmaosUnicos = new Set(ligados.map((l) => l.irmao_id).filter(Boolean));
    const nomeIrmaoUnico =
      irmaosUnicos.size === 1 ? (ligados.find((l) => l.irmao_id)?.irmao_nome ?? null) : null;

    linhasOfx.push({
      id: o.id,
      data: String(o.data),
      criado_em: o.criado_em,
      descricao: o.descricao || "(sem descrição do banco)",
      tipo: Number(o.valor) >= 0 ? "entrada" : "saida",
      categoria_recebimento: categorias.size === 1 ? String([...categorias][0]) : null,
      irmao_nome: nomeIrmaoUnico,
      irmao_ids: [...irmaosUnicos].join(","),
      plano_conta_nome: null,
      valor_sinal: Number(o.valor),
      saldo_corrente: 0,
    });
    if (ligados.length > 0) {
      faturasPorOfxId.set(
        o.id,
        ligados.map((l) => ({ id: l.id, descricao: l.descricao, valor: Number(l.valor) })),
      );
    }
  }

  const [[contaRow]] = await conn.query<RowDataPacket[]>(
    "SELECT saldo_inicial FROM contas_financeiras WHERE id = ? AND loja_id = @current_loja_id",
    [data.contaId],
  );
  const saldoInicial = contaRow ? Number(contaRow.saldo_inicial) : 0;

  const todasLinhas = [...linhasBase, ...linhasOfx].sort(
    (a, b) =>
      String(a.data).localeCompare(String(b.data)) ||
      String(a.criado_em ?? "").localeCompare(String(b.criado_em ?? "")) ||
      a.id.localeCompare(b.id),
  );
  let acumulado = saldoInicial;
  for (const linha of todasLinhas) {
    acumulado += Number(linha.valor_sinal);
    linha.saldo_corrente = acumulado;
  }
  const linhasNoPeriodo = data.ate
    ? todasLinhas.filter((l) => String(l.data) <= data.ate!)
    : todasLinhas;

  return filtrarOrdenarExtratoBancario(linhasNoPeriodo, data, {
    faturasPorRecibo,
    faturasPorLote: faturasPorOfxId,
  });
}

function filtrarOrdenarExtratoBancario(
  linhas: LinhaBrutaExtratoBancario[],
  data: FiltroExtratoBancario,
  faturas: {
    faturasPorRecibo: Map<string, FaturaExtratoBancario[]>;
    faturasPorLote: Map<string, FaturaExtratoBancario[]>;
  } | null,
): ItemExtratoBancario[] {
  return linhas
    .filter((r) => !data.de || r.data >= data.de)
    .filter((r) => !data.tipo || r.tipo === data.tipo)
    .filter((r) => !data.categoria || r.categoria_recebimento === data.categoria)
    .filter((r) => !data.irmaoId || (r.irmao_ids ?? "").split(",").includes(data.irmaoId!))
    .map((r) => ({
      id: r.id,
      data: r.data,
      descricao: r.descricao,
      tipo: r.tipo,
      categoria_recebimento: r.categoria_recebimento,
      irmao_nome: r.irmao_nome,
      plano_conta_nome: r.plano_conta_nome,
      valor_sinal: Number(r.valor_sinal),
      saldo_corrente: Number(r.saldo_corrente),
      faturas: !faturas
        ? null
        : (faturas.faturasPorRecibo.get(r.id) ??
          faturas.faturasPorLote.get(r.id) ?? [
            { id: r.id, descricao: r.descricao, valor: Math.abs(Number(r.valor_sinal)) },
          ]),
    }));
}

function agruparFaturas(
  rows: RowDataPacket[],
  chave: "recibo_id",
): Map<string, FaturaExtratoBancario[]> {
  const mapa = new Map<string, FaturaExtratoBancario[]>();
  for (const r of rows) {
    const lista = mapa.get(r[chave]) ?? [];
    lista.push({ id: r.id, descricao: r.descricao, valor: Number(r.valor) });
    mapa.set(r[chave], lista);
  }
  return mapa;
}

const gerarCobrancaLoteSchema = z.object({ lancamentoIds: z.array(z.string().uuid()).min(1) });

export const gerarCobrancaLote = createServerFn({ method: "POST" })
  .validator((d: unknown) => gerarCobrancaLoteSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string; sucesso: boolean }[]> => {
    return comPapel(PAPEIS_TESOURARIA, async (_conn, _usuarioId, lojaId) => {
      const { enviarCobrancaManual } = await import("../email-dispatch");
      const resultados: { id: string; sucesso: boolean }[] = [];
      for (const id of data.lancamentoIds) {
        resultados.push({ id, sucesso: await enviarCobrancaManual(id, lojaId) });
      }
      return resultados;
    });
  });
