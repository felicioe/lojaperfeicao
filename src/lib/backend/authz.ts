import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";
import { usuarioIdDaSessao } from "./session";

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

/** Equivalente a `TO authenticated USING (true)`: só exige sessão válida. */
export async function comSessao<T>(fn: (conn: PoolConnection, usuarioId: string) => Promise<T>): Promise<T> {
  const usuarioId = await usuarioIdDaSessao();
  if (!usuarioId) throw new SemPermissaoError("Não autenticado.");
  return withUserConnection(usuarioId, (conn) => fn(conn, usuarioId));
}

/** Equivalente a uma policy `USING (has_role(auth.uid(), 'x') OR has_role(auth.uid(), 'y'))`. */
export async function comPapel<T>(
  papeis: string[],
  fn: (conn: PoolConnection, usuarioId: string) => Promise<T>,
): Promise<T> {
  const usuarioId = await usuarioIdDaSessao();
  if (!usuarioId) throw new SemPermissaoError("Não autenticado.");
  return withUserConnection(usuarioId, async (conn) => {
    const condicoes = papeis.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
    const [[row]] = await conn.query<RowDataPacket[]>(`SELECT (${condicoes}) AS ok`, papeis);
    if (!row.ok) throw new SemPermissaoError();
    return fn(conn, usuarioId);
  });
}
