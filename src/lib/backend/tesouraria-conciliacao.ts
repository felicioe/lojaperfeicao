import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// RLS original: SELECT admin/tesoureiro. Sem policy de escrita: a
// importação roda nesta própria rota server-side; a conciliação roda
// pelas stored procedures (conciliar_ofx_existente/criar_lancamento_de_ofx).
const PAPEIS = ["admin", "tesoureiro"];

export type LancamentoConciliacao = {
  id: string;
  data: string;
  data_vencimento: string | null;
  descricao: string;
  irmao_nome: string | null;
  valor: number;
  valor_pago: number;
  tipo: string;
};

// Lançamentos em aberto (faturas/contas a pagar ainda não baixadas) nunca
// têm conta_id preenchido — só é gravado no momento da baixa — então não
// dá pra filtrar por conta bancária aqui como se fazia antes (o que
// deixava esta lista sempre vazia). Qualquer conta em aberto pode ser
// paga em qualquer uma das contas bancárias da loja, daí mostrar todas.
// O nome do irmão entra junto na descrição pra facilitar bater o nome de
// quem pagou (extrato) com a fatura correspondente (sistema); também vem
// separado (irmao_nome) e com data_vencimento pra alimentar a sugestão
// automática por depositante da tela (issue #123).
export const listarLancamentosParaConciliar = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async (): Promise<LancamentoConciliacao[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.data, l.data_vencimento,
                CASE WHEN i.nome_civil IS NOT NULL THEN CONCAT(l.descricao, ' — ', i.nome_civil) ELSE l.descricao END AS descricao,
                i.nome_civil AS irmao_nome,
                l.valor, l.valor_pago, l.tipo
         FROM lancamentos l
         LEFT JOIN irmaos i ON i.id = l.irmao_id
         WHERE l.pago = FALSE AND l.tipo IN ('entrada', 'saida')
         ORDER BY l.data_vencimento IS NULL, l.data_vencimento, l.data
         LIMIT 300`,
      );
      return rows as LancamentoConciliacao[];
    });
  });

export type OfxLancamento = {
  id: string;
  data: string;
  valor: number;
  tipo_ofx: string | null;
  descricao: string | null;
  conciliado: boolean;
};

export const listarOfxPendentes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OfxLancamento[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT o.id, o.data, o.valor, o.tipo_ofx, o.descricao,
                (o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
                  SELECT 1 FROM conciliacoes c
                  WHERE c.id = o.conciliacao_id AND c.status = 'ativa'
                )) AS conciliado
         FROM ofx_lancamentos o
         WHERE o.conta_financeira_id = ?
           AND NOT (o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
             SELECT 1 FROM conciliacoes c
             WHERE c.id = o.conciliacao_id AND c.status = 'ativa'
           ))
         ORDER BY o.data`,
        [data.contaId],
      );
      return rows as OfxLancamento[];
    });
  });

export type OfxConferencia = OfxLancamento & {
  vinculos: string | null;
  conciliacao_id: string | null;
};

