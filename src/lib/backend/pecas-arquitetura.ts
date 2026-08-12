import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel, SemPermissaoError } from "./authz";
import { registrarAuditoria } from "./auditoria";

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

export type SituacaoPeca = "em_analise" | "aprovado" | "rejeitado";

export type PecaArquitetura = {
  id: string;
  autor_id: string;
  autor_nome: string;
  sessao_id: string | null;
  sessao_data: string | null;
  titulo: string;
  tema: string | null;
  resumo: string | null;
  grau: number;
  situacao: SituacaoPeca;
  aprovado_por_nome: string | null;
  aprovado_em: string | null;
  arquivo_url: string | null;
  arquivo_nome_original: string | null;
  arquivo_mime: string | null;
  criado_em: string;
};

const PECA_SELECT = `
  SELECT pa.id, pa.autor_id, i.nome_civil AS autor_nome, pa.sessao_id, s.data AS sessao_data,
         pa.titulo, pa.tema, pa.resumo, pa.grau, pa.situacao, ap.nome_civil AS aprovado_por_nome,
         pa.aprovado_em, pa.arquivo_url, pa.arquivo_nome_original, pa.arquivo_mime, pa.criado_em
  FROM pecas_arquitetura pa
  JOIN irmaos i ON i.id = pa.autor_id
  LEFT JOIN sessoes s ON s.id = pa.sessao_id
  LEFT JOIN irmaos ap ON ap.id = pa.aprovado_por
`;

// Acesso por grau (#222) e situação (#224): admin/secretário veem tudo
// (precisam ver as pendentes pra poder aprovar); o próprio autor sempre vê
// a própria peça, em qualquer situação; os demais só veem peças aprovadas
// com grau <= o maior grau_atual do irmão em qualquer corpo (peça sem
// corpo vinculado não tem contra o que comparar além disso — ver
// migração 0063).
//
// COLLATE explícito nas duas comparações "usuario_id = @current_usuario_id":
// a variável de sessão (SET @current_usuario_id = ?, ver db.ts) herda a
// collation padrão da conexão (utf8mb4_general_ci), enquanto
// irmaos.usuario_id é utf8mb4_unicode_ci — sem o COLLATE aqui, MySQL
// recusa a comparação com "Illegal mix of collations", derrubando a
// consulta inteira (nunca aparecia como erro visível: o catch do
// useQuery só deixava a lista vazia, "Nenhuma peça cadastrada").
const PODE_VER_CONDICAO = `(
  has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')
  OR i.usuario_id = @current_usuario_id COLLATE utf8mb4_unicode_ci
  OR (
    pa.situacao = 'aprovado'
    AND pa.grau <= COALESCE(
          (SELECT MAX(io.grau_atual) FROM irmaos me JOIN irmao_orgs io ON io.irmao_id = me.id
           WHERE me.usuario_id = @current_usuario_id COLLATE utf8mb4_unicode_ci),
          0
        )
  )
)`;

export const listarPecasArquitetura = createServerFn({ method: "GET" }).handler(
  async (): Promise<PecaArquitetura[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `${PECA_SELECT} WHERE ${PODE_VER_CONDICAO} ORDER BY pa.criado_em DESC`,
      );
      return rows as PecaArquitetura[];
    });
  },
);

export const obterPecaArquitetura = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<PecaArquitetura | null> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `${PECA_SELECT} WHERE pa.id = ? AND ${PODE_VER_CONDICAO}`,
        [data.id],
      );
      return (rows[0] as PecaArquitetura) ?? null;
    });
  });

