import ExcelJS from "exceljs";
import { deflateSync, inflateSync } from "node:zlib";

// Gerador de arquivo compartilhado (issue #111) — server-only apesar de
// não importar db.ts: `exceljs` é pesado e orientado a Node, então segue
// a mesma disciplina de email-dispatch.ts/backup-dispatch.ts — nunca
// importar este arquivo direto de uma rota cliente, só via import()
// dinâmico dentro de handler de createServerFn.

// `formato: "moeda"` (issue do usuário — valores exportados sem vírgula/
// centavo) diz pro gerador pra exibir esse número com separador decimal
// pt-BR (1.234,56). No XLSX o valor da célula continua numérico de
// verdade (só a máscara de exibição muda) — quem abre a planilha ainda
// consegue somar/fazer conta em cima da coluna; em CSV/PDF/TXT (texto
// puro, sem conceito de "célula numérica") o valor já sai formatado.
export type ColunaRelatorio = { chave: string; titulo: string; formato?: "moeda" };
export type LinhaRelatorio = Record<string, string | number | null>;
export type FormatoRelatorio = "xlsx" | "pdf" | "csv" | "txt";
export type LogoRelatorio = { nome: string; logoUrl: string };
export type TotalRelatorio = { rotulo: string; valor: number };

// Nenhum relatório exportado deve ser só uma tabela genérica (pedido do
// usuário) — todo PDF/XLSX ganha um resumo de totais (quando o chamador
// informa) e um rodapé com data de geração + quem gerou. CSV/TXT ficam de
// fora, mesma decisão já tomada para logo (formato de texto puro).
function formatarMoedaRelatorio(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

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

// Extensão que o ExcelJS aceita pro par de formatos que os uploads de logo
// (SGCAB, irmão, org/potência — issues #371-#375) permitem gravar.
function extensaoImagemDe(dataUrl: string): "png" | "jpeg" | null {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,/i);
  if (!match) return null;
  return /^png$/i.test(match[1]) ? "png" : "jpeg";
}

