import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSuperAdmin } from "./authz";
import { registrarAuditoriaPlataforma } from "./auditoria";
import { enviarEmailChamadoRespondido, enviarEmailChamadoResolvido } from "../email-dispatch";
import type { Prioridade, StatusChamado, MensagemChamado } from "./chamados";

// Chamados de suporte, Loja → super_admin (issue #363) — lado plataforma.
// Sem escopo de Loja de propósito: comSuperAdmin() não resolve loja nenhuma
// (issue #339), e a fila precisa mostrar chamados de TODAS as Lojas.

export type ChamadoFila = {
  id: string;
  loja_id: string;
  loja_nome: string;
  assunto: string;
  prioridade: Prioridade;
  status: StatusChamado;
  prazo_sla: string;
  criado_em: string;
  atualizado_em: string;
  vencido: boolean;
  aberto_por_email: string;
};

const filtrosSchema = z.object({
  status: z.enum(["aberto", "em_andamento", "resolvido", "fechado"]).optional(),
  lojaId: z.string().uuid().optional(),
  prioridade: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
});

export const listarChamadosPlataforma = createServerFn({ method: "GET" })
  .validator((d: unknown) => filtrosSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<ChamadoFila[]> =>
    comSuperAdmin(async (conn) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];
      if (data.status) {
        condicoes.push("c.status = ?");
        params.push(data.status);
      }
      if (data.lojaId) {
        condicoes.push("c.loja_id = ?");
        params.push(data.lojaId);
      }
      if (data.prioridade) {
        condicoes.push("c.prioridade = ?");
        params.push(data.prioridade);
      }
      const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.loja_id, l.nome AS loja_nome, c.assunto, c.prioridade, c.status,
                c.prazo_sla, c.criado_em, c.atualizado_em, u.email AS aberto_por_email
           FROM chamados c
           JOIN lojas l ON l.id = c.loja_id
           JOIN usuarios u ON u.id = c.aberto_por
           ${where}
          ORDER BY c.status = 'fechado', c.status = 'resolvido', c.prazo_sla`,
        params,
      );
      const agora = Date.now();
      return rows.map((r) => {
        const prazo = new Date(r.prazo_sla);
        return {
          id: r.id as string,
          loja_id: r.loja_id as string,
          loja_nome: r.loja_nome as string,
          assunto: r.assunto as string,
          prioridade: r.prioridade as Prioridade,
          status: r.status as StatusChamado,
          prazo_sla: prazo.toISOString(),
          criado_em: new Date(r.criado_em).toISOString(),
          atualizado_em: new Date(r.atualizado_em).toISOString(),
          vencido:
            prazo.getTime() < agora && !["resolvido", "fechado"].includes(r.status as string),
          aberto_por_email: r.aberto_por_email as string,
        };
      });
    }),
  );

export type ChamadoDetalhePlataforma = {
  id: string;
  loja_id: string;
  loja_nome: string;
  assunto: string;
  prioridade: Prioridade;
  status: StatusChamado;
  prazo_sla: string;
  criado_em: string;
  aberto_por_email: string;
  mensagens: MensagemChamado[];
};

async function carregarMensagensPlataforma(
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

export const obterChamadoPlataforma = createServerFn({ method: "GET" })
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }): Promise<ChamadoDetalhePlataforma> =>
    comSuperAdmin(async (conn) => {
      const [[chamado]] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.loja_id, l.nome AS loja_nome, c.assunto, c.prioridade, c.status,
                c.prazo_sla, c.criado_em, u.email AS aberto_por_email
           FROM chamados c
           JOIN lojas l ON l.id = c.loja_id
           JOIN usuarios u ON u.id = c.aberto_por
          WHERE c.id = ?`,
        [data.chamadoId],
      );
      if (!chamado) throw new Error("Chamado não encontrado.");
      const mensagens = await carregarMensagensPlataforma(conn, data.chamadoId);
      return {
        id: chamado.id as string,
        loja_id: chamado.loja_id as string,
        loja_nome: chamado.loja_nome as string,
        assunto: chamado.assunto as string,
        prioridade: chamado.prioridade as Prioridade,
        status: chamado.status as StatusChamado,
        prazo_sla: new Date(chamado.prazo_sla).toISOString(),
        criado_em: new Date(chamado.criado_em).toISOString(),
        aberto_por_email: chamado.aberto_por_email as string,
        mensagens,
      };
    }),
  );

