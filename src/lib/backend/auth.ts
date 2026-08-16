import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";
import { comSessao } from "./authz";
import { criarSessao, encerrarSessao, usuarioIdDaSessao, salvarLoginPendente2FA } from "./session";
import { registrarAuditoria } from "./auditoria";
import { carregarUsuarioComPapeis, type Papel, type UsuarioSessao } from "./usuario-sessao";
import { usuarioTemTotpAtivo } from "./totp";
import { verificarBloqueio, registrarTentativaFalha, limparTentativas } from "./rate-limit";
import { usuarioUnicoParaLogin } from "./login-loja";

export type { Papel, UsuarioSessao };

export type LoginResultado = UsuarioSessao | { requerTotp: true };

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
  .handler(async ({ data }): Promise<LoginResultado> => {
    await withUserConnection(null, (conn) => verificarBloqueio(conn, data.email));

    const usuario = await withUserConnection(null, async (conn) => {
      // Sem LIMIT de propósito: o e-mail é único por loja (migração 0092), e
      // usuarioUnicoParaLogin recusa quando casa em mais de uma — escolher
      // "a primeira" logaria a pessoa numa loja arbitrária (issue #337).
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, senha_hash, ativo FROM usuarios WHERE email = ?",
        [data.email],
      );
      return usuarioUnicoParaLogin(rows);
    });

    if (!usuario || !(await bcrypt.compare(data.senha, usuario.senha_hash))) {
      await withUserConnection(null, (conn) => registrarTentativaFalha(conn, data.email));
      throw new Error("E-mail ou senha inválidos.");
    }
    if (!usuario.ativo) {
      throw new Error("Usuário inativo. Contate o administrador.");
    }
    await withUserConnection(null, (conn) => limparTentativas(conn, data.email));

    // Senha certa, mas 2FA ativo: não abre sessão ainda — falta o código
    // do app autenticador (confirmarLogin2FA, em totp.ts). Passkey não
    // passa por aqui (login próprio em passkeys.ts), já é por si só um
    // segundo fator.
    const precisaTotp = await withUserConnection(usuario.id, (conn) =>
      usuarioTemTotpAtivo(conn, usuario.id),
    );
    if (precisaTotp) {
      await salvarLoginPendente2FA(usuario.id);
      return { requerTotp: true };
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
      // A tela só esconde a aba de cadastro depois do primeiro usuário
      // existir — proteção cosmética. A trava real (achado #155 da revisão
      // de segurança) tem que estar aqui: signup só pode criar o primeiro
      // admin do sistema, nunca mais depois disso — contas seguintes são
      // sempre criadas pelo administrador via painel de usuários.
      const [[{ total }]] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM usuarios",
      );
      if (Number(total) > 0) {
        throw new Error("Cadastro encerrado. Novas contas são criadas pelo administrador.");
      }
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

const trocarMinhaSenhaSchema = z.object({
  novaSenha: z.string().min(3),
  // Só null no fluxo de primeiro acesso (/trocar-senha, deve_trocar_senha
  // ativo) — a pessoa acabou de digitar a senha padrão pra entrar, pedir
  // de novo não agrega segurança. Fora desse fluxo, é obrigatório (achado
  // #184): sem isso, uma sessão válida em dispositivo destravado/vazada
  // bastava pra trocar a senha e travar o dono legítimo fora.
  senhaAtual: z.string().min(1).nullable(),
});

// Self-service — usado tanto pelo gate obrigatório de primeiro acesso
// (/trocar-senha) quanto pela troca voluntária em /conta/seguranca. Sempre
// limpa deve_trocar_senha, mesmo numa troca voluntária (a pessoa já
// resolveu o que a flag pedia).
export const trocarMinhaSenha = createServerFn({ method: "POST" })
  .validator((data: unknown) => trocarMinhaSenhaSchema.parse(data))
  .handler(async ({ data }) => {
    return comSessao(
      async (conn, usuarioId) => {
        const [[usuario]] = await conn.query<RowDataPacket[]>(
          "SELECT senha_hash, deve_trocar_senha FROM usuarios WHERE id = ?",
          [usuarioId],
        );
        if (!usuario.deve_trocar_senha) {
          if (!data.senhaAtual || !(await bcrypt.compare(data.senhaAtual, usuario.senha_hash))) {
            throw new Error("Senha atual incorreta.");
          }
        }
        const hash = await bcrypt.hash(data.novaSenha, 10);
        await conn.query(
          "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = FALSE, senha_alterada_em = NOW() WHERE id = ?",
          [hash, usuarioId],
        );
        // nunca loga a senha em si, só o fato de ter sido trocada.
        await registrarAuditoria(conn, usuarioId, "trocar_senha", "usuario", usuarioId);

        // Todas as OUTRAS sessões (outros dispositivos/abas) ficam
        // inválidas a partir de agora — ver sessaoDesatualizada em
        // authz.ts. Sem isso, a própria sessão atual também cairia no
        // próximo request, já que seu criadaEm é anterior ao
        // senha_alterada_em que acabou de ser gravado; renovamos com o
        // timestamp exato do banco (não Date.now() do Node, pra não
        // arriscar um relógio ligeiramente atrasado invalidar a si mesma).
        const [[{ agora }]] = await conn.query<RowDataPacket[]>("SELECT NOW() AS agora");
        await criarSessao(usuarioId, new Date(agora).getTime());
      },
      // Precisa ignorar os próprios gates que essa função existe pra
      // satisfazer — senão quem está com deve_trocar_senha=true nunca
      // conseguiria destravar a própria conta, e uma segunda troca
      // voluntária na mesma sessão sempre falharia (a primeira troca já
      // atualizou senha_alterada_em pra depois do início da sessão atual).
      { ignorarTrocaSenhaObrigatoria: true, ignorarSessaoDesatualizada: true },
    );
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
