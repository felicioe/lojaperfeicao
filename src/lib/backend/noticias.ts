import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { registrarAuditoria } from "./auditoria";
import { comSessao } from "./authz";
import {
  comPapelEditorialCms,
  papeisEditorialCms,
  colunasDoEditor,
  type PapeisEditorialCms,
} from "./cms-editorial-authz";

// CMS de notícias/publicações do site institucional (issue #366, ampliado
// pela #391 com colunas e fluxo de aprovação). super_admin continua com
// acesso irrestrito; editor_cms só enxerga/edita a própria coluna e nunca
// publica direto; aprovador_cms enxerga tudo mas só aprova ou rejeita.

export type Noticia = {
  id: string;
  titulo: string;
  resumo: string | null;
  conteudo: string;
  coluna_id: string | null;
  coluna_nome: string | null;
  status: "rascunho" | "aguardando_aprovacao" | "publicado";
  visibilidade: "publica" | "restrita";
  motivo_rejeicao: string | null;
  publicado_em: string | null;
  autor_id: string;
  autor_nome: string | null;
  criado_em: string;
  atualizado_em: string;
  // achado #662 — a lista NÃO traz imagem_capa_url/anexo_url (podem ser
  // grandes, LONGTEXT): mesma lição do achado #655 (listarDocumentos), que
  // travou em produção trazendo o binário de todo documento numa lista só.
  // Conteúdo real vem sob demanda de obterImagemEAnexoNoticia.
  tem_imagem_capa: boolean;
  tem_anexo: boolean;
};

export type ImagemEAnexoNoticia = {
  imagemCapaUrl: string | null;
  imagemCapaNomeOriginal: string | null;
  anexoUrl: string | null;
  anexoNomeOriginal: string | null;
  anexoMime: string | null;
};

async function exigirColunaPropria(
  conn: PoolConnection,
  usuarioId: string,
  colunaId: string | null,
): Promise<void> {
  if (!colunaId) throw new Error("Escolha uma coluna — editor_cms não pode publicar sem coluna.");
  const colunas = await colunasDoEditor(conn, usuarioId);
  if (!colunas.includes(colunaId)) {
    throw new Error("Você só pode escrever na(s) coluna(s) atribuída(s) a você.");
  }
}

export type ColunaDisponivel = { id: string; nome: string };

/** Colunas que o autor logado pode escolher ao escrever uma notícia —
 * super_admin/aprovador_cms veem todas, editor_cms só as próprias. Gerir a
 * coluna em si (criar/renomear/excluir/atribuir dono) é exclusivo de
 * super_admin, em cms-editorial.ts; isto aqui é só o combo do formulário. */
export const listarColunasDisponiveis = createServerFn({ method: "GET" }).handler(
  async (): Promise<ColunaDisponivel[]> => {
    return comPapelEditorialCms(async (conn, usuarioId) => {
      const papeis = await papeisEditorialCms(conn, usuarioId);
      if (papeis.superAdmin || papeis.aprovador) {
        const [rows] = await conn.query<RowDataPacket[]>(
          "SELECT id, nome FROM noticias_colunas WHERE loja_id = @current_loja_id ORDER BY nome",
        );
        return rows as ColunaDisponivel[];
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.nome FROM noticias_colunas c
         JOIN editor_cms_colunas ec ON ec.coluna_id = c.id AND ec.usuario_id = ?
         WHERE c.loja_id = @current_loja_id ORDER BY c.nome`,
        [usuarioId],
      );
      return rows as ColunaDisponivel[];
    });
  },
);

export const listarNoticias = createServerFn({ method: "GET" }).handler(
  async (): Promise<Noticia[]> => {
    return comPapelEditorialCms(async (conn, usuarioId) => {
      const papeis = await papeisEditorialCms(conn, usuarioId);
      const somenteColunaPropria = !papeis.superAdmin && !papeis.aprovador;
      const filtroColuna = somenteColunaPropria
        ? "AND n.coluna_id IN (SELECT coluna_id FROM editor_cms_colunas WHERE usuario_id = ?)"
        : "";
      const params = somenteColunaPropria ? [usuarioId] : [];
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT n.id, n.titulo, n.resumo, n.conteudo, n.coluna_id, c.nome AS coluna_nome,
                n.status, n.visibilidade, n.motivo_rejeicao, n.publicado_em,
                (n.imagem_capa_url IS NOT NULL AND n.imagem_capa_url <> '') AS tem_imagem_capa,
                (n.anexo_url IS NOT NULL AND n.anexo_url <> '') AS tem_anexo,
                n.autor_id, u.email AS autor_nome, n.criado_em, n.atualizado_em
         FROM noticias n
         LEFT JOIN usuarios u ON u.id = n.autor_id AND u.loja_id = @current_loja_id
         LEFT JOIN noticias_colunas c ON c.id = n.coluna_id
         WHERE n.loja_id = @current_loja_id ${filtroColuna}
         ORDER BY n.criado_em DESC`,
        params,
      );
      return rows.map((row) => ({
        ...row,
        tem_imagem_capa: !!row.tem_imagem_capa,
        tem_anexo: !!row.tem_anexo,
      })) as Noticia[];
    });
  },
);

