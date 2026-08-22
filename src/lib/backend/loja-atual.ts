import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel, comSessao } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Identidade institucional da Loja (issue #340) — fonte única em
// `lojas.nome`/`razao_social`/`cnpj`. Usado por CabecalhoInstitucional,
// FaturaCard/FaturaAgrupadaCard/recibos (favorecido/CNPJ do impresso),
// dados-entidade (Política de Privacidade) e o título das páginas.
export type LojaAtual = {
  id: string;
  slug: string;
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  onboardingConcluido: boolean;
};

export const obterLojaAtual = createServerFn({ method: "GET" }).handler(
  async (): Promise<LojaAtual> => {
    return comSessao(async (conn) => {
      const [[loja]] = await conn.query<RowDataPacket[]>(
        `SELECT id, slug, nome, razao_social, cnpj, onboarding_concluido
           FROM lojas WHERE id = @current_loja_id`,
      );
      return {
        id: loja.id as string,
        slug: loja.slug as string,
        nome: loja.nome as string,
        razaoSocial: loja.razao_social as string | null,
        cnpj: loja.cnpj as string | null,
        onboardingConcluido: !!loja.onboarding_concluido,
      };
    });
  },
);

// Assistente de primeira configuração (issue #340) — só admin, mesmo motivo
// de qualquer outra escrita institucional.
const PAPEIS_ESCRITA = ["admin"];

const dadosInstitucionaisSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da Loja."),
  razaoSocial: z.string().trim().max(255).nullable(),
  cnpj: z.string().trim().max(20).nullable(),
});

export const salvarDadosInstitucionaisLoja = createServerFn({ method: "POST" })
  .validator((d: unknown) => dadosInstitucionaisSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual, lojaId) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT nome, razao_social, cnpj FROM lojas WHERE id = @current_loja_id",
      );
      await conn.query("UPDATE lojas SET nome = ?, razao_social = ?, cnpj = ? WHERE id = ?", [
        data.nome,
        data.razaoSocial || null,
        data.cnpj || null,
        lojaId,
      ]);
      await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "lojas", lojaId, antes, data);
    });
  });

export const concluirOnboardingLoja = createServerFn({ method: "POST" }).handler(async () => {
  return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
    await conn.query("UPDATE lojas SET onboarding_concluido = TRUE WHERE id = ?", [lojaId]);
  });
});
