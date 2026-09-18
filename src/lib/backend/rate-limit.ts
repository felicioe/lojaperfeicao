import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

// Proteção contra força bruta (issue #183) — usada no login por senha e na
// confirmação de 2FA. Sem Redis nesta hospedagem, então o contador vive
// numa tabela simples (mysql/migrations/0050); chave normalizada em minúsculo
// pra não deixar "Fulano@Exemplo.com" e "fulano@exemplo.com" contarem
// separado.
const LIMITE_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

export class LoginBloqueadoError extends Error {
  constructor() {
    super(`Muitas tentativas. Tente novamente em ${BLOQUEIO_MINUTOS} minutos.`);
  }
}

function normalizarChave(chave: string): string {
  return chave.trim().toLowerCase();
}

/** Lança LoginBloqueadoError se a chave estiver em período de bloqueio. */
export async function verificarBloqueio(conn: PoolConnection, chave: string): Promise<void> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT bloqueado_ate FROM tentativas_login WHERE chave = ?",
    [normalizarChave(chave)],
  );
  if (row?.bloqueado_ate && new Date(row.bloqueado_ate) > new Date()) {
    throw new LoginBloqueadoError();
  }
}

/** Incrementa o contador de falhas; bloqueia a chave ao atingir o limite. */
export async function registrarTentativaFalha(conn: PoolConnection, chave: string): Promise<void> {
  const chaveNormalizada = normalizarChave(chave);
  await conn.query(
    `INSERT INTO tentativas_login (chave, tentativas)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE tentativas = tentativas + 1`,
    [chaveNormalizada],
  );
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT tentativas FROM tentativas_login WHERE chave = ?",
    [chaveNormalizada],
  );
  if (row && row.tentativas >= LIMITE_TENTATIVAS) {
    await conn.query(
      "UPDATE tentativas_login SET tentativas = 0, bloqueado_ate = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE chave = ?",
      [BLOQUEIO_MINUTOS, chaveNormalizada],
    );
  }
}

/** Zera o contador após um login bem-sucedido. */
export async function limparTentativas(conn: PoolConnection, chave: string): Promise<void> {
  await conn.query("DELETE FROM tentativas_login WHERE chave = ?", [normalizarChave(chave)]);
}

// Bloqueio por chave (e-mail/login) cobre força bruta contra UMA conta, mas
// não impede um atacante tentar a mesma senha comum contra muitos e-mails
// diferentes (password spraying) — cada e-mail tem seu próprio contador
// (achado de auditoria AppSec, 2026-09-18). Reaproveita a mesma tabela com
// um prefixo de chave diferente, escopado por IP em vez de por conta; limite
// mais alto que o por-conta pra não travar uma loja inteira atrás do mesmo
// NAT/proxy corporativo.
const LIMITE_TENTATIVAS_IP = 30;

export async function verificarBloqueioIp(conn: PoolConnection, ip: string): Promise<void> {
  await verificarBloqueio(conn, `ip:${ip}`);
}

export async function registrarTentativaFalhaIp(conn: PoolConnection, ip: string): Promise<void> {
  const chave = normalizarChave(`ip:${ip}`);
  await conn.query(
    `INSERT INTO tentativas_login (chave, tentativas)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE tentativas = tentativas + 1`,
    [chave],
  );
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT tentativas FROM tentativas_login WHERE chave = ?",
    [chave],
  );
  if (row && row.tentativas >= LIMITE_TENTATIVAS_IP) {
    await conn.query(
      "UPDATE tentativas_login SET tentativas = 0, bloqueado_ate = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE chave = ?",
      [BLOQUEIO_MINUTOS, chave],
    );
  }
}
