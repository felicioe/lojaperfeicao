import {
  getSession,
  updateSession,
  clearSession,
  type SessionConfig,
} from "@tanstack/react-start/server";

type SessaoData = { usuarioId: string };

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
