import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { enviarEmailChamadoAberto } from "../email-dispatch";

// Chamados de suporte, Loja → super_admin (issue #363) — lado Loja. Qualquer
// usuário autenticado pode abrir e responder os PRÓPRIOS chamados (não os de
// outros membros da mesma Loja): é um canal individual com a plataforma, não
// um mural compartilhado.

export type Prioridade = "baixa" | "media" | "alta" | "urgente";
export type StatusChamado = "aberto" | "em_andamento" | "resolvido" | "fechado";

// Prazo de SLA por prioridade, em horas corridas — não dias úteis, decisão
// consciente pra não precisar de um calculador de dia útil nesta v1.
export const SLA_HORAS: Record<Prioridade, number> = {
  urgente: 4,
  alta: 24,
  media: 72,
  baixa: 120,
};

const TAMANHO_MAXIMO_ANEXO = 5 * 1024 * 1024; // 5 MB, mesmo limite do QR Code PIX
const MAXIMO_ANEXOS_POR_MENSAGEM = 3;

const anexoSchema = z.object({
  nomeArquivo: z.string().min(1).max(255),
  dataUrl: z.string().startsWith("data:"),
});

function validarAnexos(
  anexos: { nomeArquivo: string; dataUrl: string }[],
): { nome_arquivo: string; mime_type: string; tamanho_bytes: number; conteudo: string }[] {
  if (anexos.length > MAXIMO_ANEXOS_POR_MENSAGEM) {
    throw new Error(`No máximo ${MAXIMO_ANEXOS_POR_MENSAGEM} anexos por mensagem.`);
  }
  return anexos.map((a) => {
    const match = a.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error(`Arquivo inválido: ${a.nomeArquivo}.`);
    const mime = match[1];
    if (!(mime.startsWith("image/") || mime === "application/pdf")) {
      throw new Error(`Tipo de arquivo não permitido em ${a.nomeArquivo}. Envie imagem ou PDF.`);
    }
    const tamanho = Buffer.byteLength(match[2], "base64");
    if (tamanho > TAMANHO_MAXIMO_ANEXO) {
      throw new Error(`${a.nomeArquivo} é maior que o limite de 5 MB.`);
    }
    return {
      nome_arquivo: a.nomeArquivo,
      mime_type: mime,
      tamanho_bytes: tamanho,
      conteudo: a.dataUrl,
    };
  });
}

export type ChamadoResumo = {
  id: string;
  assunto: string;
  prioridade: Prioridade;
  status: StatusChamado;
  prazo_sla: string;
  criado_em: string;
  atualizado_em: string;
  ultima_mensagem_de_super_admin: boolean;
};

