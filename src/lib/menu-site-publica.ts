import type { RowDataPacket } from "mysql2";
import { withLojaConnection } from "./backend/db";
import { LOJA_PORTAL_PUBLICO } from "./loja-portal-publico";
import type { TipoDestinoMenu } from "./backend/menu-site";

export type ItemMenuPublico = {
  label: string;
  tipo_destino: TipoDestinoMenu;
  destino: string;
  filhos: ItemMenuPublico[];
};

/** Monta a árvore (pai + submenu) do menu de navegação público, só com os
 * itens visíveis, ordenados por `ordem` — issue #382 consome isso pra montar
 * a navegação do site institucional embutido. */
export async function carregarMenuPublico(): Promise<ItemMenuPublico[]> {
  return withLojaConnection(LOJA_PORTAL_PUBLICO, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, parent_id, label, tipo_destino, destino
       FROM menu_site
       WHERE loja_id = @current_loja_id AND visivel = TRUE
       ORDER BY ordem ASC`,
    );

    const porId = new Map<string, ItemMenuPublico & { id: string; parent_id: string | null }>();
    for (const row of rows) {
      porId.set(row.id, {
        id: row.id,
        parent_id: row.parent_id,
        label: row.label,
        tipo_destino: row.tipo_destino,
        destino: row.destino,
        filhos: [],
      });
    }

    const raiz: ItemMenuPublico[] = [];
    for (const item of porId.values()) {
      if (item.parent_id && porId.has(item.parent_id)) {
        porId.get(item.parent_id)!.filhos.push(item);
      } else {
        raiz.push(item);
      }
    }
    return raiz;
  });
}
