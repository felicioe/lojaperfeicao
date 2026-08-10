import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel, SemPermissaoError } from "./authz";
import { registrarAuditoria } from "./auditoria";

const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Documento = {
  id: string;
  titulo: string;
  arquivo_url: string | null;
  arquivo_nome_original: string | null;
  arquivo_mime: string | null;
  criado_por: string;
  criador_nome: string | null;
  criado_em: string;
  total_assinaturas: number;
  ja_assinei: boolean;
};

const DOCUMENTO_SELECT = `
  SELECT d.id, d.titulo, d.arquivo_url, d.arquivo_nome_original, d.arquivo_mime,
         d.criado_por, u.nome_completo AS criador_nome, d.criado_em,
         (SELECT COUNT(*) FROM documento_assinaturas da WHERE da.documento_id = d.id) AS total_assinaturas,
         EXISTS(
           SELECT 1 FROM documento_assinaturas da WHERE da.documento_id = d.id AND da.usuario_id = ?
         ) AS ja_assinei
  FROM documentos d
  LEFT JOIN usuarios u ON u.id = d.criado_por
`;

export const listarDocumentos = createServerFn({ method: "GET" }).handler(
  async (): Promise<Documento[]> => {
    return comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `${DOCUMENTO_SELECT} ORDER BY d.criado_em DESC`,
        [usuarioId],
      );
      return rows as Documento[];
    });
  },
);

export type Signatario = { usuario_id: string; nome: string | null; assinado_em: string };

export type DocumentoDetalhe = Documento & {
  conteudo: string;
  hash_conteudo: string;
  signatarios: Signatario[];
};

export const obterDocumento = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<DocumentoDetalhe | null> => {
    return comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT d.*, u.nome_completo AS criador_nome,
                (SELECT COUNT(*) FROM documento_assinaturas da WHERE da.documento_id = d.id) AS total_assinaturas,
                EXISTS(
                  SELECT 1 FROM documento_assinaturas da WHERE da.documento_id = d.id AND da.usuario_id = ?
                ) AS ja_assinei
         FROM documentos d
         LEFT JOIN usuarios u ON u.id = d.criado_por
         WHERE d.id = ?`,
        [usuarioId, data.id],
      );
      const documento = rows[0];
      if (!documento) return null;

      const [signatarios] = await conn.query<RowDataPacket[]>(
        `SELECT da.usuario_id, u.nome_completo AS nome, da.assinado_em
         FROM documento_assinaturas da
         LEFT JOIN usuarios u ON u.id = da.usuario_id
         WHERE da.documento_id = ?
         ORDER BY da.assinado_em`,
        [data.id],
      );

      return { ...(documento as DocumentoDetalhe), signatarios: signatarios as Signatario[] };
    });
  });

const criarDocumentoSchema = z.object({
  titulo: z.string().min(1),
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
      const hash = createHash("sha256").update(data.conteudo, "utf8").digest("hex");
      await conn.query(
        `INSERT INTO documentos
           (id, titulo, conteudo, hash_conteudo, arquivo_url, arquivo_nome_original, arquivo_mime, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.titulo,
          data.conteudo,
          hash,
          data.arquivoUrl || null,
          data.arquivoNomeOriginal || null,
          data.arquivoMime || null,
          usuarioId,
        ],
      );
      await registrarAuditoria(conn, usuarioId, "criar", "documento", id, null, {
        titulo: data.titulo,
        hash_conteudo: hash,
        arquivo_nome_original: data.arquivoNomeOriginal || null,
      });
      return { id };
    });
  });

export const assinarDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      const [[documento]] = await conn.query<RowDataPacket[]>(
        "SELECT hash_conteudo FROM documentos WHERE id = ?",
        [data.id],
      );
      if (!documento) throw new Error("Documento não encontrado.");

      const [[jaAssinou]] = await conn.query<RowDataPacket[]>(
        "SELECT 1 AS ok FROM documento_assinaturas WHERE documento_id = ? AND usuario_id = ?",
        [data.id, usuarioId],
      );
      if (jaAssinou) throw new Error("Você já assinou este documento.");

      await conn.query(
        `INSERT INTO documento_assinaturas (id, documento_id, usuario_id, hash_conteudo_no_momento)
         VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), data.id, usuarioId, documento.hash_conteudo],
      );
    });
  });

export const excluirDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioId) => {
      const [[{ total }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM documento_assinaturas WHERE documento_id = ?",
        [data.id],
      );
      if (Number(total) > 0) {
        throw new SemPermissaoError(
          "Este documento já tem assinaturas registradas e não pode mais ser excluído.",
        );
      }
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

const MIME_AUTORIZADOS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15 MB — hospedagem compartilhada tem disco limitado.

export const uploadArquivoDocumento = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadArquivoSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string; nomeOriginal: string; mime: string }> => {
    return comPapel(PAPEIS_ESCRITA, async () => {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Arquivo inválido.");
      const mime = match[1];
      if (!MIME_AUTORIZADOS.includes(mime)) {
        throw new Error("Formato não aceito — envie um PDF ou DOCX.");
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
