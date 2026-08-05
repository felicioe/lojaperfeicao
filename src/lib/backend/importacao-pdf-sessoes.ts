import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createRequire } from "node:module";
import { PDFParse } from "pdf-parse";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Importação do cronograma de sessões a partir de PDF (ex.: "Programa de
// Ensino e Formação Filosófica"). Extração de texto via pdf-parse não
// preserva colunas de tabela — o parser abaixo é "melhor esforço",
// ancorado no padrão de data (DD.MM.AAAA) que abre cada linha da tabela
// de cronograma, por isso SEMPRE passa por preview antes de confirmar
// (mesma exigência do restante do projeto pra qualquer importação em
// lote). Avisos da própria pauta (feriado, sessão suspensa, templo
// cedido, confraternização) são detectados e marcados para não virarem
// sessão.
//
// pdfjs-dist (usado por baixo do pano pelo pdf-parse) resolve o worker
// relativo à URL do próprio módulo bundlado — depois que o Nitro empacota
// tudo em .output/server/_libs/, esse caminho relativo não existe mais.
// require.resolve() encontra o arquivo real em node_modules (sobe o
// diretório a partir de .output/server/, que fica dentro do projeto) e
// PDFParse.setWorker() aponta pdfjs-dist pra lá. Só pode rodar dentro do
// handler de uma server function — chamado no top level do módulo, o
// createRequire vaza pro bundle do client também (código de handler é
// removido do client pelo compilador, o resto do módulo não).
let workerConfigurado = false;
function garantirWorkerPdfConfigurado() {
  if (workerConfigurado) return;
  const workerPath = createRequire(import.meta.url).resolve("pdfjs-dist/build/pdf.worker.mjs");
  PDFParse.setWorker(workerPath);
  workerConfigurado = true;
}

const PAPEIS_ESCRITA = ["admin", "secretario"];

const AVISO_RE = /SUSPENSA|FERIADO|CEDIDO|INSTALA[ÇC][ÃA]O|CONFRATERNIZA[ÇC][ÃA]O/i;

export type ItemPdf = {
  data: string;
  grau: number | null;
  aviso: boolean;
  resumo: string;
  textoCompleto: string;
};

export function extrairItensDoTextoPdf(textoBruto: string): ItemPdf[] {
  const marcador = textoBruto.search(/cronograma de trabalho/i);
  const secao = marcador >= 0 ? textoBruto.slice(marcador) : textoBruto;
  const primeiraData = secao.search(/\n\d{2}\.\d{2}\.\d{4}/);
  if (primeiraData < 0) return [];
  const corpo = secao.slice(primeiraData + 1);

  const blocos = corpo.split(/(?=^\d{2}\.\d{2}\.\d{4})/m).filter((b) => b.trim());
  const itens: ItemPdf[] = [];

  for (const bloco of blocos) {
    const linhas = bloco
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (linhas.length === 0) continue;
    const dataMatch = linhas[0].match(/^(\d{2})\.(\d{2})\.(\d{4})\s*(.*)/);
    if (!dataMatch) continue;
    const [, dia, mes, ano, restoPrimeiraLinha] = dataMatch;
    const textoCompleto = [restoPrimeiraLinha, ...linhas.slice(1)]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!textoCompleto) continue;

    const grauMatch = textoCompleto.match(/GRAU\s*(\d{1,2})/i);
    const aviso = AVISO_RE.test(textoCompleto);

    itens.push({
      data: `${ano}-${mes}-${dia}`,
      grau: grauMatch ? Number(grauMatch[1]) : null,
      aviso,
      resumo: textoCompleto.slice(0, 140),
      textoCompleto,
    });
  }
  return itens;
}

const previewSchema = z.object({
  orgId: z.string().uuid(),
  arquivoBase64: z.string().min(1),
});

export type ItemPreviewPdf = ItemPdf & {
  importavel: boolean;
  motivoBloqueio: string | null;
  duplicado: boolean;
};

async function classificarItensPdf(
  conn: import("mysql2/promise").PoolConnection,
  orgId: string,
  itens: ItemPdf[],
): Promise<ItemPreviewPdf[]> {
  const [[org]] = await conn.query<RowDataPacket[]>(
    "SELECT grau_min, grau_max FROM orgs WHERE id = ?",
    [orgId],
  );
  if (!org) throw new Error("Corpo maçônico não encontrado.");

  const resultado: ItemPreviewPdf[] = [];
  for (const item of itens) {
    if (item.aviso) {
      resultado.push({
        ...item,
        importavel: false,
        motivoBloqueio: "Aviso — não é sessão",
        duplicado: false,
      });
      continue;
    }
    if (item.grau === null) {
      resultado.push({
        ...item,
        importavel: false,
        motivoBloqueio: "Grau não identificado no texto",
        duplicado: false,
      });
      continue;
    }
    if (item.grau < org.grau_min || item.grau > org.grau_max) {
      resultado.push({
        ...item,
        importavel: false,
        motivoBloqueio: `Grau fora da faixa do corpo (${org.grau_min}–${org.grau_max})`,
        duplicado: false,
      });
      continue;
    }
    const [[dup]] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM sessoes WHERE data = ? AND org_id = ? LIMIT 1",
      [item.data, orgId],
    );
    resultado.push({ ...item, importavel: !dup, motivoBloqueio: null, duplicado: !!dup });
  }
  return resultado;
}

export const previewImportacaoPdfSessoes = createServerFn({ method: "POST" })
  .validator((d: unknown) => previewSchema.parse(d))
  .handler(async ({ data }): Promise<ItemPreviewPdf[]> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      let bytes: Buffer;
      try {
        bytes = Buffer.from(data.arquivoBase64, "base64");
      } catch {
        throw new Error("Arquivo inválido.");
      }
      garantirWorkerPdfConfigurado();
      const parser = new PDFParse({ data: bytes });
      const resultado = await parser.getText();
      const itens = extrairItensDoTextoPdf(resultado.text);
      if (itens.length === 0) {
        throw new Error(
          "Nenhuma linha de cronograma reconhecida (esperado padrão de data DD.MM.AAAA por linha da tabela).",
        );
      }
      return classificarItensPdf(conn, data.orgId, itens);
    });
  });

const confirmarSchema = z.object({
  orgId: z.string().uuid(),
  itens: z.array(
    z.object({
      data: z.string(),
      grau: z.number().int().positive(),
      textoCompleto: z.string(),
    }),
  ),
});

export type ResumoImportacaoPdf = { sessoesCriadas: number };

export const confirmarImportacaoPdfSessoes = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmarSchema.parse(d))
  .handler(async ({ data }): Promise<ResumoImportacaoPdf> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      let sessoesCriadas = 0;
      for (const item of data.itens) {
        const [[dup]] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM sessoes WHERE data = ? AND org_id = ? LIMIT 1",
          [item.data, data.orgId],
        );
        if (dup) continue;
        await conn.query(
          "INSERT INTO sessoes (data, tipo, org_id, grau, observacoes) VALUES (?, 'ordinaria', ?, ?, ?)",
          [item.data, data.orgId, item.grau, item.textoCompleto],
        );
        sessoesCriadas++;
      }
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "importar_pdf_sessoes",
        "sessoes",
        null,
        null,
        {
          org_id: data.orgId,
          sessoes_criadas: sessoesCriadas,
        },
      );
      return { sessoesCriadas };
    });
  });
