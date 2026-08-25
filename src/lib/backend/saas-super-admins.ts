import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { comSuperAdmin } from "./authz";
import { registrarAuditoriaPlataforma } from "./auditoria";
import { usuarioTemTotpAtivo, validarCodigoTotpOuBackup } from "./totp";

// Gestão de super_admins (issue #361) — a decisão mais sensível de toda a
// área de plataforma: hoje conceder o papel só é possível com SQL direto no
// banco, de propósito (ver mysql/migrations/0094_super_admin.sql — nenhum
// grant automático, pra não abrir esse poder por acidente). Expor isso numa
// tela precisa da mesma barreira: senha atual + segundo fator de quem está
// executando (não do alvo), sempre auditado, e nunca deixar a plataforma
// com zero super_admins.

export type SuperAdminInfo = {
  id: string;
  email: string;
  nome_completo: string | null;
  loja_nome: string;
  loja_slug: string;
  desde: string;
};

export const listarSuperAdmins = createServerFn({ method: "GET" }).handler(
  async (): Promise<SuperAdminInfo[]> =>
    comSuperAdmin(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT u.id, u.email, u.nome_completo, l.nome AS loja_nome, l.slug AS loja_slug,
                up.criado_em AS desde
           FROM usuarios_papeis up
           JOIN usuarios u ON u.id = up.usuario_id
           JOIN lojas l ON l.id = u.loja_id
          WHERE up.papel = 'super_admin'
          ORDER BY up.criado_em`,
      );
      return rows.map((r) => ({
        id: r.id as string,
        email: r.email as string,
        nome_completo: r.nome_completo as string | null,
        loja_nome: r.loja_nome as string,
        loja_slug: r.loja_slug as string,
        desde: new Date(r.desde).toISOString(),
      }));
    }),
);

// Confirma que é mesmo quem diz ser antes de mexer no papel mais poderoso
// do sistema: senha atual de novo (mesmo que já tenha sessão aberta) +
// segundo fator. Exige 2FA ativo — não dá pra pedir um código que a conta
// não tem — em vez de deixar a ação passar sem ele.
async function confirmarSenhaETotp(
  conn: PoolConnection,
  usuarioIdAtual: string,
  senhaAtual: string,
  codigoTotp: string,
): Promise<void> {
  const [[usuario]] = await conn.query<RowDataPacket[]>(
    "SELECT senha_hash FROM usuarios WHERE id = ?",
    [usuarioIdAtual],
  );
  if (!usuario || !(await bcrypt.compare(senhaAtual, usuario.senha_hash))) {
    throw new Error("Senha atual incorreta.");
  }
  if (!(await usuarioTemTotpAtivo(conn, usuarioIdAtual))) {
    throw new Error(
      "Ative o 2FA na sua conta (Minha Conta → Segurança) antes de gerenciar super-admins.",
    );
  }
  if (!(await validarCodigoTotpOuBackup(conn, usuarioIdAtual, codigoTotp))) {
    throw new Error("Código de verificação inválido.");
  }
}

const confirmacaoSchema = z.object({
  usuarioId: z.string().uuid(),
  senhaAtual: z.string().min(1),
  codigoTotp: z.string().trim().min(6),
});

export const promoverSuperAdmin = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmacaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comSuperAdmin(async (conn, usuarioIdAtual) => {
      await confirmarSenhaETotp(conn, usuarioIdAtual, data.senhaAtual, data.codigoTotp);

      const [[alvo]] = await conn.query<RowDataPacket[]>(
        "SELECT id, email, loja_id FROM usuarios WHERE id = ?",
        [data.usuarioId],
      );
      if (!alvo) throw new Error("Usuário não encontrado.");

      const [[jaEh]] = await conn.query<RowDataPacket[]>(
        "SELECT 1 AS ok FROM usuarios_papeis WHERE usuario_id = ? AND papel = 'super_admin'",
        [data.usuarioId],
      );
      if (jaEh) throw new Error("Este usuário já é super-admin.");

      await conn.query(
        "INSERT INTO usuarios_papeis (loja_id, usuario_id, papel) VALUES (?, ?, 'super_admin')",
        [alvo.loja_id, data.usuarioId],
      );
      await registrarAuditoriaPlataforma(
        conn,
        usuarioIdAtual,
        "promover_super_admin",
        data.usuarioId,
        null,
        { email: alvo.email },
        "usuario",
      );
    });
  });

export const revogarSuperAdmin = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmacaoSchema.parse(d))
  .handler(async ({ data }) => {
    return comSuperAdmin(async (conn, usuarioIdAtual) => {
      await confirmarSenhaETotp(conn, usuarioIdAtual, data.senhaAtual, data.codigoTotp);

      // TRAVA DE SEGURANÇA: nunca deixar a plataforma sem nenhum
      // super-admin — mesmo raciocínio de definirLojaAtiva() recusando
      // suspender a Loja de um super-admin ativo (issue #339).
      const [[{ total }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM usuarios_papeis WHERE papel = 'super_admin'",
      );
      if (Number(total) <= 1) {
        throw new Error(
          "Não é possível revogar: a plataforma ficaria sem nenhum super-admin. Promova outro usuário antes.",
        );
      }

      const [[alvo]] = await conn.query<RowDataPacket[]>(
        "SELECT email FROM usuarios WHERE id = ?",
        [data.usuarioId],
      );
      if (!alvo) throw new Error("Usuário não encontrado.");

      const [resultado] = await conn.query<ResultSetHeader>(
        "DELETE FROM usuarios_papeis WHERE usuario_id = ? AND papel = 'super_admin'",
        [data.usuarioId],
      );
      if (resultado.affectedRows === 0) throw new Error("Este usuário não é super-admin.");

      await registrarAuditoriaPlataforma(
        conn,
        usuarioIdAtual,
        "revogar_super_admin",
        data.usuarioId,
        { email: alvo.email },
        null,
        "usuario",
      );
    });
  });
