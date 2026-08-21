import ExcelJS from "exceljs";

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
  const pdf = new PdfSimplesPaisagem();
  const larguraColuna = (pdf.larguraPagina - pdf.margem * 2) / Math.max(colunas.length, 1);
  const caracPorColuna = Math.max(6, Math.floor((larguraColuna - 8) / 4.2));
  const dataGeracao = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  let cursorY = pdf.margem;

  const desenharCabecalho = () => {
    pdf.escreverTexto(titulo, 36, cursorY, {
      fonte: "bold",
      tamanho: 16,
      cor: "#172033",
    });
    cursorY += 22;
    pdf.escreverTexto(`Gerado em ${dataGeracao}`, 36, cursorY, {
      tamanho: 8,
      cor: "#5b6475",
    });
    cursorY += 18;
    pdf.desenharRetangulo(36, cursorY - 4, pdf.larguraPagina - 72, 22, "#e8edf5");
    colunas.forEach((coluna, indice) => {
      pdf.escreverTexto(
        truncarTexto(coluna.titulo, caracPorColuna),
        40 + indice * larguraColuna,
        cursorY + 2,
        {
          fonte: "bold",
          tamanho: 8,
          cor: "#172033",
        },
      );
    });
    cursorY += 24;
  };

  desenharCabecalho();

  linhas.forEach((linha, linhaIndice) => {
    if (cursorY > pdf.alturaPagina - 54) {
      pdf.novaPagina();
      cursorY = pdf.margem;
      desenharCabecalho();
    }
    if (linhaIndice % 2 === 1) {
      pdf.desenharRetangulo(36, cursorY - 3, pdf.larguraPagina - 72, 20, "#f7f9fc");
    }
    colunas.forEach((coluna, indice) => {
      pdf.escreverTexto(
        truncarTexto(formatarValor(linha[coluna.chave]), caracPorColuna),
        40 + indice * larguraColuna,
        cursorY + 2,
        {
          tamanho: 7.5,
          cor: "#263044",
        },
      );
    });
    cursorY += 20;
  });

  return pdf.finalizar();
}

