import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel, SemPermissaoError, ehAlvoSuperAdmin } from "./authz";
import { withUserConnection } from "./db";
import { criarSessao, salvarLoginPendente2FA, consumirLoginPendente2FA } from "./session";
import { carregarUsuarioComPapeis, type UsuarioSessao } from "./usuario-sessao";
import { registrarAuditoria } from "./auditoria";
import { verificarBloqueio, registrarTentativaFalha, limparTentativas } from "./rate-limit";

const EMISSOR = "Gestão da Loja";
const QUANTIDADE_CODIGOS_BACKUP = 8;

function novoTotp(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: EMISSOR,
    label: email,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function gerarCodigosBackup(): string[] {
  // 8 caracteres, alfanumérico maiúsculo sem O/0/I/1 (evita confusão na
  // hora de digitar um código impresso/anotado à mão).
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: QUANTIDADE_CODIGOS_BACKUP }, () =>
    Array.from({ length: 8 }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join(""),
  );
}

// ---------- Status ----------

export type MeuTotpStatus = {
  ativo: boolean;
  codigosBackupRestantes: number;
};

export const meuTotpStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<MeuTotpStatus> => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT ativado_em FROM usuario_totp WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      const ativo = !!rows[0]?.ativado_em;
      if (!ativo) return { ativo: false, codigosBackupRestantes: 0 };
      const [[{ total }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM usuario_totp_codigos_backup WHERE usuario_id = ? AND usado_em IS NULL AND loja_id = @current_loja_id",
        [usuarioId],
      );
      return { ativo: true, codigosBackupRestantes: Number(total) };
    });
  },
);

// ---------- Ativação ----------

export const iniciarAtivacaoTotp = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ secret: string; otpauthUrl: string }> => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [[usuario]] = await conn.query<RowDataPacket[]>(
        "SELECT email FROM usuarios WHERE id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      if (!usuario) throw new Error("Usuário não encontrado.");

      const [[existente]] = await conn.query<RowDataPacket[]>(
        "SELECT ativado_em FROM usuario_totp WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      if (existente?.ativado_em) {
        throw new Error("2FA já está ativo — desative antes de reconfigurar.");
      }

      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      // Upsert: se já existia uma tentativa de ativação anterior não
      // confirmada, substitui pelo novo secret em vez de acumular linhas.
      await conn.query(
        `INSERT INTO usuario_totp (loja_id, usuario_id, secret, ativado_em)
         VALUES (?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE secret = VALUES(secret), ativado_em = NULL`,
        [lojaId, usuarioId, secret],
      );

      const totp = novoTotp(secret, usuario.email);
      return { secret, otpauthUrl: totp.toString() };
    });
  },
);

const confirmarAtivacaoSchema = z.object({ codigo: z.string().trim().min(6).max(6) });

export const confirmarAtivacaoTotp = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmarAtivacaoSchema.parse(d))
  .handler(async ({ data }): Promise<{ codigosBackup: string[] }> => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      const [[usuario]] = await conn.query<RowDataPacket[]>(
        "SELECT email FROM usuarios WHERE id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      const [[pendente]] = await conn.query<RowDataPacket[]>(
        "SELECT secret FROM usuario_totp WHERE usuario_id = ? AND ativado_em IS NULL AND loja_id = @current_loja_id",
        [usuarioId],
      );
      if (!usuario || !pendente) {
        throw new Error("Nenhuma ativação de 2FA em andamento — comece de novo.");
      }

      const totp = novoTotp(pendente.secret, usuario.email);
      if (totp.validate({ token: data.codigo, window: 1 }) === null) {
        throw new Error("Código inválido.");
      }

      await conn.query(
        "UPDATE usuario_totp SET ativado_em = NOW() WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );

      const codigosBackup = gerarCodigosBackup();
      for (const codigo of codigosBackup) {
        const hash = await bcrypt.hash(codigo, 10);
        await conn.query(
          "INSERT INTO usuario_totp_codigos_backup (loja_id, usuario_id, codigo_hash) VALUES (?, ?, ?)",
          [lojaId, usuarioId, hash],
        );
      }

      await registrarAuditoria(conn, usuarioId, "ativar_2fa", "usuario", usuarioId);
      return { codigosBackup };
    });
  });

// ---------- Desativação / reset ----------

const desativarSchema = z.object({ codigo: z.string().trim().min(6) });

export const desativarMeuTotp = createServerFn({ method: "POST" })
  .validator((d: unknown) => desativarSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await validarCodigoTotpOuBackup(conn, usuarioId, data.codigo))) {
        throw new Error("Código inválido.");
      }
      await conn.query(
        "DELETE FROM usuario_totp WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      await conn.query(
        "DELETE FROM usuario_totp_codigos_backup WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      await registrarAuditoria(conn, usuarioId, "desativar_2fa", "usuario", usuarioId);
    });
  });

