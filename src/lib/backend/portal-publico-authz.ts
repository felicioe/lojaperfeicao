import type { PoolConnection } from "mysql2/promise";
import { comPapel } from "./authz";
import { LOJA_PORTAL_PUBLICO } from "../loja-portal-publico";

// Papel exclusivo pra tudo que vira conteúdo do site institucional
// (notícias, agenda pública, páginas — issues #366/#367/#380): manutenção
// do site é tarefa do super administrador (dono do domínio), não de
// qualquer admin/secretário de Loja.
const PAPEIS_ESCRITA = ["super_admin"];

/**
 * Os loaders públicos (agenda-publica.ts, noticias-publica.ts,
 * paginas-site-publica.ts) só leem da Loja hardcoded em
 * loja-portal-publico.ts. Sem esta checagem, um super_admin de outra Loja
 * geriria conteúdo que nunca apareceria no site — falha silenciosa (achado
 * do review automático da PR #368, replicado aqui pros três recursos).
 */
export function comPapelPortalPublico<T>(
  fn: (conn: PoolConnection, usuarioId: string, lojaId: string) => Promise<T>,
): Promise<T> {
  return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId, lojaId) => {
    if (lojaId !== LOJA_PORTAL_PUBLICO) {
      throw new Error("Este recurso só pode ser gerido pela Loja do portal institucional.");
    }
    return fn(conn, usuarioId, lojaId);
  });
}