export const listarOfxConferencia = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OfxConferencia[]> => {
    return comPapel(PAPEIS, async (conn) => {
      let periodo: RowDataPacket | undefined;
      try {
        const [extratos] = await conn.query<RowDataPacket[]>(
          `SELECT data_inicial, data_final FROM ofx_extratos
           WHERE conta_financeira_id = ? ORDER BY importado_em DESC, id DESC LIMIT 1`,
          [data.contaId],
        );
        periodo = extratos[0];
      } catch (erro) {
        if ((erro as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw erro;
      }
      const periodoSql = periodo ? "AND o.data BETWEEN ? AND ?" : "";
      const periodoParams = periodo ? [periodo.data_inicial, periodo.data_final] : [];
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT o.id, o.data, o.valor, o.tipo_ofx, o.descricao,
                (o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
                  SELECT 1 FROM conciliacoes c
                  WHERE c.id = o.conciliacao_id AND c.status = 'ativa'
                )) AS conciliado,
                o.conciliacao_id,
                COALESCE(
                  GROUP_CONCAT(DISTINCT CONCAT(l_lote.descricao, ' — R$ ',
                    CAST(cl.valor_aplicado AS CHAR)) SEPARATOR '; '),
                  l_direto.descricao
                ) AS vinculos
         FROM ofx_lancamentos o
         LEFT JOIN conciliacao_lancamentos cl ON cl.conciliacao_id = o.conciliacao_id
         LEFT JOIN lancamentos l_lote ON l_lote.id = cl.lancamento_id
         LEFT JOIN lancamentos l_direto ON l_direto.id = o.lancamento_id
         WHERE o.conta_financeira_id = ? ${periodoSql}
         GROUP BY o.id, o.data, o.valor, o.tipo_ofx, o.descricao, o.conciliado,
                  o.conciliacao_id, l_direto.descricao
         ORDER BY o.data DESC, o.importado_em DESC LIMIT 500`,
        [data.contaId, ...periodoParams],
      );
      return rows as OfxConferencia[];
    });
  });

export type ResumoConciliacaoOfx = {
  dataInicial: string | null;
  dataFinal: string | null;
  saldoInicialBanco: number | null;
  saldoFinalBanco: number | null;
  saldoSistema: number | null;
  entradas: number;
  saidas: number;
  totalMovimentado: number;
  valorConciliado: number;
  valorPendente: number;
  itensConciliados: number;
  itensPendentes: number;
  valorFinanceiroSemOfx: number;
  itensFinanceirosSemOfx: number;
  diferencaBancoSistema: number | null;
};

export const obterResumoConciliacaoOfx = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ResumoConciliacaoOfx> => {
    return comPapel(PAPEIS, async (conn) => {
      let extrato: RowDataPacket | undefined;
      try {
        const [extratos] = await conn.query<RowDataPacket[]>(
          `SELECT data_inicial, data_final, saldo_inicial, saldo_final
           FROM ofx_extratos WHERE conta_financeira_id = ?
           ORDER BY importado_em DESC, id DESC LIMIT 1`,
          [data.contaId],
        );
        extrato = extratos[0];
      } catch (erro) {
        if ((erro as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw erro;
      }

      const periodoSql = extrato ? "AND o.data BETWEEN ? AND ?" : "";
      const periodoParams = extrato ? [extrato.data_inicial, extrato.data_final] : [];
      const [[movimentos]] = await conn.query<RowDataPacket[]>(
        `SELECT
           COALESCE(SUM(CASE WHEN o.valor > 0 THEN o.valor ELSE 0 END), 0) AS entradas,
           COALESCE(SUM(CASE WHEN o.valor < 0 THEN ABS(o.valor) ELSE 0 END), 0) AS saidas,
           COALESCE(SUM(ABS(o.valor)), 0) AS total_movimentado,
           COALESCE(SUM(CASE WHEN o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
             SELECT 1 FROM conciliacoes c WHERE c.id = o.conciliacao_id AND c.status = 'ativa'
           ) THEN ABS(o.valor) ELSE 0 END), 0) AS valor_conciliado,
           COALESCE(SUM(CASE WHEN NOT (o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
             SELECT 1 FROM conciliacoes c WHERE c.id = o.conciliacao_id AND c.status = 'ativa'
           )) THEN ABS(o.valor) ELSE 0 END), 0) AS valor_pendente,
           SUM(CASE WHEN o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
             SELECT 1 FROM conciliacoes c WHERE c.id = o.conciliacao_id AND c.status = 'ativa'
           ) THEN 1 ELSE 0 END) AS itens_conciliados,
           SUM(CASE WHEN NOT (o.conciliado OR o.lancamento_id IS NOT NULL OR EXISTS (
             SELECT 1 FROM conciliacoes c WHERE c.id = o.conciliacao_id AND c.status = 'ativa'
           )) THEN 1 ELSE 0 END) AS itens_pendentes,
           MIN(o.data) AS data_inicial, MAX(o.data) AS data_final
         FROM ofx_lancamentos o
         WHERE o.conta_financeira_id = ? ${periodoSql}`,
        [data.contaId, ...periodoParams],
      );
      const [saldos] = await conn.query<RowDataPacket[]>(
        "SELECT saldo_atual FROM v_saldo_contas WHERE id = ? LIMIT 1",
        [data.contaId],
      );
      const paramsFinanceiro: unknown[] = [data.contaId];
      const periodoFinanceiro = extrato ? "AND l.data_pagamento BETWEEN ? AND ?" : "";
      if (extrato) paramsFinanceiro.push(extrato.data_inicial, extrato.data_final);
      const [[financeiroSemOfx]] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(l.valor_pago), 0) AS valor, COUNT(*) AS itens
         FROM lancamentos l
         WHERE l.conta_id = ? AND l.pago = TRUE ${periodoFinanceiro}
           AND NOT EXISTS (
             SELECT 1 FROM ofx_lancamentos o
             WHERE o.lancamento_id = l.id
                OR (o.conciliacao_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM conciliacao_lancamentos cl
                  WHERE cl.conciliacao_id = o.conciliacao_id AND cl.lancamento_id = l.id
                ))
           )`,
        paramsFinanceiro,
      );
      const saldoSistema = saldos[0] ? Number(saldos[0].saldo_atual) : null;
      const saldoFinalBanco = extrato?.saldo_final == null ? null : Number(extrato.saldo_final);

      return {
        dataInicial: extrato?.data_inicial ?? movimentos.data_inicial ?? null,
        dataFinal: extrato?.data_final ?? movimentos.data_final ?? null,
        saldoInicialBanco: extrato?.saldo_inicial == null ? null : Number(extrato.saldo_inicial),
        saldoFinalBanco,
        saldoSistema,
        entradas: Number(movimentos.entradas),
        saidas: Number(movimentos.saidas),
        totalMovimentado: Number(movimentos.total_movimentado),
        valorConciliado: Number(movimentos.valor_conciliado),
        valorPendente: Number(movimentos.valor_pendente),
        itensConciliados: Number(movimentos.itens_conciliados),
        itensPendentes: Number(movimentos.itens_pendentes),
        valorFinanceiroSemOfx: Number(financeiroSemOfx.valor),
        itensFinanceirosSemOfx: Number(financeiroSemOfx.itens),
        diferencaBancoSistema:
          saldoFinalBanco == null || saldoSistema == null
            ? null
            : Math.round((saldoFinalBanco - saldoSistema) * 100) / 100,
      };
    });
  });

