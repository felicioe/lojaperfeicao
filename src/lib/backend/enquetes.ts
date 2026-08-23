import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
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
         (SELECT COUNT(*) FROM enquete_opcoes eo
           WHERE eo.enquete_id = e.id AND eo.loja_id = @current_loja_id) AS total_opcoes,
         (SELECT COUNT(*) FROM enquete_votos ev
           WHERE ev.enquete_id = e.id AND ev.loja_id = @current_loja_id) AS total_votos,
         (SELECT ev.opcao_id FROM enquete_votos ev
          JOIN irmaos i ON i.id = ev.irmao_id AND i.loja_id = @current_loja_id
          WHERE ev.enquete_id = e.id AND ev.loja_id = @current_loja_id
            AND i.usuario_id = ?) AS meu_voto_opcao_id
  FROM enquetes e
  LEFT JOIN usuarios u ON u.id = e.criado_por AND u.loja_id = @current_loja_id
  WHERE e.loja_id = @current_loja_id
`;

// Data de hoje (YYYY-MM-DD) no fuso LOCAL, não em UTC — .toISOString()
// pega o dia UTC, que já virou o dia seguinte a partir das 21h no horário
// de Brasília, encerrando enquetes com até 3h de antecedência (mesma
// classe de bug já corrigida em toISODate, ver src/lib/format.ts).
function hojeLocalISO(): string {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// "Encerrada" efetiva considera tanto o encerramento manual quanto o
// prazo vencido — nenhum lugar do sistema deveria checar só a coluna
// encerrada isoladamente.
function encerradaEfetiva(e: { encerrada: boolean; data_limite: string | null }): boolean {
  if (e.encerrada) return true;
  if (e.data_limite && new Date(e.data_limite) < new Date(hojeLocalISO())) {
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
        "SELECT * FROM enquete_opcoes WHERE enquete_id = ? AND loja_id = @current_loja_id ORDER BY ordem",
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
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId, lojaId) => {
      const enqueteId = crypto.randomUUID();
      await conn.query(
        `INSERT INTO enquetes (id, loja_id, titulo, descricao, nominal, mostrar_resultado_sempre, data_limite, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          enqueteId,
          lojaId,
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
          "INSERT INTO enquete_opcoes (id, loja_id, enquete_id, texto, ordem) VALUES (?, ?, ?, ?, ?)",
          [crypto.randomUUID(), lojaId, enqueteId, texto, indice],
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
      const [r] = await conn.query<ResultSetHeader>(
        "UPDATE enquetes SET encerrada = TRUE WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (r.affectedRows === 0) throw new Error("Enquete não encontrada nesta Loja.");
      await registrarAuditoria(conn, usuarioId, "encerrar", "enquete", data.id);
    });
  });

export const excluirEnquete = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioId) => {
      const [[enquete]] = await conn.query<RowDataPacket[]>(
        "SELECT titulo, descricao, nominal, encerrada, criado_por FROM enquetes WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      const [resumoVotos] = await conn.query<RowDataPacket[]>(
        `SELECT eo.texto, COUNT(ev.id) AS votos
         FROM enquete_opcoes eo
         LEFT JOIN enquete_votos ev ON ev.opcao_id = eo.id AND ev.loja_id = @current_loja_id
         WHERE eo.enquete_id = ? AND eo.loja_id = @current_loja_id
         GROUP BY eo.id, eo.texto
         ORDER BY eo.ordem`,
        [data.id],
      );
      if (!enquete) throw new Error("Enquete não encontrada nesta Loja.");
      await conn.query("DELETE FROM enquetes WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
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
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [[meuIrmao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      if (!meuIrmao) {
        throw new Error("Seu usuário ainda não está vinculado a um cadastro de irmão.");
      }

      const [[enquete]] = await conn.query<RowDataPacket[]>(
        "SELECT encerrada, data_limite FROM enquetes WHERE id = ? AND loja_id = @current_loja_id",
        [data.enqueteId],
      );
      if (!enquete) throw new Error("Enquete não encontrada.");
      if (encerradaEfetiva(enquete as { encerrada: boolean; data_limite: string | null })) {
        throw new Error("Esta enquete já foi encerrada.");
      }

      const [[opcao]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM enquete_opcoes WHERE id = ? AND enquete_id = ? AND loja_id = @current_loja_id",
        [data.opcaoId, data.enqueteId],
      );
      if (!opcao) throw new Error("Opção inválida.");

      // O UNIQUE de enquete_votos é (enquete_id, irmao_id) e não conhece
      // loja: sem escopar a enquete, a opção E o irmão acima, um voto poderia
      // ligar irmão de uma Loja a enquete de outra e ainda assim passar.
      await conn.query(
        `INSERT INTO enquete_votos (id, loja_id, enquete_id, opcao_id, irmao_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE opcao_id = VALUES(opcao_id)`,
        [crypto.randomUUID(), lojaId, data.enqueteId, data.opcaoId, meuIrmao.id],
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
        "SELECT nominal, mostrar_resultado_sempre, encerrada, data_limite, criado_por FROM enquetes WHERE id = ? AND loja_id = @current_loja_id",
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
        "SELECT id, texto FROM enquete_opcoes WHERE enquete_id = ? AND loja_id = @current_loja_id ORDER BY ordem",
        [data.enqueteId],
      );
      const [votos] = await conn.query<RowDataPacket[]>(
        `SELECT ev.opcao_id, i.nome_civil FROM enquete_votos ev
         JOIN irmaos i ON i.id = ev.irmao_id AND i.loja_id = @current_loja_id
         JOIN enquete_opcoes eo ON eo.id = ev.opcao_id AND eo.loja_id = @current_loja_id
         WHERE eo.enquete_id = ? AND ev.loja_id = @current_loja_id`,
        [data.enqueteId],
      );
      const votosPorOpcao = new Map<string, string[]>();
      for (const v of votos) {
        const lista = votosPorOpcao.get(v.opcao_id) ?? [];
        lista.push(v.nome_civil as string);
        votosPorOpcao.set(v.opcao_id, lista);
      }
      return opcoes.map((opcao) => {
        const nomes = votosPorOpcao.get(opcao.id) ?? [];
        return {
          opcao_id: opcao.id,
          texto: opcao.texto,
          votos: nomes.length,
          eleitores: enquete.nominal ? nomes : null,
        };
      });
    });
  });