export const listarMeusChamados = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChamadoResumo[]> =>
    comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.assunto, c.prioridade, c.status, c.prazo_sla, c.criado_em, c.atualizado_em,
                (SELECT m.eh_super_admin FROM chamados_mensagens m
                  WHERE m.chamado_id = c.id ORDER BY m.criado_em DESC LIMIT 1) AS ultima_de_super_admin
           FROM chamados c
          WHERE c.loja_id = @current_loja_id AND c.aberto_por = ?
          ORDER BY c.criado_em DESC`,
        [usuarioId],
      );
      return rows.map((r) => ({
        id: r.id as string,
        assunto: r.assunto as string,
        prioridade: r.prioridade as Prioridade,
        status: r.status as StatusChamado,
        prazo_sla: new Date(r.prazo_sla).toISOString(),
        criado_em: new Date(r.criado_em).toISOString(),
        atualizado_em: new Date(r.atualizado_em).toISOString(),
        ultima_mensagem_de_super_admin: !!r.ultima_de_super_admin,
      }));
    }),
);

export type MensagemChamado = {
  id: string;
  autor_id: string;
  eh_super_admin: boolean;
  mensagem: string;
  criado_em: string;
  anexos: { id: string; nome_arquivo: string; mime_type: string; tamanho_bytes: number }[];
};

export type ChamadoDetalhe = {
  id: string;
  assunto: string;
  prioridade: Prioridade;
  status: StatusChamado;
  prazo_sla: string;
  criado_em: string;
  mensagens: MensagemChamado[];
};

async function carregarMensagens(
  conn: import("mysql2/promise").PoolConnection,
  chamadoId: string,
): Promise<MensagemChamado[]> {
  const [msgs] = await conn.query<RowDataPacket[]>(
    `SELECT id, autor_id, eh_super_admin, mensagem, criado_em
       FROM chamados_mensagens WHERE chamado_id = ? ORDER BY criado_em`,
    [chamadoId],
  );
  const [anexos] = await conn.query<RowDataPacket[]>(
    `SELECT a.id, a.mensagem_id, a.nome_arquivo, a.mime_type, a.tamanho_bytes
       FROM chamados_anexos a
       JOIN chamados_mensagens m ON m.id = a.mensagem_id
      WHERE m.chamado_id = ?`,
    [chamadoId],
  );
  return msgs.map((m) => ({
    id: m.id as string,
    autor_id: m.autor_id as string,
    eh_super_admin: !!m.eh_super_admin,
    mensagem: m.mensagem as string,
    criado_em: new Date(m.criado_em).toISOString(),
    anexos: anexos
      .filter((a) => a.mensagem_id === m.id)
      .map((a) => ({
        id: a.id as string,
        nome_arquivo: a.nome_arquivo as string,
        mime_type: a.mime_type as string,
        tamanho_bytes: Number(a.tamanho_bytes),
      })),
  }));
}

const idSchema = z.object({ chamadoId: z.string().uuid() });

export const obterMeuChamado = createServerFn({ method: "GET" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }): Promise<ChamadoDetalhe> =>
    comSessao(async (conn, usuarioId) => {
      const [[chamado]] = await conn.query<RowDataPacket[]>(
        `SELECT id, assunto, prioridade, status, prazo_sla, criado_em
           FROM chamados WHERE id = ? AND loja_id = @current_loja_id AND aberto_por = ?`,
        [data.chamadoId, usuarioId],
      );
      if (!chamado) throw new Error("Chamado não encontrado.");
      const mensagens = await carregarMensagens(conn, data.chamadoId);
      return {
        id: chamado.id as string,
        assunto: chamado.assunto as string,
        prioridade: chamado.prioridade as Prioridade,
        status: chamado.status as StatusChamado,
        prazo_sla: new Date(chamado.prazo_sla).toISOString(),
        criado_em: new Date(chamado.criado_em).toISOString(),
        mensagens,
      };
    }),
  );

const abrirChamadoSchema = z.object({
  assunto: z.string().trim().min(1).max(200),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]),
  mensagem: z.string().trim().min(1).max(5000),
  anexos: z.array(anexoSchema).default([]),
});

export const abrirChamado = createServerFn({ method: "POST" })
  .validator((d: unknown) => abrirChamadoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> =>
    comSessao(async (conn, usuarioId, lojaId) => {
      const anexosValidados = validarAnexos(data.anexos);

      const [[{ chamadoId }]] = await conn.query<RowDataPacket[]>("SELECT UUID() AS chamadoId");
      await conn.query(
        `INSERT INTO chamados (id, loja_id, aberto_por, assunto, prioridade, prazo_sla)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
        [chamadoId, lojaId, usuarioId, data.assunto, data.prioridade, SLA_HORAS[data.prioridade]],
      );

      const [[{ mensagemId }]] = await conn.query<RowDataPacket[]>("SELECT UUID() AS mensagemId");
      await conn.query(
        `INSERT INTO chamados_mensagens (id, chamado_id, autor_id, eh_super_admin, mensagem)
         VALUES (?, ?, ?, FALSE, ?)`,
        [mensagemId, chamadoId, usuarioId, data.mensagem],
      );

      for (const a of anexosValidados) {
        await conn.query(
          `INSERT INTO chamados_anexos (mensagem_id, nome_arquivo, mime_type, tamanho_bytes, conteudo)
           VALUES (?, ?, ?, ?, ?)`,
          [mensagemId, a.nome_arquivo, a.mime_type, a.tamanho_bytes, a.conteudo],
        );
      }

      await registrarAuditoria(conn, usuarioId, "abrir", "chamado", chamadoId, null, {
        assunto: data.assunto,
        prioridade: data.prioridade,
      });

      await enviarEmailChamadoAberto(chamadoId as string, lojaId).catch((err) =>
        console.error("Falha ao notificar abertura de chamado:", err),
      );

      return { id: chamadoId as string };
    }),
  );

const responderChamadoSchema = z.object({
  chamadoId: z.string().uuid(),
  mensagem: z.string().trim().min(1).max(5000),
  anexos: z.array(anexoSchema).default([]),
});

export const responderMeuChamado = createServerFn({ method: "POST" })
  .validator((d: unknown) => responderChamadoSchema.parse(d))
  .handler(async ({ data }): Promise<void> =>
    comSessao(async (conn, usuarioId, lojaId) => {
      const [[chamado]] = await conn.query<RowDataPacket[]>(
        `SELECT id, status FROM chamados
          WHERE id = ? AND loja_id = @current_loja_id AND aberto_por = ?`,
        [data.chamadoId, usuarioId],
      );
      if (!chamado) throw new Error("Chamado não encontrado.");
      if (chamado.status === "fechado") {
        throw new Error("Este chamado está fechado e não aceita novas mensagens.");
      }
      const anexosValidados = validarAnexos(data.anexos);

      const [[{ mensagemId }]] = await conn.query<RowDataPacket[]>("SELECT UUID() AS mensagemId");
      await conn.query(
        `INSERT INTO chamados_mensagens (id, chamado_id, autor_id, eh_super_admin, mensagem)
         VALUES (?, ?, ?, FALSE, ?)`,
        [mensagemId, data.chamadoId, usuarioId, data.mensagem],
      );
      for (const a of anexosValidados) {
        await conn.query(
          `INSERT INTO chamados_anexos (mensagem_id, nome_arquivo, mime_type, tamanho_bytes, conteudo)
           VALUES (?, ?, ?, ?, ?)`,
          [mensagemId, a.nome_arquivo, a.mime_type, a.tamanho_bytes, a.conteudo],
        );
      }

      // Cliente respondeu um chamado que já tinha sido dado como resolvido:
      // volta pra "em andamento" — resolvido não é estado terminal, fechado é.
      if (chamado.status === "resolvido") {
        await conn.query("UPDATE chamados SET status = 'em_andamento' WHERE id = ?", [
          data.chamadoId,
        ]);
      }

      await registrarAuditoria(conn, usuarioId, "responder", "chamado", data.chamadoId, null, null);
    }),
  );
