import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

const execFileAsync = promisify(execFile);

const PAPEIS_ESCRITA = ["admin", "secretario"];
const CATEGORIAS_DOCUMENTO = [
  "documentos_loja",
  "legislacao",
  "tratados_corporacoes",
  "tratados_orientes",
  "ensino",
  "documentos_historicos",
  "rituais_antigos",
  "formularios",
  "tabela_valores_sgcab",
  "historia_rito",
] as const;

export type Documento = {
  id: string;
  titulo: string;
  categoria: string;
  conteudo: string;
  tem_arquivo: boolean;
  arquivo_nome_original: string | null;
  arquivo_mime: string | null;
  criado_por: string;
  criador_nome: string | null;
  criado_em: string;
};

// .docx/.doc não têm visualização inline no navegador como PDF — essa
// tabela mapeia o MIME pra extensão esperada pelo LibreOffice headless na
// conversão (issue do usuário: upload de DOC/DOCX com prévia em PDF).
const EXTENSAO_CONVERSIVEL_POR_MIME: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
};

// Gera uma versão em PDF do arquivo via LibreOffice headless, só pra
// servir de prévia navegável — o original enviado (arquivo_url) nunca
// depende disso. Retorna null (nunca lança) quando o binário "soffice"
// não está disponível no processo Node (não confirmado se a Hostinger,
// hosting compartilhado, tem LibreOffice instalado), quando a conversão
// estoura o timeout, ou quando o arquivo está corrompido — nesses casos o
// upload do original continua funcionando normalmente, só sem prévia.
async function converterParaPdfSeDisponivel(buffer: Buffer, mime: string): Promise<string | null> {
  const extensao = EXTENSAO_CONVERSIVEL_POR_MIME[mime];
  if (!extensao) return null; // já é PDF (ou outro formato sem conversor) — nada a fazer
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "doc-pdf-"));
    const entrada = path.join(dir, `arquivo.${extensao}`);
    await writeFile(entrada, buffer);
    await execFileAsync(
      "soffice",
      ["--headless", "--convert-to", "pdf", "--outdir", dir, entrada],
      { timeout: 60_000 },
    );
    const pdfBuffer = await readFile(path.join(dir, "arquivo.pdf"));
    return `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// achado: listar documentos trazia arquivo_url (o PDF inteiro em base64,
// LONGTEXT) de TODOS os documentos da loja em toda visita à página — a
// lista trava/falha ("Não foi possível carregar os documentos") assim que
// o acervo acumula PDFs grandes, porque o payload da resposta cresce junto
// com CADA arquivo enviado, mesmo quando o usuário só quer ver a lista de
// títulos. arquivo_url só é buscado agora sob demanda, um documento por
// vez, em obterArquivoDocumento — a lista traz só um booleano.
const DOCUMENTO_SELECT = `
  SELECT d.id, d.titulo, d.categoria, d.conteudo,
         (d.arquivo_url IS NOT NULL AND d.arquivo_url <> '') AS tem_arquivo,
         d.arquivo_nome_original, d.arquivo_mime, d.criado_por,
         u.nome_completo AS criador_nome, d.criado_em
  FROM documentos d
  LEFT JOIN usuarios u ON u.id = d.criado_por AND u.loja_id = @current_loja_id
  WHERE d.loja_id = @current_loja_id
