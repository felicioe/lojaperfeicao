import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao, SemPermissaoError } from "./authz";

// Visível a todos os irmãos autenticados (mesmo espírito de Sessões/Eventos
// — não é informação sensível). Só edita/exclui o próprio autor ou um
// papel privilegiado, checagem por linha (não dá pra usar comPapel fixo
// porque depende de quem é o autor daquela peça específica).
const PAPEIS_PRIVILEGIADOS = ["admin", "secretario"];

async function podeEditarPeca(
  conn: PoolConnection,
  usuarioId: string,
  pecaId: string,
): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes} OR EXISTS(
       SELECT 1 FROM pecas_arquitetura pa
       JOIN irmaos i ON i.id = pa.autor_id
       WHERE pa.id = ? AND i.usuario_id = ?
     )) AS ok`,
    [...PAPEIS_PRIVILEGIADOS, pecaId, usuarioId],
  );
  return !!row.ok;
}

export type PecaArquitetura = {
  id: string;
  autor_id: string;
  autor_nome: string;
  sessao_id: string | null;
  sessao_data: string | null;
  titulo: string;
  tema: string | null;
  resumo: string | null;
  arquivo_url: string | null;
  arquivo_nome_original: string | null;
  arquivo_mime: string | null;
  criado_em: string;
};

const PECA_SELECT = `
  SELECT pa.id, pa.autor_id, i.nome_civil AS autor_nome, pa.sessao_id, s.data AS sessao_data,
         pa.titulo, pa.tema, pa.resumo, pa.arquivo_url, pa.arquivo_nome_original,
         pa.arquivo_mime, pa.criado_em
  FROM pecas_arquitetura pa
  JOIN irmaos i ON i.id = pa.autor_id
  LEFT JOIN sessoes s ON s.id = pa.sessao_id
`;

export const listarPecasArquitetura = createServerFn({ method: "GET" }).handler(
  async (): Promise<PecaArquitetura[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(`${PECA_SELECT} ORDER BY pa.criado_em DESC`);
      return rows as PecaArquitetura[];
    });
  },
);

export const obterPecaArquitetura = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<PecaArquitetura | null> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(`${PECA_SELECT} WHERE pa.id = ?`, [data.id]);
      return (rows[0] as PecaArquitetura) ?? null;
    });
  });

const criarPecaSchema = z.object({
  autorId: z.string().uuid(),
  sessaoId: z.string().uuid().nullable().optional(),
  titulo: z.string().min(1),
  tema: z.string().trim().min(1).nullable().optional(),
  resumo: z.string().trim().min(1).nullable().optional(),
  arquivoUrl: z.string().nullable().optional(),
  arquivoNomeOriginal: z.string().nullable().optional(),
  arquivoMime: z.string().nullable().optional(),
});

export const criarPecaArquitetura = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarPecaSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      // Autor só pode ser o próprio (via cadastro vinculado) a menos que
      // seja admin/secretário escolhendo outra pessoa — mesma regra de
      // podeEditarPeca, aplicada aqui na criação.
      const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(
        " OR ",
      );
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT (${condicoes} OR EXISTS(SELECT 1 FROM irmaos WHERE id = ? AND usuario_id = ?)) AS ok`,
        [...PAPEIS_PRIVILEGIADOS, data.autorId, usuarioId],
      );
      if (!row.ok) throw new SemPermissaoError("Você só pode cadastrar peças em seu próprio nome.");

      await conn.query(
        `INSERT INTO pecas_arquitetura
           (autor_id, sessao_id, titulo, tema, resumo, arquivo_url, arquivo_nome_original, arquivo_mime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.autorId,
          data.sessaoId || null,
          data.titulo,
          data.tema || null,
          data.resumo || null,
          data.arquivoUrl || null,
          data.arquivoNomeOriginal || null,
          data.arquivoMime || null,
        ],
      );
    });
  });

const atualizarPecaSchema = criarPecaSchema.extend({ id: z.string().uuid() });

export const atualizarPecaArquitetura = createServerFn({ method: "POST" })
  .validator((d: unknown) => atualizarPecaSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeEditarPeca(conn, usuarioId, data.id))) throw new SemPermissaoError();
      await conn.query(
        `UPDATE pecas_arquitetura
         SET autor_id=?, sessao_id=?, titulo=?, tema=?, resumo=?, arquivo_url=?,
             arquivo_nome_original=?, arquivo_mime=?
         WHERE id=?`,
        [
          data.autorId,
          data.sessaoId || null,
          data.titulo,
          data.tema || null,
          data.resumo || null,
          data.arquivoUrl || null,
          data.arquivoNomeOriginal || null,
          data.arquivoMime || null,
          data.id,
        ],
      );
    });
  });

export const excluirPecaArquitetura = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeEditarPeca(conn, usuarioId, data.id))) throw new SemPermissaoError();
      await conn.query("DELETE FROM pecas_arquitetura WHERE id=?", [data.id]);
    });
  });

// Upload do arquivo (PDF/DOCX): mesmo padrão de uploadFotoIrmao/uploadLogoOrg
// — grava em disco sob public/uploads e devolve só a URL pública; persistir
// na tabela é responsabilidade de criar/atualizarPecaArquitetura.
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

export const uploadArquivoPeca = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadArquivoSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string; nomeOriginal: string; mime: string }> => {
    return comSessao(async () => {
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
      const dir = join(process.cwd(), "public", "uploads", "pecas-arquitetura");
      await mkdir(dir, { recursive: true });
      const nomeArquivoFinal = `${Date.now()}-${nomeSeguro}`;
      await writeFile(join(dir, nomeArquivoFinal), buffer);
      return {
        url: `/uploads/pecas-arquitetura/${nomeArquivoFinal}`,
        nomeOriginal: data.nomeArquivo,
        mime,
      };
    });
  });
