import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel, SemPermissaoError } from "./authz";
import { registrarAuditoria } from "./auditoria";

const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Enquete = {
  id: string;
  titulo: string;
  descricao: string | null;
  nominal: boolean;
  mostrar_resultado_sempre: boolean;
  data_limite: string | null;
  encerrada: boolean;
  criado_por: string;
  criador_nome: string | null;
  criado_em: string;
  total_opcoes: number;
  total_votos: number;
  meu_voto_opcao_id: string | null;
};

const ENQUETE_SELECT = `
  SELECT e.id, e.titulo, e.descricao, e.nominal, e.mostrar_resultado_sempre,
         e.data_limite, e.encerrada, e.criado_por, u.nome_completo AS criador_nome, e.criado_em,
         (SELECT COUNT(*) FROM enquete_opcoes eo WHERE eo.enquete_id = e.id) AS total_opcoes,
         (SELECT COUNT(*) FROM enquete_votos ev WHERE ev.enquete_id = e.id) AS total_votos,
         (SELECT ev.opcao_id FROM enquete_votos ev
          JOIN irmaos i ON i.id = ev.irmao_id
          WHERE ev.enquete_id = e.id AND i.usuario_id = ?) AS meu_voto_opcao_id
  FROM enquetes e
  LEFT JOIN usuarios u ON u.id = e.criado_por
`;

// "Encerrada" efetiva considera tanto o encerramento manual quanto o
// prazo vencido — nenhum lugar do sistema deveria checar só a coluna
// encerrada isoladamente.
function encerradaEfetiva(e: { encerrada: boolean; data_limite: string | null }): boolean {
  if (e.encerrada) return true;
  if (e.data_limite && new Date(e.data_limite) < new Date(new Date().toISOString().slice(0, 10))) {
    return true;
  }
  return false;
}

export const listarEnquetes = createServerFn({ method: "GET" }).handler(
  async (): Promise<Enquete[]> => {
    return comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `${ENQUETE_SELECT} ORDER BY e.encerrada, e.criado_em DESC`,
        [usuarioId],
      );
      return rows as Enquete[];
    });
  },
);

export type EnqueteOpcao = { id: string; enquete_id: string; texto: string; ordem: number };

export const listarOpcoesEnquete = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ enqueteId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<EnqueteOpcao[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM enquete_opcoes WHERE enquete_id = ? ORDER BY ordem",
        [data.enqueteId],
      );
      return rows as EnqueteOpcao[];
    });
  });

const criarEnqueteSchema = z.object({
  titulo: z.string().min(1),
  descricao: z.string().trim().min(1).nullable().optional(),
  nominal: z.boolean(),
  mostrarResultadoSempre: z.boolean(),
  dataLimite: z.string().nullable().optional(),
  opcoes: z.array(z.string().trim().min(1)).min(2).max(20),
});

