import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";
import { comSessao } from "./authz";
import { criarSessao, encerrarSessao, usuarioIdDaSessao } from "./session";
import { registrarAuditoria } from "./auditoria";
import { carregarUsuarioComPapeis, type Papel, type UsuarioSessao } from "./usuario-sessao";

export type { Papel, UsuarioSessao };

// Aceita e-mail (contas antigas/admin) ou login gerado como nome.sobrenome
// (contas de irmão criadas via painel de usuários) — não força formato de
// e-mail aqui, quem valida isso é o cadastro (signup), não o login.
const loginSchema = z.object({
  email: z.string().min(1),
  senha: z.string().min(1),
});

const signupSchema = z.object({
  nomeCompleto: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(6),
  aceiteLgpd: z.literal(true, { message: "É preciso aceitar a Política de Privacidade." }),
});

export const login = createServerFn({ method: "POST" })
  .validator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const usuario = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, senha_hash, ativo FROM usuarios WHERE email = ?",
        [data.email],
      );
      return rows[0] ?? null;
    });

    if (!usuario || !(await bcrypt.compare(data.senha, usuario.senha_hash))) {
      throw new Error("E-mail ou senha inválidos.");
    }
    if (!usuario.ativo) {
      throw new Error("Usuário inativo. Contate o administrador.");
    }

    await criarSessao(usuario.id);
    const sessao = await carregarUsuarioComPapeis(usuario.id);
    if (!sessao) throw new Error("E-mail ou senha inválidos.");
    await withUserConnection(usuario.id, (conn) =>
      registrarAuditoria(conn, usuario.id, "login", "usuario", usuario.id),
    );
    return sessao;
  });

export const signup = createServerFn({ method: "POST" })
  .validator((data: unknown) => signupSchema.parse(data))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const senhaHash = await bcrypt.hash(data.senha, 10);

    const usuarioId = await withUserConnection(null, async (conn) => {
      await conn.query("CALL criar_usuario(?, ?, ?, @novo_usuario_id)", [
        data.email,
        senhaHash,
        data.nomeCompleto,
      ]);
      const [[{ novo_usuario_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @novo_usuario_id AS novo_usuario_id",
      );
      // aceite explícito do checkbox no formulário — só quem passa por aqui
      // já nasce com consentimento registrado; contas criadas pelo admin
      // (painel de usuários) ficam pendentes até o primeiro login.
      await conn.query("UPDATE usuarios SET consentimento_lgpd_em = NOW() WHERE id = ?", [
        novo_usuario_id,
      ]);
      return novo_usuario_id as string;
    });

    await criarSessao(usuarioId);
    const sessao = await carregarUsuarioComPapeis(usuarioId);
    if (!sessao) throw new Error("Falha ao criar conta.");
    return sessao;
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const usuarioId = await usuarioIdDaSessao();
  await encerrarSessao();
  if (usuarioId) {
    await withUserConnection(usuarioId, (conn) =>
      registrarAuditoria(conn, usuarioId, "logout", "usuario", usuarioId),
    );
  }
});

export const getSessao = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsuarioSessao | null> => {
    const usuarioId = await usuarioIdDaSessao();
    if (!usuarioId) return null;
    return carregarUsuarioComPapeis(usuarioId);
  },
);

export const registrarConsentimentoLgpd = createServerFn({ method: "POST" }).handler(async () => {
  return comSessao(async (conn, usuarioId) => {
    await conn.query("UPDATE usuarios SET consentimento_lgpd_em = NOW() WHERE id = ?", [usuarioId]);
  });
});

const trocarMinhaSenhaSchema = z.object({ novaSenha: z.string().min(3) });

// Self-service — usado tanto pelo gate obrigatório de primeiro acesso
// (/trocar-senha) quanto por uma troca voluntária futura. Sempre limpa
// deve_trocar_senha, mesmo numa troca voluntária (a pessoa já resolveu
// o que a flag pedia).
export const trocarMinhaSenha = createServerFn({ method: "POST" })
  .validator((data: unknown) => trocarMinhaSenhaSchema.parse(data))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      const hash = await bcrypt.hash(data.novaSenha, 10);
      await conn.query(
        "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = FALSE WHERE id = ?",
        [hash, usuarioId],
      );
      // nunca loga a senha em si, só o fato de ter sido trocada.
      await registrarAuditoria(conn, usuarioId, "trocar_senha", "usuario", usuarioId);
    });
  });

export const contarUsuarios = createServerFn({ method: "GET" }).handler(
  async (): Promise<number> => {
    return withUserConnection(null, async (conn) => {
      const [[{ total }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM usuarios",
      );
      return Number(total);
    });
  },
);
