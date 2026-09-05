import QRCode from "qrcode";
import { PdfSimplesPaisagem } from "./relatorio-export";
import { gerarPixCopiaCola } from "./pix";
import type { LancamentoDetalhe } from "./backend/tesouraria-lancamentos";
import type { LogoInstitucional } from "./backend/orgs";

// PDF de verdade da fatura (issue do usuário — window.print() não é
// confiável no PWA instalado, principalmente iOS standalone, que nem tem
// diálogo de impressão). Mesmo conteúdo do FaturaCard.tsx (cartão HTML
// imprimível), redesenhado com os primitivos de baixo nível de
// PdfSimplesPaisagem — não dá pra rasterizar o HTML direto sem um browser
// headless (não disponível neste hosting Node comum da Hostinger).

export type LojaParaPdf = { nome: string; razaoSocial: string | null; cnpj: string | null };

const NAVY = "#213a5f";
const NAVY_DEEP = "#16283f";
const INK = "#1c2430";
const MUTED = "#5b6472";

function formatarMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatarData(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatarMesAno(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

// Sem fonte monoespaçada disponível (só Helvetica/Helvetica-Bold, ver
// relatorio-export.ts) — quebra por contagem de caracteres é aproximação
// razoável pro código Pix Copia e Cola (string longa de dígitos/letras),
// suficiente pra não vazar da margem da página.
function quebrarLinhas(texto: string, caracteresPorLinha: number): string[] {
  const linhas: string[] = [];
  for (let i = 0; i < texto.length; i += caracteresPorLinha) {
    linhas.push(texto.slice(i, i + caracteresPorLinha));
  }
  return linhas;
}

export async function gerarFaturaPdfBuffer(
  fatura: LancamentoDetalhe,
  loja: LojaParaPdf,
  logos: LogoInstitucional[],
): Promise<Buffer> {
  const pdf = new PdfSimplesPaisagem("retrato");
  const logosPreparados = logos
    .map((logo) => pdf.prepararImagem(logo.logoUrl))
    .filter((r): r is { indice: number; largura: number; altura: number } => r !== null);

  const xEsq = pdf.margem;
  const xDir = pdf.larguraPagina - pdf.margem;
  const larguraUtil = xDir - xEsq;

  let cursorY = pdf.margem;

  // Cabeçalho institucional — logos das Orgs/Potências (issue #340) + nome
  // da Loja, mesmo conteúdo do CabecalhoInstitucional.tsx.
  if (logosPreparados.length > 0) {
    const ALTURA_LOGO = 34;
    let xLogo = xEsq;
    for (const logo of logosPreparados) {
      const larguraLogo = (logo.largura / logo.altura) * ALTURA_LOGO;
      pdf.desenharImagem(logo.indice, xLogo, cursorY, larguraLogo, ALTURA_LOGO);
      xLogo += larguraLogo + 8;
    }
    cursorY += ALTURA_LOGO + 6;
  }
  const nomeLoja = (loja.razaoSocial || loja.nome).toUpperCase();
  pdf.escreverTexto(nomeLoja, xEsq, cursorY, { fonte: "bold", tamanho: 10.5, cor: NAVY_DEEP });
  cursorY += 16;
  pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, 1.6, NAVY);
  cursorY += 22;

  // Faixa de status, igual à barra colorida no topo do FaturaCard.
  const statusTexto = fatura.pago
    ? "Fatura quitada"
    : "Documento gerado eletronicamente pelo sistema — pagamento exclusivo via Pix";
  pdf.desenharRetangulo(xEsq, cursorY - 14, larguraUtil, 18, NAVY);
  pdf.escreverTexto(statusTexto, xEsq + 8, cursorY - 10, {
    tamanho: 7.5,
    cor: "#ffffff",
    fonte: "bold",
  });
  cursorY += 16;

  // Título + badge de situação.
  pdf.escreverTexto("Fatura da Associação", xEsq, cursorY, {
    fonte: "bold",
    tamanho: 15,
    cor: INK,
  });
  const situacao = fatura.pago ? "Pago" : fatura.valor_pago > 0 ? "Parcial" : "Em aberto";
  const corSituacao = fatura.pago ? "#1a7f4b" : "#a9670f";
  pdf.escreverTexto(situacao, xDir - 60, cursorY - 4, {
    fonte: "bold",
    tamanho: 8.5,
    cor: corSituacao,
  });
  cursorY += 14;
  pdf.escreverTexto("Documento para pagamento", xEsq, cursorY, { tamanho: 8.5, cor: MUTED });
  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  pdf.escreverTexto(`Emitida em ${hoje}`, xDir - 140, cursorY, { tamanho: 7.5, cor: MUTED });
  cursorY += 20;
  pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, 1, "#d8dee7");
  cursorY += 18;

  // Favorecido / Pagador, lado a lado.
  const larguraColuna2 = larguraUtil / 2;
  pdf.escreverTexto("FAVORECIDO", xEsq, cursorY, { fonte: "bold", tamanho: 7, cor: MUTED });
  pdf.escreverTexto("PAGADOR", xEsq + larguraColuna2, cursorY, {
    fonte: "bold",
    tamanho: 7,
    cor: MUTED,
  });
  cursorY += 12;
  pdf.escreverTexto(nomeLoja, xEsq, cursorY, { fonte: "bold", tamanho: 9, cor: INK });
  pdf.escreverTexto(fatura.irmao_nome ?? "—", xEsq + larguraColuna2, cursorY, {
    fonte: "bold",
    tamanho: 9,
    cor: INK,
  });
  cursorY += 12;
  if (loja.cnpj) {
    pdf.escreverTexto(`CNPJ ${loja.cnpj}`, xEsq, cursorY, { tamanho: 7.5, cor: MUTED });
  }
  if (fatura.irmao_cim) {
    pdf.escreverTexto(`CIM ${fatura.irmao_cim}`, xEsq + larguraColuna2, cursorY, {
      tamanho: 7.5,
      cor: MUTED,
    });
  }
  cursorY += 22;

  // Referente a.
  pdf.escreverTexto("REFERENTE A", xEsq, cursorY, { fonte: "bold", tamanho: 7, cor: MUTED });
  cursorY += 12;
  pdf.escreverTexto(fatura.descricao, xEsq, cursorY, { fonte: "bold", tamanho: 9, cor: INK });
  cursorY += 12;
  if (fatura.competencia_mes) {
    pdf.escreverTexto(
      `Competência ${formatarMesAno(fatura.competencia_mes)} · Emissão ${formatarData(fatura.data)}`,
      xEsq,
      cursorY,
      { tamanho: 7.5, cor: MUTED },
    );
  }
  cursorY += 22;

  // Cards Vencimento / Valor / Forma de pagamento — 3 colunas com fundo
  // leve, mesma composição do grid do FaturaCard.tsx.
  const larguraCard = larguraUtil / 3;
  const ALTURA_CARDS = 46;
  pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, ALTURA_CARDS, "#f2f4f8");
  const saldoRestante = Number(fatura.valor) - Number(fatura.valor_pago);
  const cards: [string, string][] = [
    ["Vencimento", formatarData(fatura.data_vencimento)],
    [
      fatura.valor_pago > 0 && !fatura.pago ? "Saldo restante" : "Valor",
      formatarMoeda(saldoRestante),
    ],
    [
      fatura.pago ? "Pago em" : "Forma de pagamento",
      fatura.pago ? formatarData(fatura.data_pagamento) : "PIX",
    ],
  ];
  cards.forEach(([rotulo, valor], indice) => {
    const x = xEsq + indice * larguraCard + 10;
    pdf.escreverTexto(rotulo, x, cursorY + 10, { tamanho: 7, cor: MUTED });
    pdf.escreverTexto(valor, x, cursorY + 24, { fonte: "bold", tamanho: 11, cor: INK });
    if (indice > 0) {
      pdf.desenharRetangulo(xEsq + indice * larguraCard, cursorY, 1, ALTURA_CARDS, "#d8dee7");
    }
  });
  cursorY += ALTURA_CARDS + 22;

  // Bloco Pix — só quando a fatura ainda não está paga, mesma condição do
  // FaturaCard.tsx. QR code gerado aqui no servidor (mesma lib `qrcode` já
  // usada no cliente), a partir do Copia e Cola já salvo na fatura ou
  // gerado na hora com os mesmos dados da chave Pix da Loja.
  const copiaCola =
    fatura.pix_copia_cola ||
    (fatura.forma_cobranca && fatura.pix_chave && fatura.pix_nome_beneficiario && fatura.pix_cidade
      ? gerarPixCopiaCola({
          chave: fatura.pix_chave,
          nomeBeneficiario: fatura.pix_nome_beneficiario,
          cidade: fatura.pix_cidade,
          valor: saldoRestante,
          txid: fatura.id.replace(/-/g, "").slice(0, 25),
        })
      : null);

  if (!fatura.pago && copiaCola) {
    const ALTURA_QR = 110;
    pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, ALTURA_QR + 20, "#f2f4f8");
    pdf.escreverTexto("Pague com Pix", xEsq + 10, cursorY + 14, {
      fonte: "bold",
      tamanho: 9.5,
      cor: INK,
    });
    pdf.escreverTexto(
      "Abra o app do seu banco, escaneie o QR Code ou copie o código Pix Copia e Cola abaixo.",
      xEsq + 10,
      cursorY + 28,
      { tamanho: 7.3, cor: MUTED },
    );
    let yTextoPix = cursorY + 42;
    if (fatura.pix_chave) {
      pdf.escreverTexto(`Chave PIX: ${fatura.pix_chave}`, xEsq + 10, yTextoPix, {
        tamanho: 7.5,
        cor: INK,
      });
      yTextoPix += 12;
    }
    pdf.escreverTexto(
      `Favorecido: ${fatura.pix_nome_beneficiario || nomeLoja}`,
      xEsq + 10,
      yTextoPix,
      { tamanho: 7.5, cor: INK },
    );
    yTextoPix += 14;
    pdf.escreverTexto("PIX Copia e Cola", xEsq + 10, yTextoPix, {
      fonte: "bold",
      tamanho: 7.5,
      cor: INK,
    });
    yTextoPix += 12;
    const larguraTextoPix = larguraUtil - 150;
    const caracteresPorLinha = Math.max(20, Math.floor(larguraTextoPix / 3.9));
    for (const linha of quebrarLinhas(copiaCola, caracteresPorLinha).slice(0, 4)) {
      pdf.escreverTexto(linha, xEsq + 10, yTextoPix, { tamanho: 6.6, cor: NAVY_DEEP });
      yTextoPix += 10;
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(copiaCola, { margin: 1, width: 220 });
      const qrPreparado = pdf.prepararImagem(qrDataUrl);
      if (qrPreparado) {
        const TAMANHO_QR = ALTURA_QR - 10;
        pdf.desenharImagem(
          qrPreparado.indice,
          xDir - TAMANHO_QR - 10,
          cursorY + 10,
          TAMANHO_QR,
          TAMANHO_QR,
        );
      }
    } catch {
      // QR code não gerou — o Copia e Cola em texto acima já basta pra pagar.
    }
    cursorY += ALTURA_QR + 20 + 16;
  }

  pdf.escreverTextoEmTodasPaginas(
    `Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`,
    xEsq,
    pdf.alturaPagina - 26,
    { tamanho: 7, cor: "#8b95a5" },
  );

  return pdf.finalizar();
}
