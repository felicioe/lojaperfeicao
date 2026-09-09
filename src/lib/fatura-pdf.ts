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
//
// gerarFaturasAgrupadasPdfBuffer (issue do usuário) reaproveita o mesmo
// cabeçalho/bloco Pix desta única fatura — antes, "Faturas agrupadas"
// (tesouraria/faturas/imprimir.tsx) só tinha window.print() da página web
// (FaturaAgrupadaCard.tsx), com um visual bem diferente do PDF de verdade
// que a fatura avulsa já tinha. Fatorar os blocos comuns aqui, em vez de
// duplicar tudo de novo pro caso agrupado, evita que as duas versões
// divirjam visualmente de novo no futuro.

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

// Favorecido/Pagador ficam lado a lado na mesma linha (ver bloco abaixo) —
// sem truncar, o nome completo da Loja (geralmente a razão social, bem
// longa) invade visualmente a coluna do pagador. Mesma lógica de
// truncarTexto de relatorio-export.ts (não exportada de lá), adaptada pra
// um limite fixo de caracteres em vez de largura de coluna calculada.
function truncarTexto(texto: string, maxCaracteres: number): string {
  if (texto.length <= maxCaracteres) return texto;
  if (maxCaracteres <= 1) return texto.slice(0, maxCaracteres);
  return `${texto.slice(0, maxCaracteres - 1)}…`;
}

type ContextoPagina = { xEsq: number; xDir: number; larguraUtil: number; nomeLoja: string };

// Cabeçalho institucional (logos + nome da Loja) + faixa de status —
// idêntico entre fatura avulsa e agrupada, só o texto da faixa muda.
function desenharCabecalho(
  pdf: PdfSimplesPaisagem,
  loja: LojaParaPdf,
  logos: LogoInstitucional[],
  statusTexto: string,
): ContextoPagina & { cursorY: number } {
  const xEsq = pdf.margem;
  const xDir = pdf.larguraPagina - pdf.margem;
  const larguraUtil = xDir - xEsq;
  let cursorY = pdf.margem;

  const logosPreparados = logos
    .map((logo) => pdf.prepararImagem(logo.logoUrl))
    .filter((r): r is { indice: number; largura: number; altura: number } => r !== null);
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

  pdf.desenharRetangulo(xEsq, cursorY - 14, larguraUtil, 18, NAVY);
  pdf.escreverTexto(statusTexto, xEsq + 8, cursorY - 10, {
    tamanho: 7.5,
    cor: "#ffffff",
    fonte: "bold",
  });
  cursorY += 16;

  return { xEsq, xDir, larguraUtil, nomeLoja, cursorY };
}

// Bloco Favorecido/Pagador lado a lado — idêntico entre os dois modelos.
function desenharFavorecidoPagador(
  pdf: PdfSimplesPaisagem,
  ctx: ContextoPagina,
  cursorYInicial: number,
  loja: LojaParaPdf,
  irmaoNome: string | null,
  irmaoCim: string | null,
): number {
  const { xEsq, larguraUtil, nomeLoja } = ctx;
  let cursorY = cursorYInicial;
  const larguraColuna2 = larguraUtil / 2;
  pdf.escreverTexto("FAVORECIDO", xEsq, cursorY, { fonte: "bold", tamanho: 7, cor: MUTED });
  pdf.escreverTexto("PAGADOR", xEsq + larguraColuna2, cursorY, {
    fonte: "bold",
    tamanho: 7,
    cor: MUTED,
  });
  cursorY += 12;
  // Nome institucional costuma ser a razão social por extenso (bem longa,
  // em caixa alta) — sem truncar aqui, invade visualmente a coluna do
  // pagador ao lado (já aconteceu no teste com "ASSOCIACAO CAPITULAR
  // ADONHIRAMITA AO VALE DE ITAJAI").
  const CARACTERES_COLUNA_2 = 40;
  pdf.escreverTexto(truncarTexto(nomeLoja, CARACTERES_COLUNA_2), xEsq, cursorY, {
    fonte: "bold",
    tamanho: 9,
    cor: INK,
  });
  pdf.escreverTexto(
    truncarTexto(irmaoNome ?? "—", CARACTERES_COLUNA_2),
    xEsq + larguraColuna2,
    cursorY,
    { fonte: "bold", tamanho: 9, cor: INK },
  );
  cursorY += 12;
  if (loja.cnpj) {
    pdf.escreverTexto(`CNPJ ${loja.cnpj}`, xEsq, cursorY, { tamanho: 7.5, cor: MUTED });
  }
  if (irmaoCim) {
    pdf.escreverTexto(`CIM ${irmaoCim}`, xEsq + larguraColuna2, cursorY, {
      tamanho: 7.5,
      cor: MUTED,
    });
  }
  return cursorY + 22;
}

