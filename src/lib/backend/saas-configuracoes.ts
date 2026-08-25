import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comSuperAdmin } from "./authz";
import { registrarAuditoriaPlataforma } from "./auditoria";

// Configurações globais da plataforma (issue #362) — parâmetros que valem
// para todas as Lojas de uma vez. Primeiro (e único, por ora) uso: um
// banner de manutenção/aviso visível para todas as Lojas simultaneamente.
// Guardado em chave/valor (configuracoes_plataforma, migração 0109) — os
// próximos parâmetros que a plataforma precisar não exigem outra migração
// de schema, só novas chaves.

export type BannerPlataforma = {
  ativo: boolean;
  mensagem: string;
  tipo: "info" | "aviso" | "critico";
};

function paraBanner(linhas: Record<string, string | null>): BannerPlataforma {
  const tipo = linhas.banner_tipo;
  return {
    ativo: linhas.banner_ativo === "1",
    mensagem: linhas.banner_mensagem ?? "",
    tipo: tipo === "aviso" || tipo === "critico" ? tipo : "info",
  };
}

// Leitura liberada pra qualquer usuário autenticado, de qualquer Loja — é o
// ponto do banner: avisar todo mundo, não só quem administra a plataforma.
export const obterBannerPlataforma = createServerFn({ method: "GET" }).handler(
  async (): Promise<BannerPlataforma> =>
    comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT chave, valor FROM configuracoes_plataforma WHERE chave IN ('banner_ativo', 'banner_mensagem', 'banner_tipo')",
      );
      const linhas: Record<string, string | null> = {};
      for (const r of rows) linhas[r.chave as string] = r.valor as string | null;
      return paraBanner(linhas);
    }),
);

const bannerSchema = z.object({
  ativo: z.boolean(),
  mensagem: z.string().trim().max(500),
  tipo: z.enum(["info", "aviso", "critico"]),
});

export const atualizarBannerPlataforma = createServerFn({ method: "POST" })
  .validator((d: unknown) => bannerSchema.parse(d))
  .handler(async ({ data }) => {
    return comSuperAdmin(async (conn, usuarioId) => {
      if (data.ativo && !data.mensagem) {
        throw new Error("Informe a mensagem do banner antes de ativá-lo.");
      }
      const valores: [string, string][] = [
        ["banner_ativo", data.ativo ? "1" : "0"],
        ["banner_mensagem", data.mensagem],
        ["banner_tipo", data.tipo],
      ];
      for (const [chave, valor] of valores) {
        await conn.query(
          `INSERT INTO configuracoes_plataforma (chave, valor, atualizado_por)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE valor = VALUES(valor), atualizado_por = VALUES(atualizado_por)`,
          [chave, valor, usuarioId],
        );
      }
      await registrarAuditoriaPlataforma(
        conn,
        usuarioId,
        "atualizar_configuracoes_plataforma",
        null,
        null,
        { banner: data },
      );
    });
  });