export const conciliarOfxExistente = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ ofxId: z.string().uuid(), lancamentoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      try {
        const [[parcela]] = await conn.query<RowDataPacket[]>(
          `SELECT recorrente_id, valor_efetivo_confirmado FROM lancamentos WHERE id = ?`,
          [data.lancamentoId],
        );
        if (parcela?.recorrente_id && !parcela.valor_efetivo_confirmado) {
          throw new Error("Confirme o valor efetivo da despesa recorrente antes de conciliá-la.");
        }
      } catch (erro) {
        if ((erro as { code?: string }).code !== "ER_BAD_FIELD_ERROR") throw erro;
      }
      await conn.query("CALL conciliar_ofx_existente(?, ?)", [data.ofxId, data.lancamentoId]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "conciliar",
        "ofx_lancamento",
        data.ofxId,
        null,
        data,
      );
    });
  });

// Vincula N linhas do OFX a M lançamentos AINDA EM ABERTO, dando baixa
// neles de verdade (pago/conta/data + contrapartida contábil que fecha a
// provisão) — é o que a tela usa depois de marcar os ticks dos dois
// lados. `alocacao` traz quanto aplicar em cada lançamento (issue #131):
// pra baixa integral (comportamento de sempre) o valor de cada item é o
// saldo cheio da fatura; um valor menor é pagamento parcial (fica em
// aberto com saldo residual). O total de cada lado precisa bater
// exatamente; a validação real é feita dentro da procedure (não confia
// só na UI), aqui só repassa.
export const conciliarOfxLote = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        ofxIds: z.array(z.string().uuid()).min(1),
        alocacao: z
          .array(z.object({ lancamentoId: z.string().uuid(), valor: z.number().positive() }))
          .min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ conciliacaoId: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      try {
        const ids = data.alocacao.map((item) => item.lancamentoId);
        const [pendentes] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM lancamentos
           WHERE id IN (?) AND recorrente_id IS NOT NULL AND valor_efetivo_confirmado = FALSE`,
          [ids],
        );
        if (pendentes.length > 0) {
          throw new Error(
            "Confirme o valor efetivo das despesas recorrentes antes de conciliá-las.",
          );
        }
      } catch (erro) {
        if ((erro as { code?: string }).code !== "ER_BAD_FIELD_ERROR") throw erro;
      }
      await conn.query("CALL conciliar_ofx_lote(?, ?, @conciliacao_id)", [
        JSON.stringify(data.ofxIds),
        JSON.stringify(
          data.alocacao.map((a) => ({ lancamento_id: a.lancamentoId, valor: a.valor })),
        ),
      ]);
      const [[{ conciliacao_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @conciliacao_id AS conciliacao_id",
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "conciliar_lote",
        "conciliacao",
        conciliacao_id,
        null,
        data,
      );
      return { conciliacaoId: conciliacao_id };
    });
  });

// Desfaz um evento de conciliação (issue #124) — volta OFX/lançamentos
// pra pendente e estorna a contrapartida contábil. A validação real
// (já desfeita, período fechado, motivo obrigatório) é feita dentro da
// procedure; aqui só repassa e grava a auditoria.
export const desfazerConciliacao = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ conciliacaoId: z.string().uuid(), motivo: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn, usuarioId) => {
      await conn.query("CALL desfazer_conciliacao(?, ?)", [data.conciliacaoId, data.motivo]);
      await registrarAuditoria(
        conn,
        usuarioId,
        "desfazer_conciliacao",
        "conciliacao",
        data.conciliacaoId,
        null,
        { motivo: data.motivo },
      );
    });
  });

// Desfaz o vínculo "legado" de uma linha do OFX (issue de usuário — linhas
// conciliadas fora de um evento em lote, ex.: via criar_lancamento_de_ofx,
// não apareciam com opção de "Desfazer" no relatório porque não têm
// conciliacao_id). A validação de qual caso é (lançamento criado pela
// própria linha vs. só vinculado a um já existente) é feita dentro da
// procedure; aqui só repassa e grava a auditoria.
export const desfazerLancamentoOfx = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ ofxId: z.string().uuid(), motivo: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn, usuarioId) => {
      await conn.query("CALL desfazer_lancamento_ofx(?, ?)", [data.ofxId, data.motivo]);
      await registrarAuditoria(
        conn,
        usuarioId,
        "desfazer_lancamento_ofx",
        "ofx_lancamento",
        data.ofxId,
        null,
        { motivo: data.motivo },
      );
    });
  });

export type ConciliacaoRecente = {
  id: string;
  data_conciliacao: string;
  valor_total: number;
  criado_em: string;
};

// Lista os últimos eventos de conciliação ainda ativos (não desfeitos) de
// uma conta — alimenta o "Desfazer" direto na tela de Conciliação Bancária
// (issue #141), sem precisar ir até o relatório de Extrato da Conciliação
// pra corrigir um vínculo feito por engano.
export const listarConciliacoesRecentes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ConciliacaoRecente[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, data_conciliacao, valor_total, criado_em FROM conciliacoes
         WHERE conta_financeira_id = ? AND status = 'ativa'
         ORDER BY criado_em DESC LIMIT 20`,
        [data.contaId],
      );
      return rows as ConciliacaoRecente[];
    });
  });