// Bloco "Pague com Pix" (texto + Copia e Cola + QR) — idêntico entre os
// dois modelos, só o valor/txid/observação de rodapé mudam.
async function desenharBlocoPix(
  pdf: PdfSimplesPaisagem,
  ctx: ContextoPagina,
  cursorYInicial: number,
  copiaCola: string,
  pixChave: string | null,
  pixNomeBeneficiario: string | null,
  observacaoExtra?: string,
): Promise<number> {
  const { xEsq, xDir, larguraUtil, nomeLoja } = ctx;
  const cursorY = cursorYInicial;
  const ALTURA_QR = 110;
  pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, ALTURA_QR + 20, "#f2f4f8");
  pdf.escreverTexto("Pague com Pix", xEsq + 10, cursorY + 14, {
    fonte: "bold",
    tamanho: 9.5,
    cor: INK,
  });
  const instrucao = observacaoExtra
    ? `Abra o app do seu banco, escaneie o QR Code ou copie o código Pix Copia e Cola abaixo. ${observacaoExtra}`
    : "Abra o app do seu banco, escaneie o QR Code ou copie o código Pix Copia e Cola abaixo.";
  pdf.escreverTexto(instrucao, xEsq + 10, cursorY + 28, { tamanho: 7.3, cor: MUTED });
  let yTextoPix = cursorY + 42;
  if (pixChave) {
    pdf.escreverTexto(`Chave PIX: ${pixChave}`, xEsq + 10, yTextoPix, {
      tamanho: 7.5,
      cor: INK,
    });
    yTextoPix += 12;
  }
  pdf.escreverTexto(`Favorecido: ${pixNomeBeneficiario || nomeLoja}`, xEsq + 10, yTextoPix, {
    tamanho: 7.5,
    cor: INK,
  });
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

  return cursorY + ALTURA_QR + 20 + 16;
}

function rodape(pdf: PdfSimplesPaisagem, xEsq: number) {
  pdf.escreverTextoEmTodasPaginas(
    `Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`,
    xEsq,
    pdf.alturaPagina - 26,
    { tamanho: 7, cor: "#8b95a5" },
  );
}

export async function gerarFaturaPdfBuffer(
  fatura: LancamentoDetalhe,
  loja: LojaParaPdf,
  logos: LogoInstitucional[],
): Promise<Buffer> {
  const pdf = new PdfSimplesPaisagem("retrato");
  const statusTexto = fatura.pago
    ? "Fatura quitada"
    : "Documento gerado eletronicamente pelo sistema — pagamento exclusivo via Pix";
  const ctx = desenharCabecalho(pdf, loja, logos, statusTexto);
  const { xEsq, xDir, larguraUtil } = ctx;
  let cursorY = ctx.cursorY;

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

  cursorY = desenharFavorecidoPagador(pdf, ctx, cursorY, loja, fatura.irmao_nome, fatura.irmao_cim);

  // Referente a.
  pdf.escreverTexto("REFERENTE A", xEsq, cursorY, { fonte: "bold", tamanho: 7, cor: MUTED });
  cursorY += 12;
  pdf.escreverTexto(truncarTexto(fatura.descricao, 85), xEsq, cursorY, {
    fonte: "bold",
    tamanho: 9,
    cor: INK,
  });
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
    cursorY = await desenharBlocoPix(
      pdf,
      ctx,
      cursorY,
      copiaCola,
      fatura.pix_chave,
      fatura.pix_nome_beneficiario,
    );
  }

  rodape(pdf, xEsq);

  return pdf.finalizar();
}

