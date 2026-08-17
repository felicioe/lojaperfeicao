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
type OpcoesAutorizacao = {
  ignorarTrocaSenhaObrigatoria?: boolean;
  ignorarSessaoDesatualizada?: boolean;
};

/**
 * Porteiro de toda requisição autenticada: valida a senha/sessão e resolve a
 * loja (tenant) do contexto, devolvendo o id da loja.
 *
 * As três checagens vêm de uma query só — antes eram duas (deve_trocar_senha
 * e senha_alterada_em, cada uma com seu SELECT) e a loja seria uma terceira.
 * Numa hospedagem compartilhada com pool pequeno, economizar duas idas ao
 * banco por requisição não é micro-otimização.
 *
 * O que cada checagem defende:
 *
 * - `deve_trocar_senha`: a troca obrigatória até então só existia como
 *   redirecionamento no roteador React — quem chamasse uma server function
 *   direto nunca era barrado (achado #156 da revisão de segurança). As
 *   poucas funções que o próprio fluxo de troca precisa passam
 *   `ignorarTrocaSenhaObrigatoria`.
 *
 * - `senha_alterada_em`: sessão é cookie assinado stateless, não dá pra
 *   "derrubar" a de outro dispositivo. Em vez disso, toda sessão criada
 *   ANTES da última troca de senha é tratada como inválida (achado #184) —
 *   quem trocou a senha pra travar um acesso vazado não queria que a sessão
 *   antiga valesse por mais 30 dias.
 *
 * - loja: `@current_loja_id` é derivado do usuário em withUserConnection
 *   (db.ts). Aqui confirmamos que ela existe e está ativa. Usuário órfão
 *   (sem loja) é recusado em vez de rodar com escopo nulo e comportamento
 *   imprevisível; loja inativa (suspensa pelo super-admin, issue #339)
 *   barra todos os usuários dela na hora, não só no próximo login.
 */
async function checarSessaoEResolverLoja(
  conn: PoolConnection,
  usuarioId: string,
  opcoes: OpcoesAutorizacao | undefined,
): Promise<string> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT u.deve_trocar_senha, u.senha_alterada_em, l.id AS loja_id, l.ativa AS loja_ativa
       FROM usuarios u
       LEFT JOIN lojas l ON l.id = u.loja_id
      WHERE u.id = ?`,
    [usuarioId],
  );
  if (!row) throw new SemPermissaoError("Não autenticado.");

  if (!opcoes?.ignorarTrocaSenhaObrigatoria && row.deve_trocar_senha) {
    throw new SemPermissaoError("Troque sua senha antes de continuar.");
  }
  if (!opcoes?.ignorarSessaoDesatualizada && row.senha_alterada_em) {
    const criadaEm = await criadaEmDaSessao();
    // Sessão anterior à introdução do campo: tratada como válida até expirar
    // naturalmente pelo maxAge do cookie.
    if (criadaEm && new Date(row.senha_alterada_em).getTime() > criadaEm) {
      throw new SemPermissaoError("Sua senha foi alterada. Faça login novamente.");
    }
  }

  if (!row.loja_id) throw new SemPermissaoError("Usuário sem loja associada.");
  if (!row.loja_ativa) {
    throw new SemPermissaoError("Esta loja está inativa. Contate o administrador.");
  }
  return row.loja_id as string;
}

/** Equivalente a `TO authenticated USING (true)`: só exige sessão válida.
 * O terceiro argumento do callback é a loja do contexto — a maioria das
 * queries não precisa dele (usa `loja_id = @current_loja_id` direto no SQL),
 * mas quem monta INSERT em JS ou chama procedure com loja explícita usa. */
export async function comSessao<T>(
  fn: (conn: PoolConnection, usuarioId: string, lojaId: string) => Promise<T>,
  opcoes?: OpcoesAutorizacao,
): Promise<T> {
  const usuarioId = await usuarioIdDaSessao();
  if (!usuarioId) throw new SemPermissaoError("Não autenticado.");
  return withUserConnection(usuarioId, async (conn) => {
    const lojaId = await checarSessaoEResolverLoja(conn, usuarioId, opcoes);
    return fn(conn, usuarioId, lojaId);
  });
}

/**
 * Autorização do administrador da PLATAFORMA (papel `super_admin`, issue
 * #339) — deliberadamente fora do escopo de qualquer loja.
 *
 * Por que não é só `comPapel(["super_admin"], ...)`: o callback de comPapel
 * recebe a loja do usuário e o contrato implícito é "aja dentro dela". Quem
 * administra o SaaS age sobre o cadastro das lojas, que não pertence a
 * nenhuma — devolver um lojaId aqui convidaria a escrever query escopada
 * onde escopo é exatamente o que não se quer. O callback só recebe conexão e
 * usuário; toda query desta camada nomeia a loja explicitamente.
 *
 * As checagens de sessão (troca de senha obrigatória, senha alterada, loja
 * ativa) são as mesmas — ser dono do SaaS não dispensa nenhuma delas. Vale
 * notar que a loja do próprio super-admin precisa continuar ativa: é por
 * isso que `definirLojaAtiva` (saas-lojas.ts) recusa inativar uma loja que
 * abriga um super-admin, senão ele se trancaria pra fora da plataforma.
 *
 * Não dá acesso a dado interno de loja nenhuma: sem impersonação nesta fase
 * (decisão registrada na issue #339).
 */
export async function comSuperAdmin<T>(
  fn: (conn: PoolConnection, usuarioId: string) => Promise<T>,
): Promise<T> {
  const usuarioId = await usuarioIdDaSessao();
  if (!usuarioId) throw new SemPermissaoError("Não autenticado.");
  return withUserConnection(usuarioId, async (conn) => {
    await checarSessaoEResolverLoja(conn, usuarioId, undefined);
    const [[row]] = await conn.query<RowDataPacket[]>(
      "SELECT has_role(@current_usuario_id, 'super_admin') AS ok",
    );
    if (!row.ok) throw new SemPermissaoError();
    return fn(conn, usuarioId);
  });
}

/** Equivalente a uma policy `USING (has_role(auth.uid(), 'x') OR has_role(auth.uid(), 'y'))`. */
export async function comPapel<T>(
  papeis: string[],
  fn: (conn: PoolConnection, usuarioId: string, lojaId: string) => Promise<T>,
  opcoes?: OpcoesAutorizacao,
): Promise<T> {
  const usuarioId = await usuarioIdDaSessao();
  if (!usuarioId) throw new SemPermissaoError("Não autenticado.");
  return withUserConnection(usuarioId, async (conn) => {
    const lojaId = await checarSessaoEResolverLoja(conn, usuarioId, opcoes);
    const condicoes = papeis.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
    const [[row]] = await conn.query<RowDataPacket[]>(`SELECT (${condicoes}) AS ok`, papeis);
    if (!row.ok) throw new SemPermissaoError();
    return fn(conn, usuarioId, lojaId);
  });
}
