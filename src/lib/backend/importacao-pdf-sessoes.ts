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
// cedido, confraternização) são detectados e viram evento (não sessão).
// "INICIAÇÃO DO GRAU N" vira sessão do tipo iniciação. Responsáveis
// (padrão "Ir.: NOME (Apelido)") são extraídos e casados contra o
// cadastro de irmãos — o casamento é só sugestão, sempre revisável no
// preview antes de confirmar.
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
const INICIACAO_RE = /INICIA[ÇC][ÃA]O/i;

// "Ir.: NOME (Apelido)" — o nome civil vem sempre em CAIXA ALTA no
// documento (o apelido, não — ver grupo 2). Exigir maiúsculas no nome
// evita casar com trechos de título de peça de arquitetura tipo "A
// caverna de Jabulum (Abiram)" — que também tem maiúscula inicial + "(" —
// e, de quebra, torna impossível o nome engolir o próprio marcador
// "Ir./IIr." (que é sempre minúsculo depois do primeiro "I").
const NOME_APELIDO_RE = /([A-ZÀ-Ý][A-ZÀ-Ý\- ]{2,60}?)\s*\(([^()]{2,60})\)/g;
const MARCADOR_RESPONSAVEL_FIM_RE = /I{1,2}r\.?:?\s*$/;

function tituloAviso(texto: string): string {
  if (/SUSPENSA/i.test(texto)) return "Sessão suspensa";
  if (/FERIADO/i.test(texto)) return "Feriado";
  if (/CEDIDO/i.test(texto)) return "Templo cedido";
  if (/INSTALA[ÇC][ÃA]O/i.test(texto)) return "Instalação de outra loja";
  if (/CONFRATERNIZA[ÇC][ÃA]O/i.test(texto)) return "Confraternização";
  return "Aviso do cronograma";
}

export type ResponsavelExtraido = {
  nomeExtraido: string;
  apelidoExtraido: string | null;
  atividade: string | null;
};

/** Extrai a lista "Ir.: NOME (Apelido)" de um bloco, casando cada nome com o
 * texto (peça de arquitetura / fala / iniciação) que imediatamente o precede
 * — quando duas ou mais pessoas dividem o mesmo "Ir.:" (lista separada por
 * vírgula/"e"), a atividade da anterior é repetida pra elas. */
export function extrairResponsaveis(texto: string): ResponsavelExtraido[] {
  const resultado: ResponsavelExtraido[] = [];
  let cursor = 0;
  let ultimaAtividade: string | null = null;
  for (const m of texto.matchAll(NOME_APELIDO_RE)) {
    const nomeExtraido = m[1].replace(/\s+/g, " ").trim();
    const apelidoExtraido = m[2].replace(/\s+/g, " ").trim() || null;
    const inicioMatch = m.index ?? 0;
    if (!nomeExtraido.includes(" ")) {
      // uma palavra só antes de "(" quase sempre é falso positivo (não é nome de irmão)
      cursor = inicioMatch + m[0].length;
      continue;
    }
    let bruto = texto.slice(cursor, inicioMatch).replace(MARCADOR_RESPONSAVEL_FIM_RE, "").trim();
    bruto = bruto
      .replace(/^[,;.]+\s*/, "")
      .replace(/\s+e\s*$/i, "")
      .trim();
    const atividade: string | null = bruto.length >= 8 ? bruto.slice(0, 300) : ultimaAtividade;
    if (atividade) ultimaAtividade = atividade;
    resultado.push({ nomeExtraido, apelidoExtraido, atividade });
    cursor = inicioMatch + m[0].length;
  }
  return resultado;
}

export type ItemPdf = {
  data: string;
  grau: number | null;
  aviso: boolean;
  tipo: "ordinaria" | "iniciacao";
  resumo: string;
  textoCompleto: string;
  responsaveis: ResponsavelExtraido[];
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
      // "-- N of M --" (marcador de página) e linhas de assinatura
      // (sequências de "_"/"/") são furniture do PDF, não conteúdo — limpa
      // antes de extrair responsáveis pra não confundir o parser quando a
      // tabela quebra em cima de uma dessas marcas.
      .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, " ")
      .replace(/[_/]{3,}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!textoCompleto) continue;

    const grauMatch = textoCompleto.match(/GRAU\s*(\d{1,2})/i);
    const aviso = AVISO_RE.test(textoCompleto);
    const tipo: ItemPdf["tipo"] =
      !aviso && INICIACAO_RE.test(textoCompleto) ? "iniciacao" : "ordinaria";

    itens.push({
      data: `${ano}-${mes}-${dia}`,
      grau: grauMatch ? Number(grauMatch[1]) : null,
      aviso,
      tipo,
      resumo: textoCompleto.slice(0, 140),
      textoCompleto,
      responsaveis: aviso ? [] : extrairResponsaveis(textoCompleto),
    });
  }
  return itens;
}