/** Conteúdo binário (imagem de capa + anexo) de UMA notícia, sob demanda —
 * ver nota em Noticia sobre por que a lista não traz isso. Chamado ao abrir
 * "editar" no CMS. */
export const obterImagemEAnexoNoticia = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ImagemEAnexoNoticia> => {
    return comPapelEditorialCms(async (conn) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT imagem_capa_url, imagem_capa_nome_original, anexo_url, anexo_nome_original, anexo_mime
         FROM noticias WHERE id = ? AND loja_id = @current_loja_id`,
        [data.id],
      );
      if (!row) throw new Error("Notícia não encontrada.");
      return {
        imagemCapaUrl: row.imagem_capa_url || null,
        imagemCapaNomeOriginal: row.imagem_capa_nome_original,
        anexoUrl: row.anexo_url || null,
        anexoNomeOriginal: row.anexo_nome_original,
        anexoMime: row.anexo_mime,
      };
    });
  });

// achado #673 (auditoria de segurança) — imagemCapaUrl/anexoUrl precisam do
// MESMO regex de MIME/tamanho usado nos endpoints de upload (mais abaixo
// neste arquivo) reaplicado AQUI, no momento de gravar. Antes disso, o
// allowlist só existia em uploadImagemCapaNoticia/uploadAnexoNoticia, que
// apenas devolvem a data: URL validada — quem grava de fato é salvarNoticia,
// e nada garantia que o valor recebido tivesse passado por aquele endpoint.
// Um usuário com papel editorial podia chamar salvarNoticia diretamente com
// `anexoUrl: "javascript:..."`, que ia parar sem escapo nenhum num <a href>
// na página pública da notícia (XSS armazenado contra visitante anônimo).
function validarImagemCapaUrl(url: string | null | undefined): void {
  if (!url) return;
  const match = MIME_IMAGEM.exec(url);
  if (!match) throw new Error("Imagem de capa inválida — envie PNG, JPG ou WebP.");
  if (Buffer.from(match[2], "base64").byteLength > TAMANHO_MAXIMO_IMAGEM_BYTES) {
    throw new Error("Imagem de capa maior que 8 MB.");
  }
}

function validarAnexoUrl(url: string | null | undefined): void {
  if (!url) return;
  const match = MIME_ANEXO.exec(url);
  if (!match) throw new Error("Anexo inválido — envie PDF, PNG, JPG ou WebP.");
  if (Buffer.from(match[2], "base64").byteLength > TAMANHO_MAXIMO_ANEXO_BYTES) {
    throw new Error("Anexo maior que 30 MB.");
  }
}

const noticiaSchema = z.object({
  id: z.string().uuid().nullable(),
  // VARCHAR(200) na tabela noticias (migração 0113) — sem o .max() aqui, um
  // título maior passava pela validação e só quebrava no INSERT/UPDATE em
  // modo estrito, com um erro de banco cru em vez de uma mensagem clara.
  titulo: z.string().min(1).max(200),
  resumo: z.string().nullable(),
  conteudo: z.string().min(1),
  colunaId: z.string().uuid().nullable(),
  visibilidade: z.enum(["publica", "restrita"]),
  imagemCapaUrl: z.string().nullable().optional(),
  imagemCapaNomeOriginal: z.string().nullable().optional(),
  anexoUrl: z.string().nullable().optional(),
  anexoNomeOriginal: z.string().nullable().optional(),
  anexoMime: z.string().nullable().optional(),
});

async function exigirRascunhoProprio(
  conn: PoolConnection,
  usuarioId: string,
  id: string,
  papeis: PapeisEditorialCms,
): Promise<void> {
  if (papeis.superAdmin) return;
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT coluna_id, status FROM noticias WHERE id = ? AND loja_id = @current_loja_id",
    [id],
  );
  if (!row) throw new Error("Notícia não encontrada.");
  const colunas = await colunasDoEditor(conn, usuarioId);
  if (!row.coluna_id || !colunas.includes(row.coluna_id)) {
    throw new Error("Você só pode mexer na(s) coluna(s) atribuída(s) a você.");
  }
  if (row.status !== "rascunho") {
    throw new Error(
      "Esta notícia já foi enviada para aprovação ou publicada — só dá pra editar rascunho.",
    );
  }
}

export const salvarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => noticiaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual, lojaId) => {
      validarImagemCapaUrl(data.imagemCapaUrl);
      validarAnexoUrl(data.anexoUrl);
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (papeis.aprovador && !papeis.superAdmin) {
        throw new Error("aprovador_cms só aprova ou rejeita — não edita conteúdo.");
      }
      const editorRestrito = !papeis.superAdmin;

      if (data.id) {
        if (editorRestrito) await exigirRascunhoProprio(conn, usuarioIdAtual, data.id, papeis);
        if (editorRestrito) await exigirColunaPropria(conn, usuarioIdAtual, data.colunaId);
        await conn.query(
          `UPDATE noticias
           SET titulo=?, resumo=?, conteudo=?, coluna_id=?, visibilidade=?, motivo_rejeicao=NULL,
               imagem_capa_url=?, imagem_capa_nome_original=?,
               anexo_url=?, anexo_nome_original=?, anexo_mime=?
           WHERE id=? AND loja_id = @current_loja_id`,
          [
            data.titulo,
            data.resumo,
            data.conteudo,
            data.colunaId,
            data.visibilidade,
            data.imagemCapaUrl || null,
            data.imagemCapaNomeOriginal || null,
            data.anexoUrl || null,
            data.anexoNomeOriginal || null,
            data.anexoMime || null,
            data.id,
          ],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "noticia", data.id, null, {
          ...data,
        });
      } else {
        if (editorRestrito) await exigirColunaPropria(conn, usuarioIdAtual, data.colunaId);
        await conn.query(
          `INSERT INTO noticias
             (loja_id, titulo, resumo, conteudo, coluna_id, visibilidade, autor_id,
              imagem_capa_url, imagem_capa_nome_original, anexo_url, anexo_nome_original, anexo_mime)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            lojaId,
            data.titulo,
            data.resumo,
            data.conteudo,
            data.colunaId,
            data.visibilidade,
            usuarioIdAtual,
            data.imagemCapaUrl || null,
            data.imagemCapaNomeOriginal || null,
            data.anexoUrl || null,
            data.anexoNomeOriginal || null,
            data.anexoMime || null,
          ],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "noticia", null, null, {
          ...data,
        });
      }
    });
  });

