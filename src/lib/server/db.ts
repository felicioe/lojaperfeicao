import mysql from "mysql2/promise";

// Pool único por processo Node — nunca criar um pool por requisição.
// Ver mysql/README.md, seção 3: a variável de sessão @current_usuario_id
// precisa ser (re)setada a cada checkout do pool, já que a conexão é
// reaproveitada entre requisições de usuários diferentes.
let pool: mysql.Pool | undefined;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      connectionLimit: 10,
      decimalNumbers: true,
      charset: "utf8mb4",
    });
  }
  return pool;
}

/**
 * Retira uma conexão do pool, seta @current_usuario_id para o usuário
 * autenticado da requisição atual (ou NULL, contexto de sistema) e a
 * devolve ao pool ao final — sempre, mesmo em caso de erro.
 */
export async function withUserConnection<T>(
  usuarioId: string | null,
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    if (usuarioId) {
      await conn.query("SET @current_usuario_id = ?", [usuarioId]);
    } else {
      await conn.query("SET @current_usuario_id = NULL");
    }
    return await fn(conn);
  } finally {
    conn.release();
  }
}
