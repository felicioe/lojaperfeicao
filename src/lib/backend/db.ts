import mysql from "mysql2/promise";

// Pool único por processo Node — nunca criar um pool por requisição.
// Ver mysql/README.md, seção 3: a variável de sessão @current_usuario_id
// precisa ser (re)setada a cada checkout do pool, já que a conexão é
// reaproveitada entre requisições de usuários diferentes.
let pool: mysql.Pool | undefined;

// mysql2 não converte TINYINT(1)/BOOLEAN para boolean do JS por padrão —
// devolve 0/1 (number). Sem isso, toda coluna BOOLEAN (ativo, presente,
// fundador, pago, is_mensalidade etc.) voltaria como número para o
// front-end, apesar dos tipos TypeScript declararem `boolean`. Confirmado
// localmente contra MariaDB (SELECT ... de uma coluna BOOLEAN real
// devolvia `{ativo: 1}`, typeof "number", antes deste typeCast).
type CampoTipado = { type: string; length: number; string: () => string | null };

function typeCast(field: CampoTipado, next: () => unknown) {
  if (field.type === "TINY" && field.length === 1) {
    return field.string() === "1";
  }
  return next();
}

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      // Hospedagem compartilhada (Hostinger) tem um limite baixo de conexões
      // MySQL concorrentes — configurável via env var em vez de fixo, para
      // poder ajustar ao plano real sem novo deploy. Ver mysql/README.md,
      // seção 14. Default conservador (5) se a env var não for setada.
      connectionLimit: process.env.MYSQL_CONNECTION_LIMIT
        ? Number(process.env.MYSQL_CONNECTION_LIMIT)
        : 5,
      decimalNumbers: true,
      charset: "utf8mb4",
      // DATE/DATETIME/TIMESTAMP como string 'YYYY-MM-DD'/'YYYY-MM-DD HH:MM:SS'
      // (não Date do JS) — é o formato que todo o front-end já espera (mesmo
      // formato que o Postgres/Supabase devolvia) e evita o descompasso de
      // fuso horário de serializar um Date como ISO com hora embutida.
      dateStrings: true,
      typeCast,
    });
  }
  return pool;
}

/**
 * Retira uma conexão do pool, seta @current_usuario_id para o usuário
 * autenticado da requisição atual (ou NULL, contexto de sistema) e a
 * devolve ao pool ao final — sempre, mesmo em caso de erro.
 *
 * Também seta @current_loja_id (issue #337), **derivado do próprio usuário**
 * (`usuarios.loja_id`) em vez de recebido por parâmetro. Isso é deliberado:
 * a loja do contexto nunca pode divergir de quem está autenticado, e nenhum
 * chamador precisa lembrar de passar (ou pode passar errado) a loja. Toda
 * query multi-tenant filtra por `loja_id = @current_loja_id` — SQL puro, sem
 * parâmetro extra em nenhuma das ~350 server functions.
 *
 * Sem usuário (contexto de sistema), @current_loja_id fica NULL e as queries
 * escopadas não retornam nada — o que é o comportamento correto: um cron que
 * precisa varrer lojas usa withLojaConnection() e diz explicitamente qual é.
 */
export async function withUserConnection<T>(
  usuarioId: string | null,
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    if (usuarioId) {
      await conn.query(
        "SET @current_usuario_id = ?, @current_loja_id = (SELECT loja_id FROM usuarios WHERE id = ?)",
        [usuarioId, usuarioId],
      );
    } else {
      await conn.query("SET @current_usuario_id = NULL, @current_loja_id = NULL");
    }
    return await fn(conn);
  } finally {
    conn.release();
  }
}

/**
 * Conexão de contexto de sistema com uma loja explícita — para trabalho sem
 * usuário autenticado que mesmo assim pertence a uma loja: crons de
 * notificação/lembrete/backup, fila de e-mail, agenda pública (issue #341).
 * @current_usuario_id fica NULL (a auditoria registra como ação de sistema),
 * mas @current_loja_id é setado, então as queries escopadas funcionam
 * normalmente para aquela loja.
 */
export async function withLojaConnection<T>(
  lojaId: string,
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.query("SET @current_usuario_id = NULL, @current_loja_id = ?", [lojaId]);
    return await fn(conn);
  } finally {
    conn.release();
  }
}

/** Ids de todas as lojas ativas — ponto de partida dos crons que precisam
 * iterar loja a loja (issue #341). */
export async function listarLojasAtivas(): Promise<{ id: string; slug: string; nome: string }[]> {
  const conn = await getPool().getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT id, slug, nome FROM lojas WHERE ativa = TRUE ORDER BY nome",
    );
    return rows as { id: string; slug: string; nome: string }[];
  } finally {
    conn.release();
  }
}