// Impressão agrupada de 2+ faturas do mesmo irmão numa única página (issue
// #318), com PDF de verdade em vez de window.print() da página web — antes
// só existia a versão HTML imprimível (FaturaAgrupadaCard.tsx), com visual
// bem diferente do PDF de uma fatura avulsa (issue do usuário). Mesmo
// cabeçalho/bloco Pix da fatura avulsa (desenharCabecalho/
// desenharFavorecidoPagador/desenharBlocoPix acima); só a seção de itens e
// o Pix somado são específicos daqui — mesmo cálculo de totalSaldo/txid
// agrupado (`G${id}`) que o FaturaAgrupadaCard já usa no cliente.
export async function gerarFaturasAgrupadasPdfBuffer(
  faturas: LancamentoDetalhe[],
  loja: LojaParaPdf,
  logos: LogoInstitucional[],
): Promise<Buffer> {
  const pdf = new PdfSimplesPaisagem("retrato");
  const primeira = faturas[0];
  const ctx = desenharCabecalho(
    pdf,
    loja,
    logos,
    "Documento gerado eletronicamente pelo sistema — pagamento exclusivo via Pix",
  );
  const { xEsq, xDir, larguraUtil } = ctx;
  let cursorY = ctx.cursorY;

  pdf.escreverTexto("Fatura da Associação", xEsq, cursorY, {
    fonte: "bold",
    tamanho: 15,
    cor: INK,
  });
  cursorY += 14;
  pdf.escreverTexto(
    `${faturas.length} faturas agrupadas — documento para pagamento`,
    xEsq,
    cursorY,
    { tamanho: 8.5, cor: MUTED },
  );
  const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  pdf.escreverTexto(`Emitida em ${hoje}`, xDir - 140, cursorY, { tamanho: 7.5, cor: MUTED });
  cursorY += 20;
  pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, 1, "#d8dee7");
  cursorY += 18;

  cursorY = desenharFavorecidoPagador(
    pdf,
    ctx,
    cursorY,
    loja,
    primeira.irmao_nome,
    primeira.irmao_cim,
  );

  // Itens agrupados — uma linha por fatura, com quebra de página se a lista
  // não couber na página atual (mesmo critério de checagem de espaço já
  // usado em relatorio-export.ts).
  pdf.escreverTexto("ITENS AGRUPADOS", xEsq, cursorY, { fonte: "bold", tamanho: 7, cor: MUTED });
  cursorY += 14;
  // 28px não dava espaço suficiente pro texto de competência/vencimento
  // (tamanho 7, desenhado em cursorY+22): como escreverTexto usa yTopo como
  // topo da caixa da fonte, esse texto ocupa visualmente até ~cursorY+29,
  // ultrapassando a linha divisória do item seguinte (cursorY+28) e cortando
  // o texto ao meio. 36px + offsets revisados dão folga real entre as linhas.
  const ALTURA_LINHA_ITEM = 36;
  for (const fatura of faturas) {
    if (cursorY + ALTURA_LINHA_ITEM > pdf.alturaPagina - 40) {
      pdf.novaPagina();
      cursorY = pdf.margem;
    }
    pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, 1, "#eef1f5");
    pdf.escreverTexto(truncarTexto(fatura.descricao, 70), xEsq, cursorY + 13, {
      fonte: "bold",
      tamanho: 8.5,
      cor: INK,
    });
    const subinfo = fatura.competencia_mes
      ? `Competência ${formatarMesAno(fatura.competencia_mes)} · Vencimento ${formatarData(fatura.data_vencimento)}`
      : `Vencimento ${formatarData(fatura.data_vencimento)}`;
    pdf.escreverTexto(subinfo, xEsq, cursorY + 25, { tamanho: 7, cor: MUTED });
    const saldoItem = Number(fatura.valor) - Number(fatura.valor_pago);
    pdf.escreverTexto(formatarMoeda(saldoItem), xDir - 80, cursorY + 19, {
      fonte: "bold",
      tamanho: 9,
      cor: INK,
    });
    cursorY += ALTURA_LINHA_ITEM;
  }
  cursorY += 8;

  // Total a pagar.
  const totalSaldo = faturas.reduce((s, f) => s + (Number(f.valor) - Number(f.valor_pago)), 0);
  const ALTURA_TOTAL = 32;
  pdf.desenharRetangulo(xEsq, cursorY, larguraUtil, ALTURA_TOTAL, "#f2f4f8");
  pdf.escreverTexto("Total a pagar", xEsq + 10, cursorY + 20, {
    fonte: "bold",
    tamanho: 9.5,
    cor: INK,
  });
  pdf.escreverTexto(formatarMoeda(totalSaldo), xDir - 100, cursorY + 20, {
    fonte: "bold",
    tamanho: 12,
    cor: INK,
  });
  cursorY += ALTURA_TOTAL + 22;

  // Pix somado — mesmo cálculo do FaturaAgrupadaCard.tsx: valor total das
  // faturas, txid próprio prefixado com "G" pra não colidir com o Copia e
  // Cola de nenhuma fatura individual.
  const copiaCola =
    primeira.pix_copia_cola ||
    (primeira.forma_cobranca &&
    primeira.pix_chave &&
    primeira.pix_nome_beneficiario &&
    primeira.pix_cidade
      ? gerarPixCopiaCola({
          chave: primeira.pix_chave,
          nomeBeneficiario: primeira.pix_nome_beneficiario,
          cidade: primeira.pix_cidade,
          valor: totalSaldo,
          txid: `G${primeira.id.replace(/-/g, "")}`.slice(0, 25),
        })
      : null);

  if (copiaCola) {
    if (cursorY + 150 > pdf.alturaPagina - 40) {
      pdf.novaPagina();
      cursorY = pdf.margem;
    }
    cursorY = await desenharBlocoPix(
      pdf,
      ctx,
      cursorY,
      copiaCola,
      primeira.pix_chave,
      primeira.pix_nome_beneficiario,
      "Um único pagamento quita todas as faturas listadas.",
    );
  }

  rodape(pdf, xEsq);

  return pdf.finalizar();
}