// Reset administrativo — para quando a pessoa perde o app autenticador E
// os códigos de backup (situação prevista na issue #82). Não pede o
// código atual, só o papel admin.
export const resetarTotpUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ usuarioId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, adminId) => {
      if (await ehAlvoSuperAdmin(conn, data.usuarioId)) {
        throw new Error("Não é possível resetar o 2FA do super-admin da plataforma por aqui.");
      }
      await conn.query(
        "DELETE FROM usuario_totp WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [data.usuarioId],
      );
      await conn.query(
        "DELETE FROM usuario_totp_codigos_backup WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [data.usuarioId],
      );
      await registrarAuditoria(conn, adminId, "resetar_2fa_admin", "usuario", data.usuarioId);
    });
  });

export const regenerarCodigosBackup = createServerFn({ method: "POST" })
  .validator((d: unknown) => desativarSchema.parse(d))
  .handler(async ({ data }): Promise<{ codigosBackup: string[] }> => {
    return comSessao(async (conn, usuarioId, lojaId) => {
      if (!(await validarCodigoTotpOuBackup(conn, usuarioId, data.codigo))) {
        throw new Error("Código inválido.");
      }
      await conn.query(
        "DELETE FROM usuario_totp_codigos_backup WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [usuarioId],
      );
      const codigosBackup = gerarCodigosBackup();
      for (const codigo of codigosBackup) {
        const hash = await bcrypt.hash(codigo, 10);
        await conn.query(
          "INSERT INTO usuario_totp_codigos_backup (loja_id, usuario_id, codigo_hash) VALUES (?, ?, ?)",
          [lojaId, usuarioId, hash],
        );
      }
      await registrarAuditoria(
        conn,
        usuarioId,
        "regenerar_codigos_backup_2fa",
        "usuario",
        usuarioId,
      );
      return { codigosBackup };
    });
  });

// ---------- Verificação compartilhada (self-service e login) ----------

export async function validarCodigoTotpOuBackup(
  conn: import("mysql2/promise").PoolConnection,
  usuarioId: string,
  codigo: string,
): Promise<boolean> {
  // SEM escopo de loja, de propósito: este helper é compartilhado com o
  // login, onde @current_loja_id ainda é NULL — filtrar aqui faria o segundo
  // fator falhar sempre. O usuario_id vem do ticket de 2FA guardado no cookie
  // assinado do servidor, não do request.
  const [[usuario]] = await conn.query<RowDataPacket[]>("SELECT email FROM usuarios WHERE id = ?", [
    usuarioId,
  ]);
  const [[totpRow]] = await conn.query<RowDataPacket[]>(
    "SELECT secret FROM usuario_totp WHERE usuario_id = ? AND ativado_em IS NOT NULL",
    [usuarioId],
  );
  if (!usuario || !totpRow) return false;

  const totp = novoTotp(totpRow.secret, usuario.email);
  if (totp.validate({ token: codigo, window: 1 }) !== null) return true;

  // Não é um código TOTP válido no momento — tenta como código de backup
  // (uso único, marca usado_em ao acertar).
  const [codigosBackup] = await conn.query<RowDataPacket[]>(
    "SELECT id, codigo_hash FROM usuario_totp_codigos_backup WHERE usuario_id = ? AND usado_em IS NULL",
    [usuarioId],
  );
  for (const row of codigosBackup) {
    if (await bcrypt.compare(codigo.toUpperCase(), row.codigo_hash)) {
      await conn.query("UPDATE usuario_totp_codigos_backup SET usado_em = NOW() WHERE id = ?", [
        row.id,
      ]);
      return true;
    }
  }
  return false;
}

/** Chamado por login() em auth.ts depois de validar a senha — indica se
 * esse usuário precisa do segundo fator antes de abrir sessão. */
export async function usuarioTemTotpAtivo(
  conn: import("mysql2/promise").PoolConnection,
  usuarioId: string,
): Promise<boolean> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT 1 FROM usuario_totp WHERE usuario_id = ? AND ativado_em IS NOT NULL",
    [usuarioId],
  );
  return !!row;
}

const confirmarLoginSchema = z.object({ codigo: z.string().trim().min(6) });

export const confirmarLogin2FA = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmarLoginSchema.parse(d))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const usuarioId = await consumirLoginPendente2FA();
    if (!usuarioId) throw new Error("Login expirado — tente novamente.");

    await withUserConnection(null, (conn) => verificarBloqueio(conn, usuarioId));

    const valido = await withUserConnection(null, (conn) =>
      validarCodigoTotpOuBackup(conn, usuarioId, data.codigo),
    );
    if (!valido) {
      // Login segue pendente enquanto a pessoa não acerta o código — não
      // reabrir a janela custaria a ela ter que digitar e-mail/senha de
      // novo à toa por um simples typo no código.
      await salvarLoginPendente2FA(usuarioId);
      await withUserConnection(null, (conn) => registrarTentativaFalha(conn, usuarioId));
      throw new Error("Código inválido.");
    }
    await withUserConnection(null, (conn) => limparTentativas(conn, usuarioId));

    await criarSessao(usuarioId);
    const sessao = await carregarUsuarioComPapeis(usuarioId);
    if (!sessao) throw new Error("Não foi possível entrar.");
    await withUserConnection(usuarioId, (conn) =>
      registrarAuditoria(conn, usuarioId, "login_2fa", "usuario", usuarioId),
    );
    return sessao;
  });