const criarLancamentoOfxSchema = z.object({
  ofxId: z.string().uuid(),
  planoContaId: z.string().uuid(),
  categoria: z.enum(["mensalidade", "taxa_grau", "tronco", "doacao", "outros"]).nullable(),
  // Opcional (issue #136) — nem todo lançamento avulso tem um irmão
  // associado (ex.: tronco de solidariedade, que é institucional).
  irmaoId: z.string().uuid().nullable(),
  descricao: z.string().nullable(),
});

export const criarLancamentoDeOfx = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarLancamentoOfxSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      await conn.query("CALL criar_lancamento_de_ofx(?, ?, ?, ?, NULL, ?, @lanc_id)", [
        data.ofxId,
        data.planoContaId,
        data.categoria,
        data.irmaoId,
        data.descricao,
      ]);
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "criar_de_ofx",
        "lancamento",
        lanc_id,
        null,
        data,
      );
      return { id: lanc_id };
    });
  });

// Rateio (issue #137) — quando um único depósito junta mais de uma
// natureza (ex.: mensalidade + juros de atraso), desdobra a linha do OFX
// em N lançamentos, um por item, cada um com sua própria conta contábil,
// categoria e irmão (opcional). A soma dos itens precisa bater exatamente
// com o valor da linha — validado de verdade na procedure, não só na UI.
const rateioItemSchema = z.object({
  planoContaId: z.string().uuid(),
  categoria: z.enum(["mensalidade", "taxa_grau", "tronco", "doacao", "outros"]).nullable(),
  irmaoId: z.string().uuid().nullable(),
  valor: z.number().positive(),
  descricao: z.string().nullable(),
});

