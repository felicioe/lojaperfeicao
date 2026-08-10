import {
  getSession,
  updateSession,
  clearSession,
  type SessionConfig,
} from "@tanstack/react-start/server";

type SessaoData = {
  usuarioId?: string;
  // Timestamp (epoch ms) de quando essa sessão foi criada — comSessao/
  // comPapel (authz.ts) comparam com usuarios.senha_alterada_em pra tratar
  // como inválida qualquer sessão mais velha que a última troca de senha
  // (issue #184). Só existe em sessões criadas depois dessa mudança;
  // sessões antigas (sem o campo) são tratadas como válidas até expirarem
  // naturalmente pelo maxAge do cookie.
  criadaEm?: number;
  // Desafio WebAuthn (cadastro ou login de passkey) em andamento — vive só
  // durante a cerimônia (challenge gerado -> resposta do navegador chega
  // em segundos), guardado no cookie de sessão assinado pra não precisar
  // de tabela própria pra algo tão efêmero. webauthnPendingUsuarioId só é
  // usado no LOGIN por passkey (antes de existir usuarioId de sessão): é
  // o usuário sendo autenticado, resolvido por e-mail antes do desafio.
  webauthnChallenge?: string;
  webauthnPendingUsuarioId?: string;
  // Login por senha validado, mas o usuário tem 2FA (TOTP) ativo — falta
  // confirmar o código do app antes de criarSessao de verdade. Mesmo
  // espírito de webauthnPendingUsuarioId (usuário sendo autenticado, ainda
  // sem usuarioId de sessão).
  totpPendingUsuarioId?: string;
};

function sessionConfig(): SessionConfig {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET não configurada (ou com menos de 32 caracteres) — necessária para selar o cookie de sessão.",
    );
  }
  return {
    password,
    name: "loja_sessao",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

/** Usuário autenticado da requisição atual, ou null se não houver sessão. */
export async function usuarioIdDaSessao(): Promise<string | null> {
  const session = await getSession<SessaoData>(sessionConfig());
  return session.data.usuarioId ?? null;
}

/** Timestamp (epoch ms) de criação da sessão atual — null se a sessão for
 * anterior à introdução desse campo, ou se não houver sessão. */
export async function criadaEmDaSessao(): Promise<number | null> {
  const session = await getSession<SessaoData>(sessionConfig());
  return session.data.criadaEm ?? null;
}

export async function criarSessao(usuarioId: string, criadaEm: number = Date.now()): Promise<void> {
  await updateSession<SessaoData>(sessionConfig(), { usuarioId, criadaEm });
}

export async function encerrarSessao(): Promise<void> {
  await clearSession(sessionConfig());
}

/** Guarda o desafio WebAuthn gerado pra essa cerimônia (cadastro ou login de
 * passkey) — `usuarioPendente` só se aplica ao login (usuário ainda não
 * autenticado na sessão). */
export async function salvarDesafioWebauthn(
  challenge: string,
  usuarioPendente?: string,
): Promise<void> {
  await updateSession<SessaoData>(sessionConfig(), {
    webauthnChallenge: challenge,
    webauthnPendingUsuarioId: usuarioPendente,
  });
}

/** Lê e imediatamente invalida o desafio guardado — cada desafio só pode
 * ser consumido uma vez, sucesso ou falha. */
export async function consumirDesafioWebauthn(): Promise<{
  challenge: string;
  usuarioPendente: string | null;
} | null> {
  const session = await getSession<SessaoData>(sessionConfig());
  const challenge = session.data.webauthnChallenge;
  const usuarioPendente = session.data.webauthnPendingUsuarioId ?? null;
  await updateSession<SessaoData>(sessionConfig(), {
    webauthnChallenge: undefined,
    webauthnPendingUsuarioId: undefined,
  });
  if (!challenge) return null;
  return { challenge, usuarioPendente };
}

/** Marca que a senha já foi validada para esse usuário, mas falta o código
 * TOTP — usado entre login() e confirmarLogin2FA(). */
export async function salvarLoginPendente2FA(usuarioId: string): Promise<void> {
  await updateSession<SessaoData>(sessionConfig(), { totpPendingUsuarioId: usuarioId });
}

/** Lê e imediatamente invalida o usuário pendente de 2FA — cada login
 * parcial só pode ser concluído uma vez, sucesso ou falha. */
export async function consumirLoginPendente2FA(): Promise<string | null> {
  const session = await getSession<SessaoData>(sessionConfig());
  const usuarioPendente = session.data.totpPendingUsuarioId ?? null;
  await updateSession<SessaoData>(sessionConfig(), { totpPendingUsuarioId: undefined });
  return usuarioPendente;
}