const criarPecaSchema = z.object({
  autorId: z.string().uuid(),
  sessaoId: z.string().uuid().nullable().optional(),
  titulo: z.string().min(1),
  tema: z.string().trim().min(1).nullable().optional(),
  resumo: z.string().trim().min(1).nullable().optional(),
  grau: z.number().int().positive(),
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
           (autor_id, sessao_id, titulo, tema, resumo, grau, arquivo_url, arquivo_nome_original, arquivo_mime)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.autorId,
          data.sessaoId || null,
          data.titulo,
          data.tema || null,
          data.resumo || null,
          data.grau,
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
      // Edição de uma peça já aprovada volta pra "em análise" — sem isso o
      // autor poderia trocar o PDF/título/grau depois da aprovação e o
      // conteúdo novo ficaria visível sem nenhuma revisão (#224).
      // aprovado_por/aprovado_em precisam vir ANTES de situacao no SET: o
      // MySQL avalia as atribuições da esquerda pra direita dentro do mesmo
      // UPDATE, então se situacao fosse reatribuída primeiro, as duas
      // condições seguintes já veriam o valor NOVO ('em_analise') em vez do
      // original ('aprovado') e nunca zerariam aprovado_por/aprovado_em.
      await conn.query(
        `UPDATE pecas_arquitetura
         SET autor_id=?, sessao_id=?, titulo=?, tema=?, resumo=?, grau=?, arquivo_url=?,
             arquivo_nome_original=?, arquivo_mime=?,
             aprovado_por = IF(situacao = 'aprovado', NULL, aprovado_por),
             aprovado_em = IF(situacao = 'aprovado', NULL, aprovado_em),
             situacao = IF(situacao = 'aprovado', 'em_analise', situacao)
         WHERE id=?`,
        [
          data.autorId,
          data.sessaoId || null,
          data.titulo,
          data.tema || null,
          data.resumo || null,
          data.grau,
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

// Aprovação (#224) — por ora restrita a admin/secretário (não há papel de
// autenticação "Sapientíssimo"/"Poderoso Mestre"; esses são cargos da
// Gestão de um corpo específico, e peça não tem corpo obrigatório pra
// resolver isso sem ambiguidade — ver decisão em aberto da issue).
const aprovarRejeitarSchema = z.object({ id: z.string().uuid() });

export const aprovarPecaArquitetura = createServerFn({ method: "POST" })
  .validator((d: unknown) => aprovarRejeitarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_PRIVILEGIADOS, async (conn, usuarioId) => {
      const [[aprovador]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM irmaos WHERE usuario_id = ?",
        [usuarioId],
      );
      await conn.query(
        `UPDATE pecas_arquitetura SET situacao = 'aprovado', aprovado_por = ?, aprovado_em = NOW()
         WHERE id = ?`,
        [aprovador?.id ?? null, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioId,
        "aprovar_peca_arquitetura",
        "pecas_arquitetura",
        data.id,
      );
    });
  });

export const rejeitarPecaArquitetura = createServerFn({ method: "POST" })
  .validator((d: unknown) => aprovarRejeitarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_PRIVILEGIADOS, async (conn, usuarioId) => {
      const [[aprovador]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM irmaos WHERE usuario_id = ?",
        [usuarioId],
      );
      await conn.query(
        `UPDATE pecas_arquitetura SET situacao = 'rejeitado', aprovado_por = ?, aprovado_em = NOW()
         WHERE id = ?`,
        [aprovador?.id ?? null, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioId,
        "rejeitar_peca_arquitetura",
        "pecas_arquitetura",
        data.id,
      );
    });
  });

// Upload do arquivo (PDF/DOCX): mesmo padrão de uploadFotoIrmao/uploadLogoOrg
// — grava em disco sob public/uploads e devolve só a URL pública; persistir
// na tabela é responsabilidade de criar/atualizarPecaArquitetura.
const uploadArquivoSchema = z.object({
  nomeArquivo: z.string().min(1),
  dataUrl: z.string().startsWith("data:"),
});

// #223: o pedido original era converter DOCX/DOC/RTF pra PDF automaticamente
// no upload, mas isso depende de LibreOffice rodando em modo headless — que
// não está disponível na hospedagem compartilhada atual (mesma classe de
// limitação já vista com o worker do pdfjs-dist nesta sessão). Até ter uma
// solução de conversão viável (VPS próprio ou serviço externo), só aceita
// PDF — evita publicar um arquivo Word "cru" sem ninguém saber que a
// conversão nunca rodou.
const MIME_AUTORIZADOS = ["application/pdf"];
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15 MB — hospedagem compartilhada tem disco limitado.

export const uploadArquivoPeca = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadArquivoSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string; nomeOriginal: string; mime: string }> => {
    return comSessao(async () => {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Arquivo inválido.");
      const mime = match[1];
      if (!MIME_AUTORIZADOS.includes(mime)) {
        throw new Error("Formato não aceito — por ora, só PDF (converta o Word antes de enviar).");
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
