import ExcelJS from "exceljs";

// Gerador de arquivo compartilhado (issue #111) — server-only apesar de
// não importar db.ts: `exceljs` é pesado e orientado a Node, então segue
// a mesma disciplina de email-dispatch.ts/backup-dispatch.ts — nunca
// importar este arquivo direto de uma rota cliente, só via import()
// dinâmico dentro de handler de createServerFn.

export type ColunaRelatorio = { chave: string; titulo: string };
export type LinhaRelatorio = Record<string, string | number | null>;
export type FormatoRelatorio = "xlsx" | "csv" | "txt";

export function mimeTypePara(formato: FormatoRelatorio): string {
  if (formato === "xlsx")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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
  if (formato === "csv") return Buffer.from(gerarCsv(colunas, linhas), "utf-8");
  return Buffer.from(gerarTxt(colunas, linhas), "utf-8");
}