export const criarEnquete = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarEnqueteSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId) => {
      const enqueteId = crypto.randomUUID();
      await conn.query(
        `INSERT INTO enquetes (id, titulo, descricao, nominal, mostrar_resultado_sempre, data_limite, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          enqueteId,
          data.titulo,
          data.descricao || null,
          data.nominal,
          data.mostrarResultadoSempre,
          data.dataLimite || null,
          usuarioId,
        ],
      );
      for (const [indice, texto] of data.opcoes.entries()) {
        await conn.query(
          "INSERT INTO enquete_opcoes (id, enquete_id, texto, ordem) VALUES (?, ?, ?, ?)",
          [crypto.randomUUID(), enqueteId, texto, indice],
        );
      }
      await registrarAuditoria(conn, usuarioId, "criar", "enquete", enqueteId, null, data);
      return { id: enqueteId };
    });
  });

export const encerrarEnquete = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId) => {
      await conn.query("UPDATE enquetes SET encerrada = TRUE WHERE id = ?", [data.id]);
      await registrarAuditoria(conn, usuarioId, "encerrar", "enquete", data.id);
    });
  });

export const excluirEnquete = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioId) => {
      const [[enquete]] = await conn.query<RowDataPacket[]>(
        "SELECT titulo, descricao, nominal, encerrada, criado_por FROM enquetes WHERE id = ?",
        [data.id],
      );
      const [resumoVotos] = await conn.query<RowDataPacket[]>(
        `SELECT eo.texto, COUNT(ev.id) AS votos
         FROM enquete_opcoes eo
         LEFT JOIN enquete_votos ev ON ev.opcao_id = eo.id
         WHERE eo.enquete_id = ?
         GROUP BY eo.id, eo.texto
         ORDER BY eo.ordem`,
        [data.id],
      );
      await conn.query("DELETE FROM enquetes WHERE id = ?", [data.id]);
      await registrarAuditoria(conn, usuarioId, "excluir", "enquete", data.id, {
        ...enquete,
        resumo_votos: resumoVotos,
      });
    });
  });

const votarSchema = z.object({ enqueteId: z.string().uuid(), opcaoId: z.string().uuid() });

export const votar = createServerFn({ method: "POST" })
  .validator((d: unknown) => votarSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      const [[meuIrmao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM irmaos WHERE usuario_id = ?",
        [usuarioId],
      );
      if (!meuIrmao) {
        throw new Error("Seu usuário ainda não está vinculado a um cadastro de irmão.");
      }

      const [[enquete]] = await conn.query<RowDataPacket[]>(
        "SELECT encerrada, data_limite FROM enquetes WHERE id = ?",
        [data.enqueteId],
      );
      if (!enquete) throw new Error("Enquete não encontrada.");
      if (encerradaEfetiva(enquete as { encerrada: boolean; data_limite: string | null })) {
        throw new Error("Esta enquete já foi encerrada.");
      }

      const [[opcao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM enquete_opcoes WHERE id = ? AND enquete_id = ?",
        [data.opcaoId, data.enqueteId],
      );
      if (!opcao) throw new Error("Opção inválida.");

      await conn.query(
        `INSERT INTO enquete_votos (id, enquete_id, opcao_id, irmao_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE opcao_id = VALUES(opcao_id)`,
        [crypto.randomUUID(), data.enqueteId, data.opcaoId, meuIrmao.id],
      );
    });
  });

export type ResultadoOpcao = {
  opcao_id: string;
  texto: string;
  votos: number;
  eleitores: string[] | null;
};

export const listarResultadoEnquete = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ enqueteId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ResultadoOpcao[]> => {
    return comSessao(async (conn, usuarioId) => {
      const [[enquete]] = await conn.query<RowDataPacket[]>(
        "SELECT nominal, mostrar_resultado_sempre, encerrada, data_limite, criado_por FROM enquetes WHERE id = ?",
        [data.enqueteId],
      );
      if (!enquete) throw new Error("Enquete não encontrada.");

      const efetivaEncerrada = encerradaEfetiva(
        enquete as { encerrada: boolean; data_limite: string | null },
      );
      if (!enquete.mostrar_resultado_sempre && !efetivaEncerrada) {
        const [[row]] = await conn.query<RowDataPacket[]>(
          `SELECT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')
                   OR ? = ?) AS ok`,
          [enquete.criado_por, usuarioId],
        );
        if (!row.ok) {
          throw new SemPermissaoError(
            "O resultado desta enquete só fica visível depois de encerrada.",
          );
        }
      }

      const [opcoes] = await conn.query<RowDataPacket[]>(
        "SELECT id, texto FROM enquete_opcoes WHERE enquete_id = ? ORDER BY ordem",
        [data.enqueteId],
      );
      const resultado: ResultadoOpcao[] = [];
      for (const opcao of opcoes) {
        const [votos] = await conn.query<RowDataPacket[]>(
          "SELECT i.nome_civil FROM enquete_votos ev JOIN irmaos i ON i.id = ev.irmao_id WHERE ev.opcao_id = ?",
          [opcao.id],
        );
        resultado.push({
          opcao_id: opcao.id,
          texto: opcao.texto,
          votos: votos.length,
          eleitores: enquete.nominal ? votos.map((v) => v.nome_civil as string) : null,
        });
      }
      return resultado;
    });
  });