const idSchema = z.object({ id: z.string().uuid() });

/** super_admin publica/despublica direto, sem passar por aprovação — o
 * estado 'aguardando_aprovacao' é só pra quem não é super_admin. */
export const definirStatusNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["rascunho", "publicado"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) {
        throw new Error("Só o super administrador publica ou despublica direto, sem aprovação.");
      }
      // publicado_em só é carimbado na PRIMEIRA publicação — despublicar e
      // publicar de novo não deve fingir que a notícia é mais nova do que é.
      await conn.query(
        `UPDATE noticias
         SET status = ?, motivo_rejeicao = NULL,
             publicado_em = IF(? = 'publicado' AND publicado_em IS NULL, NOW(), publicado_em)
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.status, data.status, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        data.status === "publicado" ? "publicar" : "despublicar",
        "noticia",
        data.id,
        null,
        null,
      );
    });
  });

/** editor_cms manda o próprio rascunho pra revisão — não publica, só tira do
 * rascunho e põe na fila de quem aprova. */
export const enviarNoticiaParaAprovacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) await exigirRascunhoProprio(conn, usuarioIdAtual, data.id, papeis);
      await conn.query(
        "UPDATE noticias SET status = 'aguardando_aprovacao', motivo_rejeicao = NULL WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "enviar_para_aprovacao",
        "noticia",
        data.id,
        null,
        null,
      );
    });
  });

async function exigirAguardandoAprovacao(conn: PoolConnection, id: string): Promise<void> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT status FROM noticias WHERE id = ? AND loja_id = @current_loja_id",
    [id],
  );
  if (!row) throw new Error("Notícia não encontrada.");
  if (row.status !== "aguardando_aprovacao") {
    throw new Error("Esta notícia não está aguardando aprovação.");
  }
}

export const aprovarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin && !papeis.aprovador) {
        throw new Error("Só super_admin ou aprovador_cms aprovam notícia.");
      }
      await exigirAguardandoAprovacao(conn, data.id);
      await conn.query(
        `UPDATE noticias
         SET status = 'publicado', motivo_rejeicao = NULL,
             publicado_em = IF(publicado_em IS NULL, NOW(), publicado_em)
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.id],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "aprovar", "noticia", data.id, null, null);
    });
  });

const rejeitarSchema = z.object({
  id: z.string().uuid(),
  motivo: z.string().trim().min(1).max(500),
});