`;

export const listarDocumentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Documento[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `${DOCUMENTO_SELECT} ORDER BY d.criado_em DESC`,
      );
      return rows.map((row) => ({ ...row, tem_arquivo: !!row.tem_arquivo }) as Documento);
    });
  },
);

// Busca o arquivo (base64) de UM documento por vez, sob demanda — ver nota
// em DOCUMENTO_SELECT sobre por que a lista não traz mais isso.
// arquivoPdfUrl é a prévia convertida (null se o original já é PDF, ou se
// a conversão não rodou/falhou no upload) — ver converterParaPdfSeDisponivel.
export const obterArquivoDocumento = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(
    async ({ data }): Promise<{ arquivoUrl: string | null; arquivoPdfUrl: string | null }> => {
      return comSessao(async (conn) => {
        const [[row]] = await conn.query<RowDataPacket[]>(
          "SELECT arquivo_url, arquivo_pdf_url FROM documentos WHERE id = ? AND loja_id = @current_loja_id",
          [data.id],
        );
        if (!row) throw new Error("Documento não encontrado nesta Loja.");
        return {
          arquivoUrl: row.arquivo_url || null,
          arquivoPdfUrl: row.arquivo_pdf_url || null,
        };
      });
    },
  );

const criarDocumentoSchema = z.object({
  titulo: z.string().min(1),
  categoria: z.string().min(1),
  conteudo: z.string().min(1),
  arquivoUrl: z.string().nullable().optional(),
  arquivoNomeOriginal: z.string().nullable().optional(),
  arquivoMime: z.string().nullable().optional(),
  arquivoPdfUrl: z.string().nullable().optional(),
});

export const criarDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarDocumentoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId, lojaId) => {
      const id = crypto.randomUUID();
      await conn.query(
        `INSERT INTO documentos
           (id, loja_id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, arquivo_pdf_url, criado_por)
         VALUES (?, ?, ?, ?, ?, SHA2(CONCAT(?, ?), 256), ?, ?, ?, ?, ?)`,
        [
          id,
          lojaId,
          data.titulo,
          data.categoria,
          data.conteudo,
          data.titulo,
          data.arquivoUrl || "",
          data.arquivoUrl || null,
          data.arquivoNomeOriginal || null,
          data.arquivoMime || null,
          data.arquivoPdfUrl || null,
          usuarioId,
        ],
      );
      await registrarAuditoria(conn, usuarioId, "criar", "documento", id, null, {
        titulo: data.titulo,
        categoria: data.categoria,
        arquivo_nome_original: data.arquivoNomeOriginal || null,
      });
      return { id };
    });
  });

const atualizarDocumentoSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().trim().min(1).max(255),
  categoria: z.enum(CATEGORIAS_DOCUMENTO),
  anoReferencia: z.number().int().min(1800).max(2200).nullable(),
});

export const atualizarDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => atualizarDocumentoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId) => {
      const [[documento]] = await conn.query<RowDataPacket[]>(
        "SELECT titulo, categoria FROM documentos WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (!documento) throw new Error("Documento não encontrado.");

      const categoriaDestino =
        data.categoria === "legislacao" && data.anoReferencia
          ? `legislacao:${data.anoReferencia}`
          : data.categoria;
      await conn.query(
        "UPDATE documentos SET titulo = ?, categoria = ? WHERE id = ? AND loja_id = @current_loja_id",
        [data.titulo, categoriaDestino, data.id],
      );
      await registrarAuditoria(conn, usuarioId, "atualizar", "documento", data.id, documento, {
        titulo: data.titulo,
        categoria: categoriaDestino,
      });
    });
  });

export const excluirDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioId) => {
      const [[documento]] = await conn.query<RowDataPacket[]>(
        "SELECT titulo, hash_conteudo, criado_por FROM documentos WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (!documento) throw new Error("Documento não encontrado nesta Loja.");
      await conn.query("DELETE FROM documentos WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioId, "excluir", "documento", data.id, documento);
    });
  });

// Upload do arquivo anexo (PDF): guarda o conteúdo como data URL direto na
// coluna (documentos.arquivo_url é LONGTEXT, migração 0117) em vez de
// gravar em disco — mesmo motivo e mesma correção de uploadArquivoPeca.
const uploadArquivoSchema = z.object({
  nomeArquivo: z.string().min(1),
  dataUrl: z.string().startsWith("data:"),
});

// Issue do usuário — upload de .docx/.doc em Documentos, além de PDF. O
// original é sempre preservado (download/compartilhamento continuam no
// formato enviado); a conversão pra PDF é só uma prévia opcional, ver
// converterParaPdfSeDisponivel.
const MIME_AUTORIZADOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
];
const TAMANHO_MAXIMO_BYTES = 60 * 1024 * 1024; // 60 MB — arquivo_url é LONGTEXT (até 4 GB, migração 0117).

export const uploadArquivoDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadArquivoSchema.parse(d))
  .handler(
    async ({
      data,
    }): Promise<{ url: string; nomeOriginal: string; mime: string; pdfUrl: string | null }> => {
      return comPapel(PAPEIS_ESCRITA, async () => {
        const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) throw new Error("Arquivo inválido.");
        const mime = match[1];
        if (!MIME_AUTORIZADOS.includes(mime)) {
          throw new Error("Formato não aceito — envie um arquivo PDF, DOC ou DOCX.");
        }
        const buffer = Buffer.from(match[2], "base64");
        if (buffer.byteLength > TAMANHO_MAXIMO_BYTES) {
          throw new Error("Arquivo maior que 60 MB.");
        }
        const pdfUrl = await converterParaPdfSeDisponivel(buffer, mime);
        return {
          url: data.dataUrl,
          nomeOriginal: data.nomeArquivo,
          mime,
          pdfUrl,
        };
      });
    },
  );
