import {
  getSession,
  updateSession,
  clearSession,
  type SessionConfig,
} from "@tanstack/react-start/server";
// h3-v2 é a mesma versão do h3 que @tanstack/start-server-core usa por baixo
// dos panos pra ler/decifrar o cookie de sessão (getSession acima só
// funciona DENTRO do pipeline de request do TanStack Start — precisa de um
// H3Event já publicado no AsyncLocalStorage interno, ver getH3Event() em
// @tanstack/start-server-core/request-response.js). As rotas de download
// autenticado de arquivo (issue #710, /api/documentos/:id/arquivo e
// /api/biblioteca/:id/arquivo, em server.ts) rodam FORA desse pipeline —
// mesma limitação já documentada em google-oauth-callback.ts — mas,
// diferente do callback do Google, aqui precisamos mesmo da identidade do
// usuário pra checar permissão antes de servir o binário. H3Event pode ser
// construído diretamente a partir do Request cru (é exatamente o que o
// requestHandler do TanStack faz internamente), e a própria função
// getSession do h3 aceita esse evento — não precisa do wrapper do
// TanStack. "h3-v2" é dependência direta de @tanstack/start-server-core
// (fixada como alias pro pacote "h3"); fixamos a mesma versão em
// package.json para não depender só do hoisting do npm.
import { H3Event, getSession as getSessaoH3 } from "h3-v2";

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

/** Equivalente a usuarioIdDaSessao()+criadaEmDaSessao(), mas lendo o cookie
 * direto de um Request cru — para as poucas rotas HTTP (fora do pipeline do
 * TanStack Start, ver comentário no topo do arquivo) que precisam checar
 * sessão antes de servir uma resposta binária (issue #710). Nunca lança —
 * cookie ausente/corrompido/expirado vira null, igual a "não autenticado". */
export async function dadosSessaoCrua(
  request: Request,
): Promise<{ usuarioId: string; criadaEm: number | null } | null> {
  try {
    const event = new H3Event(request);
    const session = await getSessaoH3<SessaoData>(event, sessionConfig());
    if (!session.data.usuarioId) return null;
    return { usuarioId: session.data.usuarioId, criadaEm: session.data.criadaEm ?? null };
  } catch {
    return null;
  }
}

export async function criarSessao(usuarioId: string, criadaEm: number = Date.now()): Promise<void> {
  await updateSession<SessaoData>(sessionConfig(), { usuarioId, criadaEm });
}

// Achado #611 da auditoria de autenticação: isto só apaga o cookie deste
// navegador — não existe tabela de sessões no servidor, então uma cópia
// bruta do cookie (dispositivo destravado, extração de disco, log de
// proxy) continua autenticando normalmente por até 30 dias mesmo depois
// do "Sair", porque nada no servidor muda pra aquele token específico. A
// mitigação real pra "suspeito que fui comprometido" já existe e é a
// troca de senha: comSessao/comPapel (authz.ts) invalidam qualquer sessão
// mais velha que usuarios.senha_alterada_em.
//
// Corrigir isso de verdade exigiria uma tabela de sessões por dispositivo
// e checagem de revogação em toda requisição autenticada — mudança
// arquitetural no núcleo de autenticação, não um ajuste pontual. Decisão
// confirmada com o usuário: não implementar agora, dado o porte pequeno
// das lojas e a mitigação parcial já existente via troca de senha. Não
// alterar sem confirmar de novo com o usuário.
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