export const rejeitarNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => rejeitarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin && !papeis.aprovador) {
        throw new Error("Só super_admin ou aprovador_cms rejeitam notícia.");
      }
      await exigirAguardandoAprovacao(conn, data.id);
      await conn.query(
        "UPDATE noticias SET status = 'rascunho', motivo_rejeicao = ? WHERE id = ? AND loja_id = @current_loja_id",
        [data.motivo, data.id],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "rejeitar", "noticia", data.id, null, {
        motivo: data.motivo,
      });
    });
  });

export const excluirNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioIdAtual) => {
      const papeis = await papeisEditorialCms(conn, usuarioIdAtual);
      if (!papeis.superAdmin) {
        if (papeis.aprovador) throw new Error("aprovador_cms não exclui notícia.");
        await exigirRascunhoProprio(conn, usuarioIdAtual, data.id, papeis);
      }
      await conn.query("DELETE FROM noticias WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "noticia", data.id, null, null);
    });
  });

// Upload da imagem de capa — mesmo padrão de allowlist estrita usada em
// uploadFotoIrmao (achado #639 da auditoria de segurança): só imagem,
// nunca qualquer tipo de arquivo.
const uploadImagemSchema = z.object({
  nomeArquivo: z.string().min(1),
  dataUrl: z.string().startsWith("data:"),
});

const MIME_IMAGEM = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/;
const TAMANHO_MAXIMO_IMAGEM_BYTES = 8 * 1024 * 1024; // 8 MB — imagem de capa, não anexo

export const uploadImagemCapaNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadImagemSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string; nomeOriginal: string }> => {
    return comPapelEditorialCms(async () => {
      validarImagemCapaUrl(data.dataUrl);
      return { url: data.dataUrl, nomeOriginal: data.nomeArquivo };
    });
  });

// Anexo (PDF ou imagem) — decisão registrada na issue #662: sem conversão
// automática pra PDF (LibreOffice headless indisponível na Hostinger, mesma
// limitação de pecas-arquitetura.ts/fatura-pdf.ts). Mesmo allowlist de
// chamados.ts (validarAnexos).
const MIME_ANEXO = /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,(.+)$/;
const TAMANHO_MAXIMO_ANEXO_BYTES = 30 * 1024 * 1024; // 30 MB

export const uploadAnexoNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadImagemSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string; nomeOriginal: string; mime: string }> => {
    return comPapelEditorialCms(async () => {
      const match = data.dataUrl.match(MIME_ANEXO);
      if (!match) throw new Error("Envie um PDF, PNG, JPG ou WebP.");
      const mime = match[1];
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.byteLength > TAMANHO_MAXIMO_ANEXO_BYTES) {
        throw new Error("Arquivo maior que 30 MB.");
      }
      return { url: data.dataUrl, nomeOriginal: data.nomeArquivo, mime };
    });
  });

// Registrado quando um irmão logado baixa a foto de uma notícia no site
// (achado #662) — só o log; o navegador já tem a imagem em mãos (veio no
// carregamento da notícia), não precisa buscar de novo aqui.
export const registrarDownloadImagemNoticia = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      await registrarAuditoria(conn, usuarioId, "baixar_imagem", "noticia", data.id, null, null);
    });
  });

// ---------- Newsletter por e-mail ao publicar (issue #663) ----------
// Import dinâmico de email-dispatch (mesmo motivo de comunicacoes.ts): esse
// módulo usa nodemailer e outras libs server-only, que não podem vazar pro
// bundle do cliente.

const idNoticiaSchema = z.object({ id: z.string().uuid() });

export const obterPreviaEmailNoticia = createServerFn({ method: "GET" })
  .validator((d: unknown) => idNoticiaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (_conn, _usuarioId, lojaId) => {
      const { obterPreviaEmailNoticia: obterPrevia } = await import("../email-dispatch");
      const previa = await obterPrevia(data.id, lojaId);
      if (!previa) throw new Error("Notícia não encontrada ou ainda não publicada.");
      return previa;
    });
  });

export const enviarNoticiaPorEmail = createServerFn({ method: "POST" })
  .validator((d: unknown) => idNoticiaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapelEditorialCms(async (conn, usuarioId, lojaId) => {
      const { enviarNoticiaPorEmail: enviarPorEmail } = await import("../email-dispatch");
      const resultado = await enviarPorEmail(data.id, lojaId);
      await registrarAuditoria(conn, usuarioId, "enviar_newsletter", "noticia", data.id, null, {
        destinatarios: resultado.length,
        sucessos: resultado.filter((r) => r.sucesso).length,
      });
      return resultado;
    });
  });