function formatarValor(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function truncarTexto(texto: string, maxCaracteres: number): string {
  if (texto.length <= maxCaracteres) return texto;
  if (maxCaracteres <= 1) return texto.slice(0, maxCaracteres);
  return `${texto.slice(0, Math.max(0, maxCaracteres - 1))}…`;
}

type FontePdf = "regular" | "bold";
type OpcaoTextoPdf = { fonte?: FontePdf; tamanho?: number; cor?: string };

class PdfSimplesPaisagem {
  readonly larguraPagina = 841.89;
  readonly alturaPagina = 595.28;
  readonly margem = 36;
  private paginas: string[] = [""];

  novaPagina() {
    this.paginas.push("");
  }

  escreverTexto(texto: string, x: number, yTopo: number, opcoes: OpcaoTextoPdf = {}) {
    const fonte = opcoes.fonte === "bold" ? "/F2" : "/F1";
    const tamanho = opcoes.tamanho ?? 10;
    const [r, g, b] = corHexParaPdf(opcoes.cor ?? "#000000");
    const yPdf = this.alturaPagina - yTopo - tamanho;
    this.adicionarOperacao(
      `BT ${fonte} ${numeroPdf(tamanho)} Tf ${numeroPdf(r)} ${numeroPdf(g)} ${numeroPdf(b)} rg 1 0 0 1 ${numeroPdf(x)} ${numeroPdf(yPdf)} Tm ${textoPdf(texto)} Tj ET`,
    );
  }

  desenharRetangulo(x: number, yTopo: number, largura: number, altura: number, cor: string) {
    const [r, g, b] = corHexParaPdf(cor);
    const yPdf = this.alturaPagina - yTopo - altura;
    this.adicionarOperacao(
      `q ${numeroPdf(r)} ${numeroPdf(g)} ${numeroPdf(b)} rg ${numeroPdf(x)} ${numeroPdf(yPdf)} ${numeroPdf(largura)} ${numeroPdf(altura)} re f Q`,
    );
  }

  finalizar(): Buffer {
    const objetos: Buffer[] = [];
    const refsPaginas: number[] = [];
    let proximoObjeto = 5;

    this.paginas.forEach((conteudo) => {
      const objPagina = proximoObjeto++;
      const objConteudo = proximoObjeto++;
      refsPaginas.push(objPagina);
      objetos[objPagina] = bufferObjetoPdf(
        objPagina,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${numeroPdf(this.larguraPagina)} ${numeroPdf(this.alturaPagina)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${objConteudo} 0 R >>`,
      );
      objetos[objConteudo] = bufferStreamPdf(objConteudo, conteudo || " ");
    });

    objetos[1] = bufferObjetoPdf(1, "<< /Type /Catalog /Pages 2 0 R >>");
    objetos[2] = bufferObjetoPdf(
      2,
      `<< /Type /Pages /Kids [${refsPaginas.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${refsPaginas.length} >>`,
    );
    objetos[3] = bufferObjetoPdf(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objetos[4] = bufferObjetoPdf(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    const cabecalho = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary");
    const partes: Buffer[] = [cabecalho];
    const offsets: number[] = [0];
    let offsetAtual = cabecalho.length;

    for (let indice = 1; indice < objetos.length; indice += 1) {
      const objeto = objetos[indice];
      if (!objeto) continue;
      offsets[indice] = offsetAtual;
      partes.push(objeto);
      offsetAtual += objeto.length;
    }

    const inicioXref = offsetAtual;
    const totalObjetos = objetos.length;
    const linhasXref = ["xref", `0 ${totalObjetos}`, "0000000000 65535 f "];
    for (let indice = 1; indice < totalObjetos; indice += 1) {
      linhasXref.push(`${String(offsets[indice] ?? 0).padStart(10, "0")} 00000 n `);
    }
    const trailer = [
      ...linhasXref,
      "trailer",
      `<< /Size ${totalObjetos} /Root 1 0 R >>`,
      "startxref",
      String(inicioXref),
      "%%EOF",
    ].join("\n");
    partes.push(Buffer.from(trailer, "binary"));
    return Buffer.concat(partes);
  }

  private adicionarOperacao(operacao: string) {
    this.paginas[this.paginas.length - 1] += `${operacao}\n`;
  }
}

function bufferObjetoPdf(numero: number, conteudo: string): Buffer {
  return Buffer.from(`${numero} 0 obj\n${conteudo}\nendobj\n`, "binary");
}

function bufferStreamPdf(numero: number, conteudo: string): Buffer {
  const dados = Buffer.from(conteudo, "binary");
  const prefixo = Buffer.from(`${numero} 0 obj\n<< /Length ${dados.length} >>\nstream\n`, "binary");
  const sufixo = Buffer.from("\nendstream\nendobj\n", "binary");
  return Buffer.concat([prefixo, dados, sufixo]);
}

function textoPdf(texto: string): string {
  const seguro = normalizarTextoPdf(texto);
  return `<${Buffer.from(seguro, "latin1").toString("hex").toUpperCase()}>`;
}

function normalizarTextoPdf(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[…]/g, "...")
    .replace(/[^\x20-\xFF]/g, "?");
}

function corHexParaPdf(hex: string): [number, number, number] {
  const base = hex.replace("#", "");
  const valor =
    base.length === 3
      ? base
          .split("")
          .map((x) => x + x)
          .join("")
      : base;
  const inteiro = Number.parseInt(valor, 16);
  return [((inteiro >> 16) & 255) / 255, ((inteiro >> 8) & 255) / 255, (inteiro & 255) / 255];
}

function numeroPdf(valor: number): string {
  return Number(valor.toFixed(3)).toString();
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
