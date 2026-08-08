import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { comPapel } from "./authz";

// RLS original: SELECT admin/tesoureiro. Sem policy de escrita: a
// importação roda nesta própria rota server-side; a conciliação roda
// pelas stored procedures (conciliar_ofx_existente/criar_lancamento_de_ofx).
const PAPEIS = ["admin", "tesoureiro"];

export type LancamentoConciliacao = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
};

// Lançamentos em aberto (faturas/contas a pagar ainda não baixadas) nunca
// têm conta_id preenchido — só é gravado no momento da baixa — então não
// dá pra filtrar por conta bancária aqui como se fazia antes (o que
// deixava esta lista sempre vazia). Qualquer conta em aberto pode ser
// paga em qualquer uma das contas bancárias da loja, daí mostrar todas.
// O nome do irmão entra junto na descrição pra facilitar bater o nome de
// quem pagou (extrato) com a fatura correspondente (sistema).
export const listarLancamentosParaConciliar = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async (): Promise<LancamentoConciliacao[]> => {
    return comPapel(PAPEIS, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.data,
                CASE WHEN i.nome_civil IS NOT NULL THEN CONCAT(l.descricao, ' — ', i.nome_civil) ELSE l.descricao END AS descricao,
                l.valor, l.tipo
         FROM lancamentos l
         LEFT JOIN irmaos i ON i.id = l.irmao_id
         WHERE l.pago = FALSE AND l.tipo IN ('entrada', 'saida')
         ORDER BY l.data
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
        `SELECT id, data, valor, tipo_ofx, descricao, conciliado FROM ofx_lancamentos
         WHERE conta_financeira_id = ? AND conciliado = FALSE ORDER BY data`,
        [data.contaId],
      );
      return rows as OfxLancamento[];
    });
  });

export const conciliarOfxExistente = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ ofxId: z.string().uuid(), lancamentoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL conciliar_ofx_existente(?, ?)", [data.ofxId, data.lancamentoId]);
    });
  });

// Vincula N linhas do OFX a M lançamentos AINDA EM ABERTO, dando baixa
// neles de verdade (pago/conta/data + contrapartida contábil que fecha a
// provisão) — é o que a tela usa depois de marcar os ticks dos dois
// lados. O total de cada lado precisa bater exatamente; a validação real
// é feita dentro da procedure (não confia só na UI), aqui só repassa.
export const conciliarOfxLote = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        ofxIds: z.array(z.string().uuid()).min(1),
        lancamentoIds: z.array(z.string().uuid()).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ conciliacaoId: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL conciliar_ofx_lote(?, ?, @conciliacao_id)", [
        JSON.stringify(data.ofxIds),
        JSON.stringify(data.lancamentoIds),
      ]);
      const [[{ conciliacao_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @conciliacao_id AS conciliacao_id",
      );
      return { conciliacaoId: conciliacao_id };
    });
  });

const criarLancamentoOfxSchema = z.object({
  ofxId: z.string().uuid(),
  planoContaId: z.string().uuid(),
  categoria: z.enum(["mensalidade", "taxa_grau", "tronco", "doacao", "outros"]).nullable(),
  descricao: z.string().nullable(),
});

export const criarLancamentoDeOfx = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarLancamentoOfxSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS, async (conn) => {
      await conn.query("CALL criar_lancamento_de_ofx(?, ?, ?, NULL, NULL, ?, @lanc_id)", [
        data.ofxId,
        data.planoContaId,
        data.categoria,
        data.descricao,
      ]);
      const [[{ lanc_id }]] = await conn.query<RowDataPacket[]>("SELECT @lanc_id AS lanc_id");
      return { id: lanc_id };
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

        try {
          const [result] = await conn.query<ResultSetHeader>(
            `INSERT IGNORE INTO ofx_lancamentos
               (conta_financeira_id, fitid, data, valor, tipo_ofx, descricao, chave_dedupe, importado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.contaFinanceiraId,
              fitid || null,
              dataOfx,
              valor,
              trntype || null,
              descricao,
              chaveDedupe,
              usuarioId,
            ],
          );
          if (result.affectedRows > 0) novos++;
          else jaImportados++;
        } catch (e) {
          erros.push(e instanceof Error ? e.message : String(e));
        }
      }

      return { total: blocos.length, novos, jaImportados, erros };
    });
  });
