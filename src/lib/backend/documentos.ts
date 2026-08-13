import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

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
  arquivo_url: string | null;
  arquivo_nome_original: string | null;
  arquivo_mime: string | null;
  criado_por: string;
  criador_nome: string | null;
  criado_em: string;
};

const DOCUMENTO_SELECT = `
  SELECT d.id, d.titulo, d.categoria, d.conteudo, d.arquivo_url,
         d.arquivo_nome_original, d.arquivo_mime, d.criado_por,
         u.nome_completo AS criador_nome, d.criado_em
  FROM documentos d
  LEFT JOIN usuarios u ON u.id = d.criado_por
`;

export const listarDocumentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Documento[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `${DOCUMENTO_SELECT} ORDER BY d.criado_em DESC`,
      );
      return rows as Documento[];
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
});

export const criarDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarDocumentoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId) => {
      const id = crypto.randomUUID();
      await conn.query(
        `INSERT INTO documentos
           (id, titulo, categoria, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
         VALUES (?, ?, ?, ?, SHA2(CONCAT(?, ?), 256), ?, ?, ?, ?)`,
        [
          id,
          data.titulo,
          data.categoria,
          data.conteudo,
          data.titulo,
          data.arquivoUrl || "",
          data.arquivoUrl || null,
          data.arquivoNomeOriginal || null,
          data.arquivoMime || null,
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
        "SELECT titulo, categoria FROM documentos WHERE id = ?",
        [data.id],
      );
      if (!documento) throw new Error("Documento não encontrado.");

      const categoriaDestino =
        data.categoria === "legislacao" && data.anoReferencia
          ? `legislacao:${data.anoReferencia}`
          : data.categoria;
      await conn.query("UPDATE documentos SET titulo = ?, categoria = ? WHERE id = ?", [
        data.titulo,
        categoriaDestino,
        data.id,
      ]);
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
        "SELECT titulo, hash_conteudo, criado_por FROM documentos WHERE id = ?",
        [data.id],
      );
      await conn.query("DELETE FROM documentos WHERE id = ?", [data.id]);
      await registrarAuditoria(conn, usuarioId, "excluir", "documento", data.id, documento);
    });
  });

// Upload do arquivo anexo (PDF/DOCX): mesmo padrão de uploadArquivoPeca.
const uploadArquivoSchema = z.object({
  nomeArquivo: z.string().min(1),
  dataUrl: z.string().startsWith("data:"),
});

const MIME_AUTORIZADOS = ["application/pdf"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15 MB — hospedagem compartilhada tem disco limitado.

export const uploadArquivoDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadArquivoSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string; nomeOriginal: string; mime: string }> => {
    return comPapel(PAPEIS_ESCRITA, async () => {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Arquivo inválido.");
      const mime = match[1];
      if (!MIME_AUTORIZADOS.includes(mime)) {
        throw new Error("Formato não aceito — envie um arquivo PDF.");
      }
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.byteLength > TAMANHO_MAXIMO_BYTES) {
        throw new Error("Arquivo maior que 15 MB.");
      }
      const nomeSeguro = data.nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
      const dir = join(process.cwd(), "public", "uploads", "documentos");
      await mkdir(dir, { recursive: true });
      const nomeArquivoFinal = `${Date.now()}-${nomeSeguro}`;
      await writeFile(join(dir, nomeArquivoFinal), buffer);
      return {
        url: `/uploads/documentos/${nomeArquivoFinal}`,
        nomeOriginal: data.nomeArquivo,
        mime,
      };
    });
  });
