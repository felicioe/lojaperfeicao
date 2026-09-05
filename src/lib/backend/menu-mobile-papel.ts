import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { filtrarRotasValidas } from "@/lib/menu-catalogo";

// issue #464: admin da Loja define, por papel, uma lista ORDENADA dos itens
// de menu ativos na navegação mobile — PainelShell do irmão (os 5 primeiros
// da lista viram abas fixas de baixo, o resto cai no menu-gaveta) e a gaveta
// mobile de admin/tesoureiro/secretario no AppShell (ordena os itens dentro
// de cada grupo já visível pelo papel).
//
// Só estes 4 papéis fazem sentido aqui: são os únicos internos a uma Loja.
// super_admin/editor_cms/aprovador_cms são papéis "fora da cascata" (ver
// useCan() em auth-hooks.ts) sem navegação de Loja pra configurar.
export const PAPEIS_MENU_MOBILE = ["admin", "tesoureiro", "secretario", "irmao"] as const;
export type PapelMenuMobile = (typeof PAPEIS_MENU_MOBILE)[number];

export type ConfiguracaoMenuMobilePapel = { papel: PapelMenuMobile; itens: string[] };

export const listarMenuMobilePorPapel = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConfiguracaoMenuMobilePapel[]> => {
    return comPapel(["admin"], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT papel, itens_json FROM menu_mobile_papel WHERE loja_id = @current_loja_id`,
      );
      const porPapel = new Map<string, string[]>(
        rows.map((r) => [
          r.papel as string,
          Array.isArray(r.itens_json) ? r.itens_json : JSON.parse(r.itens_json ?? "[]"),
        ]),
      );
      return PAPEIS_MENU_MOBILE.map((papel) => ({ papel, itens: porPapel.get(papel) ?? [] }));
    });
  },
);

export const salvarMenuMobilePorPapel = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        papel: z.enum(PAPEIS_MENU_MOBILE),
        itens: z.array(z.string()),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<void> => {
    return comPapel(["admin"], async (conn, _usuarioId, lojaId) => {
      // Preserva a ORDEM que o admin definiu (é o que decide o que vira aba
      // fixa no PainelShell) — filtrarRotasValidas só descarta duplicata e
      // rota que não existe mais no catálogo, sem reordenar.
      const itensValidos = filtrarRotasValidas(data.itens);
      await conn.query(
        `INSERT INTO menu_mobile_papel (loja_id, papel, itens_json)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE itens_json = VALUES(itens_json)`,
        [lojaId, data.papel, JSON.stringify(itensValidos)],
      );
    });
  });

// Reaproveitado por usuario-sessao.ts (fora de createServerFn, mesmo padrão
// de obterLogosInstitucionais em orgs.ts) — resolve a config aplicável ao
// usuário logado a partir dos papéis que ele realmente tem, na mesma ordem
// de precedência já usada em useCan() (admin cobre tesoureiro/secretario).
// `null` = papel nunca configurado (nenhuma linha) = sem restrição nenhuma;
// array (mesmo vazio) = o admin configurou esta lista de propósito, trava.
export async function obterMenuMobilePapelAplicavel(
  conn: PoolConnection,
  papeisDoUsuario: string[],
): Promise<string[] | null> {
  const precedencia: PapelMenuMobile[] = papeisDoUsuario.includes("admin")
    ? ["admin"]
    : papeisDoUsuario.includes("tesoureiro")
      ? ["tesoureiro"]
      : papeisDoUsuario.includes("secretario")
        ? ["secretario"]
        : papeisDoUsuario.includes("irmao")
          ? ["irmao"]
          : [];
  if (precedencia.length === 0) return null;
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT itens_json FROM menu_mobile_papel WHERE loja_id = @current_loja_id AND papel = ?`,
    [precedencia[0]],
  );
  if (!row) return null;
  return Array.isArray(row.itens_json) ? row.itens_json : JSON.parse(row.itens_json ?? "[]");
}