export async function gerarXlsxBuffer(
  titulo: string,
  colunas: ColunaRelatorio[],
  linhas: LinhaRelatorio[],
  logos: LogoRelatorio[] = [],
  totais: TotalRelatorio[] = [],
  geradoPor: string | null = null,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet(titulo.slice(0, 31) || "Relatório");
  // Sem `header` aqui de propósito: com logo, o título das colunas não vai
  // necessariamente na linha 1 (issue #376) — a linha certa é escrita
  // manualmente abaixo, e addRow() já roteia pelos `key` independente disso.
  planilha.columns = colunas.map((c) => ({
    key: c.chave,
    width: Math.max(c.titulo.length + 2, 14),
    // Célula continua numérica de verdade (dá pra somar/fazer conta em
    // cima dela na planilha) — só a máscara de exibição vira vírgula/
    // centavo. O Excel converte "#,##0.00" pro separador da localidade
    // de quem abre o arquivo sozinho, então isso já sai certo em pt-BR
    // sem precisar escrever a máscara com vírgula literal.
    style: c.formato === "moeda" ? { numFmt: "#,##0.00" } : undefined,
  }));

  let linhaCabecalho = 1;
  if (logos.length > 0) {
    planilha.getRow(1).height = 50;
    let colOffset = 0;
    for (const logo of logos) {
      const extensao = extensaoImagemDe(logo.logoUrl);
      if (!extensao) continue;
      try {
        const imageId = workbook.addImage({ base64: logo.logoUrl, extension: extensao });
        planilha.addImage(imageId, {
          tl: { col: colOffset, row: 0 },
          ext: { width: 48, height: 48 },
        });
      } catch {
        // Logo num formato/tamanho que o ExcelJS não consegue embutir —
        // não impede o resto do relatório de sair.
      }
      colOffset += 1;
    }
    linhaCabecalho = 2;
  }

  const linhaTitulos = planilha.getRow(linhaCabecalho);
  colunas.forEach((c, indice) => {
    linhaTitulos.getCell(indice + 1).value = c.titulo;
  });
  linhaTitulos.font = { bold: true };

  for (const linha of linhas) planilha.addRow(linha);

  if (totais.length > 0) {
    planilha.addRow({});
    for (const total of totais) {
      const linhaTotal = planilha.addRow({
        [colunas[0].chave]: `${total.rotulo}: ${formatarMoedaRelatorio(total.valor)}`,
      });
      linhaTotal.font = { bold: true };
    }
  }

  const dataGeracaoRodape = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  planilha.addRow({});
  const linhaRodape = planilha.addRow({
    [colunas[0].chave]: `Gerado em ${dataGeracaoRodape}${geradoPor ? ` por ${geradoPor}` : ""}`,
  });
  linhaRodape.font = { italic: true, size: 9, color: { argb: "FF8B95A5" } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function gerarPdfBuffer(
  titulo: string,
  colunas: ColunaRelatorio[],
  linhas: LinhaRelatorio[],
  logos: LogoRelatorio[] = [],
  totais: TotalRelatorio[] = [],
  geradoPor: string | null = null,
): Promise<Buffer> {
  const pdf = new PdfSimplesPaisagem();
  // Prepara os logos ANTES de desenhar qualquer página — os objetos de
  // imagem do PDF precisam existir pra entrar no /Resources de cada
  // página (issue #376). Logo em formato que decodificarPng não suporta
  // (bit depth != 8, entrelaçado, paleta) volta null e é ignorado, sem
  // quebrar o resto do relatório.
  const logosPreparados = logos
    .map((logo) => pdf.prepararImagem(logo.logoUrl))
    .filter((r): r is { indice: number; largura: number; altura: number } => r !== null);

  const larguraColuna = (pdf.larguraPagina - pdf.margem * 2) / Math.max(colunas.length, 1);
  const caracPorColuna = Math.max(6, Math.floor((larguraColuna - 8) / 4.2));
  const dataGeracao = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  const ALTURA_LOGO = 28;
  const GAP_LOGO = 6;

  let cursorY = pdf.margem;

  const desenharCabecalho = () => {
    if (logosPreparados.length > 0) {
      // Alinhados à direita, no topo — não empurra o título/colunas, que
      // seguem exatamente como antes de existir logo.
      let xLogo = pdf.larguraPagina - pdf.margem;
      for (let i = logosPreparados.length - 1; i >= 0; i--) {
        const logo = logosPreparados[i];
        const larguraLogo = (logo.largura / logo.altura) * ALTURA_LOGO;
        xLogo -= larguraLogo;
        pdf.desenharImagem(logo.indice, xLogo, pdf.margem, larguraLogo, ALTURA_LOGO);
        xLogo -= GAP_LOGO;
      }
    }
    pdf.escreverTexto(titulo, 36, cursorY, {
      fonte: "bold",
      tamanho: 16,
      cor: "#172033",
    });
    cursorY += 22;
    // Resumo de totais (issue #377) — em vez da simples "Gerado em ..." de
    // antes, que agora vive só no rodapé. Quebrado em grupos de até 3 pra
    // não estourar a largura da página com relatórios de muitos totais
    // (ex.: Extrato do Irmão tem 5).
    if (totais.length > 0) {
      const TOTAIS_POR_LINHA = 3;
      for (let i = 0; i < totais.length; i += TOTAIS_POR_LINHA) {
        const grupo = totais.slice(i, i + TOTAIS_POR_LINHA);
        const textoGrupo = grupo
          .map((t) => `${t.rotulo}: ${formatarMoedaRelatorio(t.valor)}`)
          .join("      ");
        pdf.desenharRetangulo(36, cursorY - 4, pdf.larguraPagina - 72, 17, "#eef3fc");
        pdf.escreverTexto(textoGrupo, 40, cursorY - 1, {
          fonte: "bold",
          tamanho: 8.5,
          cor: "#1d4ed8",
        });
        cursorY += 18;
      }
      cursorY += 4;
    }
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
        truncarTexto(formatarValor(linha[coluna.chave], coluna.formato), caracPorColuna),
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

  // Rodapé (issue #377) em todas as páginas já criadas — data de geração e
  // quem gerou, do jeito que já existe em qualquer documento impresso.
  pdf.escreverTextoEmTodasPaginas(
    `Gerado em ${dataGeracao}${geradoPor ? ` por ${geradoPor}` : ""}`,
    36,
    pdf.alturaPagina - 26,
    { tamanho: 7, cor: "#8b95a5" },
  );

  return pdf.finalizar();
}

function formatarValor(v: string | number | null, formato?: "moeda"): string {
  if (v === null || v === undefined) return "";
  if (formato === "moeda" && typeof v === "number") return formatarMoedaSemSimbolo(v);
  return String(v);
}

// Vírgula decimal, ponto de milhar, sempre 2 casas — sem "R$" na frente:
// as colunas já se chamam "Débito"/"Crédito"/"Saldo", o símbolo repetido
// em toda linha só teria poluído a planilha/PDF.
function formatarMoedaSemSimbolo(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function truncarTexto(texto: string, maxCaracteres: number): string {
  if (texto.length <= maxCaracteres) return texto;
  if (maxCaracteres <= 1) return texto.slice(0, maxCaracteres);
  return `${texto.slice(0, Math.max(0, maxCaracteres - 1))}…`;
}

type FontePdf = "regular" | "bold";
type OpcaoTextoPdf = { fonte?: FontePdf; tamanho?: number; cor?: string };

type ImagemPreparada = {
  largura: number;
  altura: number;
  grayscale: boolean;
  dadosComprimidos: Buffer;
  alfaComprimido: Buffer | null;
};

class PdfSimplesPaisagem {
  readonly larguraPagina = 841.89;
  readonly alturaPagina = 595.28;
  readonly margem = 36;
  private paginas: string[] = [""];
  private imagens: ImagemPreparada[] = [];

  novaPagina() {
    this.paginas.push("");
  }

  // Decodifica um PNG (data URL) e registra como imagem embutível — usado
  // pelos logos institucionais nos relatórios exportados (issue #376).
  // Retorna null pra qualquer formato/variação não suportada (JPEG, PNG
  // com paleta, bit depth != 8, entrelaçado) em vez de lançar: um logo que
  // o decodificador não entende não pode derrubar o relatório inteiro.
  prepararImagem(dataUrl: string): { indice: number; largura: number; altura: number } | null {
    const decodificada = decodificarPng(dataUrl);
    if (!decodificada) return null;
    this.imagens.push({
      largura: decodificada.largura,
      altura: decodificada.altura,
      grayscale: decodificada.grayscale,
      dadosComprimidos: deflateSync(decodificada.rgbOuGray),
      alfaComprimido: decodificada.alfa ? deflateSync(decodificada.alfa) : null,
    });
    const indice = this.imagens.length - 1;
    return { indice, largura: decodificada.largura, altura: decodificada.altura };
  }

  // x/yTopo/largura/altura na mesma convenção de escreverTexto/desenharRetangulo
  // (origem no canto superior esquerdo da página).
  desenharImagem(indice: number, x: number, yTopo: number, largura: number, altura: number) {
    const yPdf = this.alturaPagina - yTopo - altura;
    this.adicionarOperacao(
      `q ${numeroPdf(largura)} 0 0 ${numeroPdf(altura)} ${numeroPdf(x)} ${numeroPdf(yPdf)} cm /Im${indice} Do Q`,
    );
  }

  escreverTexto(texto: string, x: number, yTopo: number, opcoes: OpcaoTextoPdf = {}) {
    this.adicionarOperacao(this.operacaoTexto(texto, x, yTopo, opcoes));
  }

  // Mesmo texto em toda página já criada até aqui — usado pro rodapé
  // (data de geração + usuário, issue #377), que deve repetir em cada
  // página do PDF, não só na última.
  escreverTextoEmTodasPaginas(texto: string, x: number, yTopo: number, opcoes: OpcaoTextoPdf = {}) {
    const operacao = this.operacaoTexto(texto, x, yTopo, opcoes);
    this.paginas = this.paginas.map((pagina) => `${pagina}${operacao}\n`);
  }

  private operacaoTexto(
    texto: string,
    x: number,
    yTopo: number,
    opcoes: OpcaoTextoPdf = {},
  ): string {
    const fonte = opcoes.fonte === "bold" ? "/F2" : "/F1";
    const tamanho = opcoes.tamanho ?? 10;
    const [r, g, b] = corHexParaPdf(opcoes.cor ?? "#000000");
    const yPdf = this.alturaPagina - yTopo - tamanho;
    return `BT ${fonte} ${numeroPdf(tamanho)} Tf ${numeroPdf(r)} ${numeroPdf(g)} ${numeroPdf(b)} rg 1 0 0 1 ${numeroPdf(x)} ${numeroPdf(yPdf)} Tm ${textoPdf(texto)} Tj ET`;
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

    // Objetos de imagem (issue #376) alocados antes das páginas — cada
    // imagem ocupa 1 objeto XObject, +1 objeto de SMask se tiver alfa. O
    // /XObject entra no /Resources de TODAS as páginas (mesma lista de
    // logos aparece no cabeçalho de cada uma), não só das que desenham.
    const refsImagens = this.imagens.map((imagem) => {
      const objImagem = proximoObjeto++;
      const objSmask = imagem.alfaComprimido ? proximoObjeto++ : null;
      if (objSmask !== null && imagem.alfaComprimido) {
        objetos[objSmask] = bufferImagemPdf(objSmask, {
          largura: imagem.largura,
          altura: imagem.altura,
          colorSpace: "/DeviceGray",
          dados: imagem.alfaComprimido,
          smaskRef: null,
        });
      }
      objetos[objImagem] = bufferImagemPdf(objImagem, {
        largura: imagem.largura,
        altura: imagem.altura,
        colorSpace: imagem.grayscale ? "/DeviceGray" : "/DeviceRGB",
        dados: imagem.dadosComprimidos,
        smaskRef: objSmask,
      });
      return objImagem;
    });
    const xObjectDict = refsImagens.map((ref, indice) => `/Im${indice} ${ref} 0 R`).join(" ");
    const resources = `<< /Font << /F1 3 0 R /F2 4 0 R >>${xObjectDict ? ` /XObject << ${xObjectDict} >>` : ""} >>`;

    this.paginas.forEach((conteudo) => {
      const objPagina = proximoObjeto++;
      const objConteudo = proximoObjeto++;
      refsPaginas.push(objPagina);
      objetos[objPagina] = bufferObjetoPdf(
        objPagina,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${numeroPdf(this.larguraPagina)} ${numeroPdf(this.alturaPagina)}] /Resources ${resources} /Contents ${objConteudo} 0 R >>`,
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

function bufferImagemPdf(
  numero: number,
  opcoes: {
    largura: number;
    altura: number;
    colorSpace: string;
    dados: Buffer;
    smaskRef: number | null;
  },
): Buffer {
  const dicionario =
    `<< /Type /XObject /Subtype /Image /Width ${opcoes.largura} /Height ${opcoes.altura} ` +
    `/ColorSpace ${opcoes.colorSpace} /BitsPerComponent 8 /Filter /FlateDecode` +
    `${opcoes.smaskRef !== null ? ` /SMask ${opcoes.smaskRef} 0 R` : ""} /Length ${opcoes.dados.length} >>`;
  return Buffer.concat([
    Buffer.from(`${numero} 0 obj\n${dicionario}\nstream\n`, "binary"),
    opcoes.dados,
    Buffer.from("\nendstream\nendobj\n", "binary"),
  ]);
}

// Decodificador de PNG mínimo pros logos institucionais nos relatórios
// exportados (issue #376) — sem lib externa, só node:zlib. Cobre o caso
// comum de logo (8 bits por canal, sem entrelaçamento, grayscale/RGB/RGBA)
// e devolve null pra qualquer coisa fora disso (paleta, 16 bits,
// entrelaçado, arquivo corrompido) em vez de lançar — quem chama trata
// null como "sem logo pra essa entidade", sem derrubar o relatório.
type ImagemDecodificada = {
  largura: number;
  altura: number;
  grayscale: boolean;
  rgbOuGray: Buffer;
  alfa: Buffer | null;
};

const ASSINATURA_PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodificarPng(dataUrl: string): ImagemDecodificada | null {
  try {
    const match = dataUrl.match(/^data:image\/png;base64,(.+)$/i);
    if (!match) return null;
    const arquivo = Buffer.from(match[1], "base64");
    if (arquivo.length < 8 || !arquivo.subarray(0, 8).equals(ASSINATURA_PNG)) return null;

    let largura = 0;
    let altura = 0;
    let bitDepth = 0;
    let colorType = -1;
    let interlace = 0;
    const partesIdat: Buffer[] = [];

    let offset = 8;
    while (offset + 8 <= arquivo.length) {
      const tamanho = arquivo.readUInt32BE(offset);
      const tipo = arquivo.toString("ascii", offset + 4, offset + 8);
      const dados = arquivo.subarray(offset + 8, offset + 8 + tamanho);
      if (tipo === "IHDR") {
        largura = dados.readUInt32BE(0);
        altura = dados.readUInt32BE(4);
        bitDepth = dados.readUInt8(8);
        colorType = dados.readUInt8(9);
        interlace = dados.readUInt8(12);
      } else if (tipo === "IDAT") {
        partesIdat.push(dados);
      } else if (tipo === "IEND") {
        break;
      }
      offset += 12 + tamanho; // 4 (tamanho) + 4 (tipo) + dados + 4 (CRC)
    }

    // Só o caso comum de logo: 8 bits, sem entrelaçamento, sem paleta.
    if (bitDepth !== 8 || interlace !== 0) return null;
    if (colorType !== 0 && colorType !== 2 && colorType !== 6) return null;
    if (largura <= 0 || altura <= 0 || largura > 4000 || altura > 4000) return null;
    if (partesIdat.length === 0) return null;

    const canais = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
    const bruto = inflateSync(Buffer.concat(partesIdat));
    const stride = largura * canais;
    if (bruto.length < (stride + 1) * altura) return null;

    let linhaAnterior = Buffer.alloc(stride);
    const saida = Buffer.alloc(stride * altura);
    let posEntrada = 0;

    for (let y = 0; y < altura; y++) {
      const tipoFiltro = bruto[posEntrada];
      posEntrada += 1;
      const linhaAtual = saida.subarray(y * stride, (y + 1) * stride);
      for (let x = 0; x < stride; x++) {
        const brutoX = bruto[posEntrada + x];
        const esquerda = x >= canais ? linhaAtual[x - canais] : 0;
        const cima = linhaAnterior[x];
        const cimaEsquerda = x >= canais ? linhaAnterior[x - canais] : 0;
        let valor: number;
        if (tipoFiltro === 0) valor = brutoX;
        else if (tipoFiltro === 1) valor = brutoX + esquerda;
        else if (tipoFiltro === 2) valor = brutoX + cima;
        else if (tipoFiltro === 3) valor = brutoX + Math.floor((esquerda + cima) / 2);
        else if (tipoFiltro === 4) valor = brutoX + paethPredictor(esquerda, cima, cimaEsquerda);
        else return null;
        linhaAtual[x] = valor & 0xff;
      }
      posEntrada += stride;
      linhaAnterior = Buffer.from(linhaAtual);
    }

    if (colorType === 6) {
      const totalPixels = largura * altura;
      const rgb = Buffer.alloc(totalPixels * 3);
      const alfa = Buffer.alloc(totalPixels);
      for (let p = 0; p < totalPixels; p++) {
        rgb[p * 3] = saida[p * 4];
        rgb[p * 3 + 1] = saida[p * 4 + 1];
        rgb[p * 3 + 2] = saida[p * 4 + 2];
        alfa[p] = saida[p * 4 + 3];
      }
      return { largura, altura, grayscale: false, rgbOuGray: rgb, alfa };
    }

    return { largura, altura, grayscale: colorType === 0, rgbOuGray: saida, alfa: null };
  } catch {
    return null;
  }
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
  const corpo = linhas.map((l) =>
    colunas.map((c) => formatarValor(l[c.chave], c.formato)).join(";"),
  );
  return "\uFEFF" + [cabecalho, ...corpo].join("\r\n");
}

export function gerarTxt(colunas: ColunaRelatorio[], linhas: LinhaRelatorio[]): string {
  const cabecalho = colunas.map((c) => c.titulo).join("\t");
  const corpo = linhas.map((l) =>
    colunas.map((c) => formatarValor(l[c.chave], c.formato)).join("\t"),
  );
  return [cabecalho, ...corpo].join("\n");
}

export async function gerarArquivo(
  formato: FormatoRelatorio,
  titulo: string,
  colunas: ColunaRelatorio[],
  linhas: LinhaRelatorio[],
  logos: LogoRelatorio[] = [],
  totais: TotalRelatorio[] = [],
  geradoPor: string | null = null,
): Promise<Buffer> {
  // CSV/TXT ficam sem logo/totais/rodapé de propósito — são formato de
  // texto puro pra importar em outro sistema, não pra leitura humana
  // (mesma decisão já tomada pro logo na issue #376).
  if (formato === "xlsx") return gerarXlsxBuffer(titulo, colunas, linhas, logos, totais, geradoPor);
  if (formato === "pdf") return gerarPdfBuffer(titulo, colunas, linhas, logos, totais, geradoPor);
  if (formato === "csv") return Buffer.from(gerarCsv(colunas, linhas), "utf-8");
  return Buffer.from(gerarTxt(colunas, linhas), "utf-8");
}
