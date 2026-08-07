import {
  getSession,
  updateSession,
  clearSession,
  type SessionConfig,
} from "@tanstack/react-start/server";

type SessaoData = {
  usuarioId?: string;
  // Desafio WebAuthn (cadastro ou login de passkey) em andamento — vive só
  // durante a cerimônia (challenge gerado -> resposta do navegador chega
  // em segundos), guardado no cookie de sessão assinado pra não precisar
  // de tabela própria pra algo tão efêmero. webauthnPendingUsuarioId só é
  // usado no LOGIN por passkey (antes de existir usuarioId de sessão): é
  // o usuário sendo autenticado, resolvido por e-mail antes do desafio.
  webauthnChallenge?: string;
  webauthnPendingUsuarioId?: string;
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

export async function criarSessao(usuarioId: string): Promise<void> {
  await updateSession<SessaoData>(sessionConfig(), { usuarioId });
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
