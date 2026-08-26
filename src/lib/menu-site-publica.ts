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
      `SELECT m.id, m.parent_id, m.label, m.tipo_destino, m.destino
       FROM menu_site m
       LEFT JOIN paginas_site p
         ON m.tipo_destino = 'pagina' AND p.loja_id = @current_loja_id AND p.slug = m.destino
       WHERE m.loja_id = @current_loja_id AND m.visivel = TRUE
         AND (m.tipo_destino <> 'pagina' OR p.status = 'publicado')
       ORDER BY m.ordem ASC`,
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
      if (!item.parent_id) {
        raiz.push(item);
      } else if (porId.has(item.parent_id)) {
        porId.get(item.parent_id)!.filhos.push(item);
      }
      // parent_id preenchido mas ausente de porId (pai oculto, rascunho ou
      // excluído) — descarta em vez de promover o filho à raiz (achado do
      // review automático da PR #385).
    }
    return raiz;
  });
}