const criarLancamentosOfxRateadoSchema = z.object({
  ofxId: z.string().uuid(),
  itens: z.array(rateioItemSchema).min(2),
});

export const criarLancamentosDeOfxRateado = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarLancamentosOfxRateadoSchema.parse(d))
  .handler(async ({ data }): Promise<{ conciliacaoId: string }> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      await conn.query("CALL criar_lancamentos_de_ofx_rateado(?, ?, @conciliacao_id)", [
        data.ofxId,
        JSON.stringify(
          data.itens.map((i) => ({
            plano_conta_id: i.planoContaId,
            categoria: i.categoria,
            irmao_id: i.irmaoId,
            valor: i.valor,
            descricao: i.descricao,
          })),
        ),
      ]);
      const [[{ conciliacao_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @conciliacao_id AS conciliacao_id",
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "criar_de_ofx_rateado",
        "conciliacao",
        conciliacao_id,
        null,
        data,
      );
      return { conciliacaoId: conciliacao_id };
    });
  });

// ---------- Importação de extrato OFX ----------
// Porta 1:1 a lógica da antiga Edge Function "importar-ofx" (Deno) para
// Node: mesmo parser SGML manual (elementos-folha sem tag de fechamento),
// mesma detecção de encoding (bancos brasileiros costumam exportar em
// Windows-1252) e mesma chave de deduplicação composta.

function pontuarDecodificacao(texto: string): number {
  let pontos = 0;
  for (const ch of texto) {
    if (ch === "�") pontos += 10;
    const code = ch.codePointAt(0)!;
    if (code >= 0x80 && code <= 0x9f) pontos += 5;
  }
  return pontos;
}

function decodificarMelhorEsforco(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const win1252 = new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  return pontuarDecodificacao(utf8) <= pontuarDecodificacao(win1252) ? utf8 : win1252;
}

function extrairCampo(bloco: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : "";
}