const TAMANHO_MAXIMO_ANEXO = 5 * 1024 * 1024;
const MAXIMO_ANEXOS_POR_MENSAGEM = 3;

const anexoSchema = z.object({
  nomeArquivo: z.string().min(1).max(255),
  dataUrl: z.string().startsWith("data:"),
});

function validarAnexos(anexos: { nomeArquivo: string; dataUrl: string }[]) {
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

const responderSchema = z.object({
  chamadoId: z.string().uuid(),
  mensagem: z.string().trim().max(5000).optional(),
  anexos: z.array(anexoSchema).default([]),
  novoStatus: z.enum(["aberto", "em_andamento", "resolvido", "fechado"]).optional(),
});

export const responderChamadoPlataforma = createServerFn({ method: "POST" })
  .validator((d: unknown) => responderSchema.parse(d))
  .handler(async ({ data }): Promise<void> =>
    comSuperAdmin(async (conn, usuarioId) => {
      if (!data.mensagem && !data.novoStatus) {
        throw new Error("Informe uma mensagem ou uma mudança de status.");
      }
      const [[chamado]] = await conn.query<RowDataPacket[]>(
        "SELECT id, loja_id, status FROM chamados WHERE id = ?",
        [data.chamadoId],
      );
      if (!chamado) throw new Error("Chamado não encontrado.");

      const anexosValidados = validarAnexos(data.anexos);
      let mensagemEnviada = false;

      if (data.mensagem) {
        const [[{ mensagemId }]] = await conn.query<RowDataPacket[]>("SELECT UUID() AS mensagemId");
        await conn.query(
          `INSERT INTO chamados_mensagens (id, chamado_id, autor_id, eh_super_admin, mensagem)
           VALUES (?, ?, ?, TRUE, ?)`,
          [mensagemId, data.chamadoId, usuarioId, data.mensagem],
        );
        for (const a of anexosValidados) {
          await conn.query(
            `INSERT INTO chamados_anexos (mensagem_id, nome_arquivo, mime_type, tamanho_bytes, conteudo)
             VALUES (?, ?, ?, ?, ?)`,
            [mensagemId, a.nome_arquivo, a.mime_type, a.tamanho_bytes, a.conteudo],
          );
        }
        mensagemEnviada = true;
      }

      const statusAntes = chamado.status as StatusChamado;
      if (data.novoStatus && data.novoStatus !== statusAntes) {
        await conn.query(
          `UPDATE chamados SET status = ?, resolvido_em = ${
            data.novoStatus === "resolvido" ? "NOW()" : "NULL"
          } WHERE id = ?`,
          [data.novoStatus, data.chamadoId],
        );
      }

      await registrarAuditoriaPlataforma(
        conn,
        usuarioId,
        data.novoStatus && data.novoStatus !== statusAntes
          ? "atualizar_status_chamado"
          : "responder_chamado",
        chamado.loja_id as string,
        { status: statusAntes },
        { status: data.novoStatus ?? statusAntes, mensagem: mensagemEnviada },
      );

      const lojaId = chamado.loja_id as string;
      if (data.novoStatus === "resolvido" || data.novoStatus === "fechado") {
        await enviarEmailChamadoResolvido(data.chamadoId, lojaId).catch((err) =>
          console.error("Falha ao notificar resolução de chamado:", err),
        );
      } else if (mensagemEnviada) {
        await enviarEmailChamadoRespondido(data.chamadoId, lojaId).catch((err) =>
          console.error("Falha ao notificar resposta de chamado:", err),
        );
      }
    }),
  );
