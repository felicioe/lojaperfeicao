import type { RowDataPacket } from "mysql2";
import { withLojaConnection } from "./backend/db";
import { LOJA_PORTAL_PUBLICO } from "./loja-portal-publico";

// Leitura pública das edições do jornalzinho (issue #665) — mesmo padrão de
// noticias-publica.ts: sem autenticação, escopado na Loja hardcoded do
// portal público. O `html` já vem sanitizado/montado no momento da
// publicação (jornal.ts) — não há rich-text de usuário aqui pra sanitizar
// de novo.

export type EdicaoJornalPublicaResumo = {
  numero: number;
  titulo: string;
  publicado_em: string;
};

export type EdicaoJornalPublicaDetalhe = EdicaoJornalPublicaResumo & { html: string };

export async function listarEdicoesJornalPublicas(): Promise<EdicaoJornalPublicaResumo[]> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT numero, titulo, publicado_em FROM edicoes_jornal
       WHERE loja_id = @current_loja_id ORDER BY numero DESC LIMIT 100`,
    );
    return rows.map((row) => ({
      numero: row.numero,
      titulo: row.titulo,
      publicado_em: row.publicado_em,
    }));
  });
}

export async function carregarEdicaoJornalPublicaPorNumero(
  numero: number,
): Promise<EdicaoJornalPublicaDetalhe | null> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [[row]] = await conn.query<RowDataPacket[]>(
      `SELECT numero, titulo, publicado_em, html FROM edicoes_jornal
       WHERE loja_id = @current_loja_id AND numero = ?`,
      [numero],
    );
    if (!row) return null;
    return {
      numero: row.numero,
      titulo: row.titulo,
      publicado_em: row.publicado_em,
      html: row.html,
    };
  });
}