function normalizarData(ofxDate: string): string | null {
  // Formato clássico OFX: YYYYMMDD[HHMMSS]. Alguns softwares (ex.: OFXMoney)
  // exportam em ISO 8601 com traços: YYYY-MM-DDTHH:MM:SSZ. O "-?" opcional
  // cobre os dois sem precisar de dois regexes.
  const m = ofxDate.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizarTexto(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

const importarOfxSchema = z.object({
  contaFinanceiraId: z.string().uuid(),
  arquivoBase64: z.string().min(1),
});

export type ResultadoImportacaoOfx = {
  total: number;
  novos: number;
  jaImportados: number;
  erros: string[];
};

export const importarOfx = createServerFn({ method: "POST" })
  .validator((d: unknown) => importarOfxSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoImportacaoOfx> => {
    return comPapel(PAPEIS, async (conn, usuarioId) => {
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(Buffer.from(data.arquivoBase64, "base64"));
      } catch {
        throw new Error("arquivo_base64 inválido");
      }

      const conteudo = decodificarMelhorEsforco(bytes);
      const blocos =
        conteudo.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>)/gi) ?? [];

      let novos = 0;
      let jaImportados = 0;
      const erros: string[] = [];

      // Fase 1 (sem ida ao banco): parseia e valida cada bloco, calculando a
      // chave de dedupe de todo mundo de uma vez — extratos têm 50 a 500+
      // transações, e essa fase é só processamento em memória.
      type LinhaOfx = {
        fitid: string;
        dataOfx: string;
        valor: number;
        trntype: string;
        descricao: string;
        chaveDedupe: string;
        assinaturaEstavel: string;
      };
      const linhas: LinhaOfx[] = [];
      for (const bloco of blocos) {
        const trnamt = extrairCampo(bloco, "TRNAMT");
        const dtposted = extrairCampo(bloco, "DTPOSTED");
        const fitid = extrairCampo(bloco, "FITID");
        const trntype = extrairCampo(bloco, "TRNTYPE");
        const nome = extrairCampo(bloco, "NAME") || extrairCampo(bloco, "PAYEE");
        const memo = extrairCampo(bloco, "MEMO");
        const descricao = [nome, memo].filter(Boolean).join(" - ") || "Lançamento importado";

        const valor = parseFloat(trnamt);
        const dataOfx = normalizarData(dtposted);
        if (isNaN(valor) || !dataOfx) {
          erros.push(`Linha com dados inválidos (valor="${trnamt}", data="${dtposted}")`);
          continue;
        }

        const chaveDedupe = [
          fitid || "",
          dataOfx,
          valor.toFixed(2),
          trntype,
          normalizarTexto(descricao),
        ].join("|");
        // Alguns bancos regeneram o FITID conforme a ordem das linhas no
        // arquivo. Ao baixar o mesmo período novamente, a mesma transação
        // pode receber outro FITID. Esta assinatura identifica o movimento
        // pelo conteúdo bancário estável e evita a duplicação sem impedir
        // duas transações realmente iguais no mesmo arquivo (contadas abaixo).
        const assinaturaEstavel = [
          dataOfx,
          valor.toFixed(2),
          trntype,
          normalizarTexto(descricao),
        ].join("|");
        linhas.push({
          fitid,
          dataOfx,
          valor,
          trntype,
          descricao,
          chaveDedupe,
          assinaturaEstavel,
        });
      }

      const saldoFinalLido = Number.parseFloat(extrairCampo(conteudo, "BALAMT"));
      const saldoFinal = Number.isFinite(saldoFinalLido) ? saldoFinalLido : null;
      const datas = linhas.map((linha) => linha.dataOfx).sort();
      const dataInicial = datas[0] ?? null;
      const dataFinal = normalizarData(extrairCampo(conteudo, "DTASOF")) ?? datas.at(-1) ?? null;
      const movimentoLiquido = linhas.reduce((total, linha) => total + linha.valor, 0);
      const saldoInicial = saldoFinal == null ? null : saldoFinal - movimentoLiquido;

      // Fase 2: uma única consulta pra saber quais chaves já existem pra essa
      // conta — evita descobrir "já importado" um a um via INSERT IGNORE.
      const chavesJaExistentes = new Set<string>();
      const quantidadesExistentes = new Map<string, number>();
      if (linhas.length > 0) {
        const [existentes] = await conn.query<RowDataPacket[]>(
          `SELECT chave_dedupe FROM ofx_lancamentos
           WHERE conta_financeira_id = ? AND chave_dedupe IN (?)`,
          [data.contaFinanceiraId, linhas.map((l) => l.chaveDedupe)],
        );
        for (const row of existentes) chavesJaExistentes.add(row.chave_dedupe as string);

        const [movimentosExistentes] = await conn.query<RowDataPacket[]>(
          `SELECT data, valor, tipo_ofx, descricao
           FROM ofx_lancamentos
           WHERE conta_financeira_id = ? AND data BETWEEN ? AND ?`,
          [data.contaFinanceiraId, datas[0], datas.at(-1)],
        );
        for (const row of movimentosExistentes) {
          const assinatura = [
            String(row.data),
            Number(row.valor).toFixed(2),
            String(row.tipo_ofx ?? ""),
            normalizarTexto(String(row.descricao ?? "")),
          ].join("|");
          quantidadesExistentes.set(assinatura, (quantidadesExistentes.get(assinatura) ?? 0) + 1);
        }
      }

      // Fase 3: separa o que é de fato novo (também dedupe contra
      // duplicatas dentro do próprio arquivo) e insere em lotes — cai pra
      // inserção linha a linha só se um lote inteiro falhar, pra isolar
      // qual linha específica tem o problema (mesma granularidade de erro
      // de antes).
      const vistasNoArquivo = new Set<string>();
      const ocorrenciasNoArquivo = new Map<string, number>();
      const paraInserir: LinhaOfx[] = [];
      for (const linha of linhas) {
        const ocorrencia = (ocorrenciasNoArquivo.get(linha.assinaturaEstavel) ?? 0) + 1;
        ocorrenciasNoArquivo.set(linha.assinaturaEstavel, ocorrencia);
        const jaExistePeloConteudo =
          (quantidadesExistentes.get(linha.assinaturaEstavel) ?? 0) >= ocorrencia;
        if (
          chavesJaExistentes.has(linha.chaveDedupe) ||
          vistasNoArquivo.has(linha.chaveDedupe) ||
          jaExistePeloConteudo
        ) {
          jaImportados++;
          continue;
        }
        vistasNoArquivo.add(linha.chaveDedupe);
        paraInserir.push(linha);
      }

      const TAMANHO_LOTE = 200;
      for (let i = 0; i < paraInserir.length; i += TAMANHO_LOTE) {
        const lote = paraInserir.slice(i, i + TAMANHO_LOTE);
        try {
          await conn.query(
            `INSERT IGNORE INTO ofx_lancamentos
               (conta_financeira_id, fitid, data, valor, tipo_ofx, descricao, chave_dedupe, importado_por)
             VALUES ?`,
            [
              lote.map((l) => [
                data.contaFinanceiraId,
                l.fitid || null,
                l.dataOfx,
                l.valor,
                l.trntype || null,
                l.descricao,
                l.chaveDedupe,
                usuarioId,
              ]),
            ],
          );
          novos += lote.length;
        } catch {
          // Lote inteiro falhou (ex.: dado que só o MySQL rejeita) — insere
          // linha a linha só esse lote, pra não perder o restante do
          // extrato e pra reportar exatamente qual transação deu erro.
          for (const l of lote) {
            try {
              await conn.query(
                `INSERT IGNORE INTO ofx_lancamentos
                   (conta_financeira_id, fitid, data, valor, tipo_ofx, descricao, chave_dedupe, importado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  data.contaFinanceiraId,
                  l.fitid || null,
                  l.dataOfx,
                  l.valor,
                  l.trntype || null,
                  l.descricao,
                  l.chaveDedupe,
                  usuarioId,
                ],
              );
              novos++;
            } catch (e) {
              erros.push(e instanceof Error ? e.message : String(e));
            }
          }
        }
      }

      if (dataInicial && dataFinal) {
        try {
          await conn.query(
            `INSERT INTO ofx_extratos
               (conta_financeira_id, data_inicial, data_final, saldo_inicial, saldo_final,
                total_entradas, total_saidas, quantidade_lancamentos, importado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.contaFinanceiraId,
              dataInicial,
              dataFinal,
              saldoInicial,
              saldoFinal,
              linhas.filter((linha) => linha.valor > 0).reduce((s, linha) => s + linha.valor, 0),
              linhas
                .filter((linha) => linha.valor < 0)
                .reduce((s, linha) => s + Math.abs(linha.valor), 0),
              linhas.length,
              usuarioId,
            ],
          );
        } catch (erro) {
          if ((erro as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw erro;
        }
      }

      return { total: blocos.length, novos, jaImportados, erros };
    });
  });
