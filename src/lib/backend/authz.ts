import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";
import { usuarioIdDaSessao, criadaEmDaSessao } from "./session";

/**
 * Substitui, na camada de aplicação, as policies de RLS do Postgres
 * (ver mysql/README.md, seção 4). A checagem em si continua acontecendo no
 * banco (via has_role()), não numa lista de papéis em cache no processo Node
 * — mesma filosofia de "a escrita verifica a permissão sozinha".
 */
export class SemPermissaoError extends Error {
  constructor(message = "Sem permissão.") {
    super(message);
  }
}

/**
 * A troca de senha obrigatória (deve_trocar_senha) até agora só existia como
 * redirecionamento no roteador React (_authenticated/route.tsx) — quem
 * chamasse uma função de servidor direto, sem passar pela navegação, nunca
 * era barrado (achado #156 da revisão de segurança). Toda escrita/leitura
 * que passa por comSessao/comPapel agora recusa continuar enquanto a flag
 * estiver ativa, exceto as poucas funções que o próprio fluxo de troca
 * precisa (passadas com ignorarTrocaSenhaObrigatoria: true).
 */
async function usuarioDeveTrocarSenha(conn: PoolConnection, usuarioId: string): Promise<boolean> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT deve_trocar_senha FROM usuarios WHERE id = ?",
    [usuarioId],
  );
  return !!row?.deve_trocar_senha;
}

/**
 * Sessão é um cookie assinado stateless — não dá pra "derrubar" um cookie
 * específico de outro dispositivo. Em vez disso, qualquer sessão criada
 * ANTES da última troca de senha (usuarios.senha_alterada_em) é tratada
 * como inválida (achado #184 da revisão de segurança): alguém que trocou a
 * senha pra travar um acesso vazado/dispositivo perdido não queria que a
 * sessão antiga continuasse valendo por até 30 dias.
 */
async function sessaoDesatualizada(conn: PoolConnection, usuarioId: string): Promise<boolean> {
  const criadaEm = await criadaEmDaSessao();
  if (!criadaEm) return false; // sessão anterior à introdução desse campo
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT senha_alterada_em FROM usuarios WHERE id = ?",
    [usuarioId],
  );
  if (!row?.senha_alterada_em) return false;
  return new Date(row.senha_alterada_em).getTime() > criadaEm;
}

type OpcoesAutorizacao = {
  ignorarTrocaSenhaObrigatoria?: boolean;
  ignorarSessaoDesatualizada?: boolean;
};

async function checarSenha(
  conn: PoolConnection,
  usuarioId: string,
  opcoes: OpcoesAutorizacao | undefined,
): Promise<void> {
  if (!opcoes?.ignorarTrocaSenhaObrigatoria && (await usuarioDeveTrocarSenha(conn, usuarioId))) {
    throw new SemPermissaoError("Troque sua senha antes de continuar.");
  }
  if (!opcoes?.ignorarSessaoDesatualizada && (await sessaoDesatualizada(conn, usuarioId))) {
    throw new SemPermissaoError("Sua senha foi alterada. Faça login novamente.");
  }
}

/** Equivalente a `TO authenticated USING (true)`: só exige sessão válida. */
export async function comSessao<T>(
  fn: (conn: PoolConnection, usuarioId: string) => Promise<T>,
  opcoes?: OpcoesAutorizacao,
): Promise<T> {
  const usuarioId = await usuarioIdDaSessao();
  if (!usuarioId) throw new SemPermissaoError("Não autenticado.");
  return withUserConnection(usuarioId, async (conn) => {
    await checarSenha(conn, usuarioId, opcoes);
    return fn(conn, usuarioId);
  });
}

/** Equivalente a uma policy `USING (has_role(auth.uid(), 'x') OR has_role(auth.uid(), 'y'))`. */
export async function comPapel<T>(
  papeis: string[],
  fn: (conn: PoolConnection, usuarioId: string) => Promise<T>,
  opcoes?: OpcoesAutorizacao,
): Promise<T> {
  const usuarioId = await usuarioIdDaSessao();
  if (!usuarioId) throw new SemPermissaoError("Não autenticado.");
  return withUserConnection(usuarioId, async (conn) => {
    await checarSenha(conn, usuarioId, opcoes);
    const condicoes = papeis.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
    const [[row]] = await conn.query<RowDataPacket[]>(`SELECT (${condicoes}) AS ok`, papeis);
    if (!row.ok) throw new SemPermissaoError();
    return fn(conn, usuarioId);
  });
}