function normalizarNome(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function melhorCandidato(
  responsavel: ResponsavelExtraido,
  irmaos: { id: string; nome_civil: string; nome_simbolico: string | null }[],
): string | null {
  const nomeNorm = normalizarNome(responsavel.nomeExtraido);
  const apelidoNorm = responsavel.apelidoExtraido
    ? normalizarNome(responsavel.apelidoExtraido)
    : null;
  for (const i of irmaos) {
    if (normalizarNome(i.nome_civil) === nomeNorm) return i.id;
  }
  if (apelidoNorm) {
    for (const i of irmaos) {
      if (i.nome_simbolico && normalizarNome(i.nome_simbolico) === apelidoNorm) return i.id;
    }
  }
  // aproximação por sobreposição de palavras do nome civil (ex.: nome do PDF
  // sem um sobrenome do meio) — só aceita se a sobreposição for muito alta.
  const tokensExt = new Set(nomeNorm.split(" ").filter((t) => t.length > 1));
  let melhorId: string | null = null;
  let melhorPontuacao = 0;
  for (const i of irmaos) {
    const tokensCivil = new Set(
      normalizarNome(i.nome_civil)
        .split(" ")
        .filter((t) => t.length > 1),
    );
    const intersecao = [...tokensExt].filter((t) => tokensCivil.has(t)).length;
    const uniao = new Set([...tokensExt, ...tokensCivil]).size;
    const pontuacao = uniao ? intersecao / uniao : 0;
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhorId = i.id;
    }
  }
  return melhorPontuacao >= 0.75 ? melhorId : null;
}

const previewSchema = z.object({
  orgId: z.string().uuid(),
  arquivoBase64: z.string().min(1),
});

export type ResponsavelPreview = ResponsavelExtraido & { irmaoIdSugerido: string | null };

export type ItemPreviewPdf = Omit<ItemPdf, "responsaveis"> & {
  responsaveis: ResponsavelPreview[];
  categoria: "sessao" | "evento" | "bloqueado";
  titulo: string | null;
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

  const [irmaosRows] = await conn.query<RowDataPacket[]>(
    "SELECT id, nome_civil, nome_simbolico FROM irmaos",
  );
  const irmaos = irmaosRows as { id: string; nome_civil: string; nome_simbolico: string | null }[];

  const resultado: ItemPreviewPdf[] = [];
  for (const item of itens) {
    const responsaveis: ResponsavelPreview[] = item.responsaveis.map((r) => ({
      ...r,
      irmaoIdSugerido: melhorCandidato(r, irmaos),
    }));

    if (item.aviso) {
      const titulo = tituloAviso(item.textoCompleto);
      const [[dup]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM eventos WHERE data = ? AND org_id = ? AND titulo = ? LIMIT 1",
        [item.data, orgId, titulo],
      );
      resultado.push({
        ...item,
        responsaveis,
        categoria: "evento",
        titulo,
        importavel: !dup,
        motivoBloqueio: null,
        duplicado: !!dup,
      });
      continue;
    }
    if (item.grau === null) {
      resultado.push({
        ...item,
        responsaveis,
        categoria: "bloqueado",
        titulo: null,
        importavel: false,
        motivoBloqueio: "Grau não identificado no texto",
        duplicado: false,
      });
      continue;
    }
    if (item.grau < org.grau_min || item.grau > org.grau_max) {
      resultado.push({
        ...item,
        responsaveis,
        categoria: "bloqueado",
        titulo: null,
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
    resultado.push({
      ...item,
      responsaveis,
      categoria: "sessao",
      titulo: null,
      importavel: !dup,
      motivoBloqueio: null,
      duplicado: !!dup,
    });
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
      categoria: z.enum(["sessao", "evento"]),
      data: z.string(),
      grau: z.number().int().positive().nullable(),
      tipo: z.enum(["ordinaria", "iniciacao"]),
      titulo: z.string().nullable(),
      textoCompleto: z.string(),
      responsaveis: z.array(
        z.object({
          nomeExtraido: z.string(),
          apelidoExtraido: z.string().nullable(),
          atividade: z.string().nullable(),
          irmaoId: z.string().uuid().nullable(),
        }),
      ),
    }),
  ),
});

export type ResumoImportacaoPdf = { sessoesCriadas: number; eventosCriados: number };

export const confirmarImportacaoPdfSessoes = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmarSchema.parse(d))
  .handler(async ({ data }): Promise<ResumoImportacaoPdf> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      let sessoesCriadas = 0;
      let eventosCriados = 0;
      for (const item of data.itens) {
        if (item.categoria === "evento") {
          const [[dup]] = await conn.query<RowDataPacket[]>(
            "SELECT id FROM eventos WHERE data = ? AND org_id = ? AND titulo = ? LIMIT 1",
            [item.data, data.orgId, item.titulo],
          );
          if (dup) continue;
          await conn.query(
            "INSERT INTO eventos (titulo, data, descricao, publico, org_id) VALUES (?, ?, ?, 'org', ?)",
            [item.titulo, item.data, item.textoCompleto, data.orgId],
          );
          eventosCriados++;
          continue;
        }

        if (!item.grau) continue;
        const [[dup]] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM sessoes WHERE data = ? AND org_id = ? LIMIT 1",
          [item.data, data.orgId],
        );
        if (dup) continue;

        const sessaoId = crypto.randomUUID();
        await conn.query(
          "INSERT INTO sessoes (id, data, tipo, org_id, grau, observacoes) VALUES (?, ?, ?, ?, ?, ?)",
          [sessaoId, item.data, item.tipo, data.orgId, item.grau, item.textoCompleto],
        );
        for (const r of item.responsaveis) {
          await conn.query(
            "INSERT INTO sessao_responsaveis (sessao_id, irmao_id, nome_extraido, apelido_extraido, atividade) VALUES (?, ?, ?, ?, ?)",
            [sessaoId, r.irmaoId, r.nomeExtraido, r.apelidoExtraido, r.atividade],
          );
        }
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
          eventos_criados: eventosCriados,
        },
      );
      return { sessoesCriadas, eventosCriados };
    });
  });
