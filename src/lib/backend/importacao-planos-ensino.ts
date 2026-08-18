import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { carregarPdfParse, extrairItensDoTextoPdf, type ItemPdf } from "./importacao-pdf-sessoes";

// Reaproveita o mesmo parser do cronograma (âncora em "DD.MM.AAAA" por
// linha) só pra extrair, de cada item, os títulos únicos de peça de
// arquitetura por grau — não depende do cronograma já ter sido
// importado antes (decodifica o PDF de novo, é só leitura de texto).
const PECA_TITULO_RE = /Pe[çc]a de Arq\.?[:.]?\s*[Ss]obre[:.]?\s*["“]([^"”]+)["”]/g;

const PAPEIS_ESCRITA = ["admin", "secretario"];

export type PlanoEnsinoExtraido = { grau: number; titulo: string };

export function extrairTitulosPlanoEnsino(itens: ItemPdf[]): PlanoEnsinoExtraido[] {
  const resultado: PlanoEnsinoExtraido[] = [];
  const vistos = new Set<string>();
  for (const item of itens) {
    if (item.grau === null) continue;
    for (const m of item.textoCompleto.matchAll(PECA_TITULO_RE)) {
      const titulo = m[1].replace(/\s+/g, " ").trim();
      if (!titulo) continue;
      const chave = `${item.grau}::${titulo.toLowerCase()}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      resultado.push({ grau: item.grau, titulo });
    }
  }
  return resultado;
}

export type PlanoEnsinoPreview = PlanoEnsinoExtraido & {
  jaExiste: boolean;
  bloqueado: boolean;
  motivoBloqueio: string | null;
};

const previewSchema = z.object({
  orgId: z.string().uuid().nullable(),
  arquivoBase64: z.string().min(1),
});

export const previewImportacaoPlanosEnsino = createServerFn({ method: "POST" })
  .validator((d: unknown) => previewSchema.parse(d))
  .handler(async ({ data }): Promise<PlanoEnsinoPreview[]> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      let bytes: Buffer;
      try {
        bytes = Buffer.from(data.arquivoBase64, "base64");
      } catch {
        throw new Error("Arquivo inválido.");
      }
      const PDFParse = await carregarPdfParse();
      const parser = new PDFParse({ data: bytes });
      const resultado = await parser.getText();
      const itens = extrairItensDoTextoPdf(resultado.text);
      const titulos = extrairTitulosPlanoEnsino(itens);
      if (titulos.length === 0) {
        throw new Error(
          'Nenhum título de peça de arquitetura reconhecido (esperado "Peça de Arq.: sobre ...").',
        );
      }

      let grauMin = 1;
      let grauMax = 99;
      if (data.orgId) {
        const [[org]] = await conn.query<RowDataPacket[]>(
          "SELECT grau_min, grau_max FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
          [data.orgId],
        );
        if (!org) throw new Error("Corpo maçônico não encontrado nesta Loja.");
        grauMin = org.grau_min;
        grauMax = org.grau_max;
      }

      const [existentesRows] = await conn.query<RowDataPacket[]>(
        "SELECT grau, titulo FROM planos_ensino WHERE org_id <=> ? AND loja_id = @current_loja_id",
        [data.orgId],
      );
      const existentes = new Set(
        (existentesRows as { grau: number; titulo: string }[]).map(
          (p) => `${p.grau}::${p.titulo.toLowerCase()}`,
        ),
      );

      return titulos.map((t) => {
        const bloqueado = t.grau < grauMin || t.grau > grauMax;
        return {
          ...t,
          jaExiste: existentes.has(`${t.grau}::${t.titulo.toLowerCase()}`),
          bloqueado,
          motivoBloqueio: bloqueado ? `Grau fora da faixa do corpo (${grauMin}–${grauMax})` : null,
        };
      });
    });
  });

const confirmarSchema = z.object({
  orgId: z.string().uuid().nullable(),
  itens: z.array(z.object({ grau: z.number().int().positive(), titulo: z.string().min(1) })),
});

export type ResumoImportacaoPlanos = { criados: number; ignorados: number };

export const confirmarImportacaoPlanosEnsino = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmarSchema.parse(d))
  .handler(async ({ data }): Promise<ResumoImportacaoPlanos> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual, lojaId) => {
      let grauMin = 1;
      let grauMax = 99;
      if (data.orgId) {
        const [[org]] = await conn.query<RowDataPacket[]>(
          "SELECT grau_min, grau_max FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
          [data.orgId],
        );
        if (!org) throw new Error("Corpo maçônico não encontrado nesta Loja.");
        grauMin = org.grau_min;
        grauMax = org.grau_max;
      }

      const [existentesRows] = await conn.query<RowDataPacket[]>(
        "SELECT grau, LOWER(titulo) AS titulo_lower, ordem FROM planos_ensino WHERE org_id <=> ? AND loja_id = @current_loja_id",
        [data.orgId],
      );
      const existentesPorGrauTitulo = new Set(
        existentesRows.map((r) => `${r.grau}|${r.titulo_lower}`),
      );
      const maxOrdemPorGrau = new Map<number, number>();
      for (const r of existentesRows) {
        const atual = maxOrdemPorGrau.get(r.grau) ?? 0;
        if (r.ordem > atual) maxOrdemPorGrau.set(r.grau, r.ordem);
      }

      let criados = 0;
      let ignorados = 0;
      for (const item of data.itens) {
        if (item.grau < grauMin || item.grau > grauMax) {
          ignorados++;
          continue;
        }
        const chave = `${item.grau}|${item.titulo.toLowerCase()}`;
        if (existentesPorGrauTitulo.has(chave)) {
          ignorados++;
          continue;
        }
        const ordem = (maxOrdemPorGrau.get(item.grau) ?? 0) + 1;
        await conn.query(
          "INSERT INTO planos_ensino (loja_id, grau, org_id, ordem, titulo, conteudo) VALUES (?, ?, ?, ?, ?, NULL)",
          [lojaId, item.grau, data.orgId, ordem, item.titulo],
        );
        existentesPorGrauTitulo.add(chave);
        maxOrdemPorGrau.set(item.grau, ordem);
        criados++;
      }

      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "importar_planos_ensino",
        "planos_ensino",
        null,
        null,
        { org_id: data.orgId, criados, ignorados },
      );
      return { criados, ignorados };
    });
  });
