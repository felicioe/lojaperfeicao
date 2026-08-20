import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// Gerador de arquivo compartilhado (issue #111) — server-only apesar de
// não importar db.ts: `exceljs` é pesado e orientado a Node, então segue
// a mesma disciplina de email-dispatch.ts/backup-dispatch.ts — nunca
// importar este arquivo direto de uma rota cliente, só via import()
// dinâmico dentro de handler de createServerFn.

export type ColunaRelatorio = { chave: string; titulo: string };
export type LinhaRelatorio = Record<string, string | number | null>;
export type FormatoRelatorio = "xlsx" | "pdf" | "csv" | "txt";

export function mimeTypePara(formato: FormatoRelatorio): string {
  if (formato === "xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (formato === "pdf") return "application/pdf";
  if (formato === "csv") return "text/csv;charset=utf-8";
  return "text/plain;charset=utf-8";
}

export function extensaoPara(formato: FormatoRelatorio): string {
  return formato;
}

export async function gerarXlsxBuffer(
  titulo: string,
  colunas: ColunaRelatorio[],
  linhas: LinhaRelatorio[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet(titulo.slice(0, 31) || "Relatório");
  planilha.columns = colunas.map((c) => ({
    header: c.titulo,
    key: c.chave,
    width: Math.max(c.titulo.length + 2, 14),
  }));
  planilha.getRow(1).font = { bold: true };
  for (const linha of linhas) planilha.addRow(linha);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function gerarPdfBuffer(
  titulo: string,
  colunas: ColunaRelatorio[],
  linhas: LinhaRelatorio[],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  const partes: Buffer[] = [];
  doc.on("data", (parte) => partes.push(Buffer.from(parte)));
  const concluido = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
  });
  const largura = (doc.page.width - 72) / colunas.length;
  const cabecalho = () => {
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#172033").text(titulo);
    doc.moveDown(0.35);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#5b6475")
      .text(
        `Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`,
      );
    doc.moveDown(0.8);
    const y = doc.y;
    doc.rect(36, y - 4, doc.page.width - 72, 22).fill("#e8edf5");
    colunas.forEach((coluna, indice) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#172033")
        .text(coluna.titulo, 40 + indice * largura, y + 2, {
          width: largura - 8,
          ellipsis: true,
        });
    });
    doc.y = y + 24;
  };
  cabecalho();
  linhas.forEach((linha, linhaIndice) => {
    if (doc.y > doc.page.height - 54) {
      doc.addPage();
      cabecalho();
    }
    const y = doc.y;
    if (linhaIndice % 2 === 1) doc.rect(36, y - 3, doc.page.width - 72, 20).fill("#f7f9fc");
    colunas.forEach((coluna, indice) => {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#263044")
        .text(formatarValor(linha[coluna.chave]), 40 + indice * largura, y + 2, {
          width: largura - 8,
          height: 14,
          ellipsis: true,
        });
    });
    doc.y = y + 20;
  });
  doc.end();
  return concluido;
}

function formatarValor(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

// BOM (\uFEFF) faz o Excel abrir o CSV com acentuação correta em vez de
// interpretar como Latin-1 — mesmo truque já usado nas exportações
// client-side existentes (dre.tsx, balancete.tsx etc.).
export function gerarCsv(colunas: ColunaRelatorio[], linhas: LinhaRelatorio[]): string {
  const cabecalho = colunas.map((c) => c.titulo).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => formatarValor(l[c.chave])).join(";"));
  return "\uFEFF" + [cabecalho, ...corpo].join("\r\n");
}

export function gerarTxt(colunas: ColunaRelatorio[], linhas: LinhaRelatorio[]): string {
  const cabecalho = colunas.map((c) => c.titulo).join("\t");
  const corpo = linhas.map((l) => colunas.map((c) => formatarValor(l[c.chave])).join("\t"));
  return [cabecalho, ...corpo].join("\n");
}

export async function gerarArquivo(
  formato: FormatoRelatorio,
  titulo: string,
  colunas: ColunaRelatorio[],
  linhas: LinhaRelatorio[],
): Promise<Buffer> {
  if (formato === "xlsx") return gerarXlsxBuffer(titulo, colunas, linhas);
  if (formato === "pdf") return gerarPdfBuffer(titulo, colunas, linhas);
  if (formato === "csv") return Buffer.from(gerarCsv(colunas, linhas), "utf-8");
  return Buffer.from(gerarTxt(colunas, linhas), "utf-8");
}
