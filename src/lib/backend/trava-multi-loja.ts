import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

/**
 * Trava temporária para as rotinas do BANCO que ainda não conhecem loja_id.
 *
 * Algumas procedures herdadas do sistema mono-loja (`resetar_financeiro`,
 * `fechar_exercicio`, `reabrir_exercicio`, `criar_orcamento`,
 * `definir_valor_orcamento`…) varrem ou escrevem tabelas multi-tenant sem
 * nenhum filtro de loja. Escopar as queries do TypeScript não alcança elas: o
 * SQL está dentro do banco. Enquanto a #349 não dá um `p_loja_id` a cada uma,
 * o caminho fica trancado assim que existe uma segunda Loja.
 *
 * Com uma Loja só — a situação de hoje em produção — nada muda, porque "todas
 * as Lojas" e "esta Loja" são exatamente o mesmo conjunto. Este arquivo inteiro
 * some quando a #349 for concluída.
 */
export async function exigirLojaUnica(
  conn: PoolConnection,
  acao: string,
  motivo: string,
): Promise<void> {
  const [[{ lojas }]] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS lojas FROM lojas");
  if (Number(lojas) > 1) {
    throw new Error(
      `${acao} está bloqueado enquanto houver mais de uma Loja no sistema: ${motivo} ` +
        "(issue #349). Não execute — avise o administrador da plataforma.",
    );
  }
}
