import { createServerFn } from "@tanstack/react-start";
import type { RowDataPacket } from "mysql2";
import { comSuperAdmin } from "./authz";
import type { Papel } from "./auth";

// Usuários entre todas as Lojas (issue #359) — investigação/leitura só,
// mesma decisão de #339: sem impersonação, sem acesso a dado interno de
// Loja. O que esta tela mostra é metadado de conta (e-mail, papéis,
// atividade), nunca dado financeiro/cadastral — quem precisar agir sobre um
// usuário continua fazendo isso de dentro da Loja dele.

export type UsuarioPlataforma = {
  id: string;
  email: string;
  nome_completo: string | null;
  loja_id: string;
  loja_nome: string;
  loja_slug: string;
  papeis: Papel[];
  ativo: boolean;
  ultimo_acesso: string | null;
};

export const listarUsuariosPlataforma = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsuarioPlataforma[]> =>
    comSuperAdmin(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT u.id, u.email, u.nome_completo, u.ativo,
                l.id AS loja_id, l.nome AS loja_nome, l.slug AS loja_slug,
                GROUP_CONCAT(DISTINCT up.papel) AS papeis,
                acesso.ultimo_acesso
           FROM usuarios u
           JOIN lojas l ON l.id = u.loja_id
           LEFT JOIN usuarios_papeis up ON up.usuario_id = u.id
           LEFT JOIN (
             SELECT usuario_id, MAX(criado_em) AS ultimo_acesso
               FROM auditoria
              WHERE acao = 'login'
              GROUP BY usuario_id
           ) acesso ON acesso.usuario_id = u.id
          GROUP BY u.id, u.email, u.nome_completo, u.ativo,
                   l.id, l.nome, l.slug, acesso.ultimo_acesso
          ORDER BY l.nome, u.email`,
      );
      return rows.map((r) => ({
        id: r.id as string,
        email: r.email as string,
        nome_completo: r.nome_completo as string | null,
        loja_id: r.loja_id as string,
        loja_nome: r.loja_nome as string,
        loja_slug: r.loja_slug as string,
        papeis: (r.papeis ? String(r.papeis).split(",") : []) as Papel[],
        ativo: !!r.ativo,
        ultimo_acesso: r.ultimo_acesso ? new Date(r.ultimo_acesso).toISOString() : null,
      }));
    }),
);
