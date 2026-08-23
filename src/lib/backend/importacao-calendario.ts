import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Importação de calendário (.ics/.csv) — issue #22. Equivalente ao
// legado: linhas com grau detectado (>0) viram sessões, as demais viram
// eventos; checagem de duplicidade por data+título. A detecção de grau e
// a checagem de duplicidade rodam aqui (não no preview do cliente) para
// que a confirmação sempre reflita o estado atual do banco, não um
// instantâneo potencialmente desatualizado enviado de volta pelo cliente.
//
// Sistema sem loja simbólica (só corpos filosóficos, ver
// 0019_sessoes_org_grau_numerico.sql): grau é sempre numérico e sessões
// exigem um corpo — o número só vira sessão se cair dentro da faixa
// grau_min/grau_max daquele corpo (evita falso-positivo de "grau" casando
// com qualquer número solto no texto).
const PAPEIS_ESCRITA = ["admin", "secretario"];

function detectarGrau(texto: string): number | null {
  const m = texto.toLowerCase().match(/grau\s*(\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

const itemSchema = z.object({
  titulo: z.string().min(1),
  data: z.string(),
  hora: z.string().nullable(),
  descricao: z.string().nullable(),
});

const importarSchema = z.object({
  orgId: z.string().uuid(),
  itens: z.array(itemSchema).max(500),
});

export type ItemPreview = {
  titulo: string;
  data: string;
  hora: string | null;
  descricao: string | null;
  tipo: "sessao" | "evento";
  grau: number | null;
  duplicado: boolean;
};

async function classificarItens(
  conn: import("mysql2/promise").PoolConnection,
  orgId: string,
  itens: z.infer<typeof importarSchema>["itens"],
): Promise<ItemPreview[]> {
  // O corpo vem do request e é o que amarra a importação inteira a uma Loja:
  // se ele não for desta Loja, nada é lido nem gravado. O loja_id gravado sai
  // sempre da sessão (comPapel), nunca de nada que venha no arquivo.
  const [[org]] = await conn.query<RowDataPacket[]>(
    "SELECT grau_min, grau_max FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
    [orgId],
  );
  if (!org) throw new Error("Corpo maçônico não encontrado nesta Loja.");

  // Duplicidade pré-carregada em dois Sets em vez de um SELECT por item
  // (até 500 idas ao banco antes) — mesmo padrão já usado em
  // importacao-pdf-sessoes.ts (achado da auditoria geral de bugs).
  const [sessoesRows] = await conn.query<RowDataPacket[]>(
    "SELECT data, observacoes FROM sessoes WHERE loja_id = @current_loja_id",
  );
  const sessoesExistentes = new Set(sessoesRows.map((r) => `${r.data}|${r.observacoes}`));
  const [eventosRows] = await conn.query<RowDataPacket[]>(
    "SELECT data, titulo FROM eventos WHERE loja_id = @current_loja_id",
  );
  const eventosExistentes = new Set(eventosRows.map((r) => `${r.data}|${r.titulo}`));

  const resultado: ItemPreview[] = [];
  for (const item of itens) {
    const grauDetectado = detectarGrau(`${item.titulo} ${item.descricao ?? ""}`);
    const grau =
      grauDetectado !== null && grauDetectado >= org.grau_min && grauDetectado <= org.grau_max
        ? grauDetectado
        : null;

    if (grau !== null) {
      const duplicado = sessoesExistentes.has(`${item.data}|${item.titulo}`);
      resultado.push({ ...item, tipo: "sessao", grau, duplicado });
    } else {
      const duplicado = eventosExistentes.has(`${item.data}|${item.titulo}`);
      resultado.push({ ...item, tipo: "evento", grau: null, duplicado });
    }
  }
  return resultado;
}

export const previewImportacaoCalendario = createServerFn({ method: "POST" })
  .validator((d: unknown) => importarSchema.parse(d))
  .handler(async ({ data }): Promise<ItemPreview[]> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => classificarItens(conn, data.orgId, data.itens));
  });

export type ResumoImportacao = {
  sessoesCriadas: number;
  eventosCriados: number;
  duplicadosIgnorados: number;
};

export const confirmarImportacaoCalendario = createServerFn({ method: "POST" })
  .validator((d: unknown) => importarSchema.parse(d))
  .handler(async ({ data }): Promise<ResumoImportacao> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual, lojaId) => {
      const classificados = await classificarItens(conn, data.orgId, data.itens);
      let sessoesCriadas = 0;
      let eventosCriados = 0;
      let duplicadosIgnorados = 0;

      for (const item of classificados) {
        if (item.duplicado) {
          duplicadosIgnorados++;
          continue;
        }
        if (item.tipo === "sessao") {
          await conn.query(
            "INSERT INTO sessoes (loja_id, data, tipo, org_id, grau, observacoes) VALUES (?, ?, 'ordinaria', ?, ?, ?)",
            [lojaId, item.data, data.orgId, item.grau, item.titulo],
          );
          sessoesCriadas++;
        } else {
          await conn.query(
            `INSERT INTO eventos (loja_id, titulo, data, hora, descricao, publico) VALUES (?, ?, ?, ?, ?, 'todos')`,
            [lojaId, item.titulo, item.data, item.hora, item.descricao],
          );
          eventosCriados++;
        }
      }

      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "importar_calendario",
        "calendario",
        null,
        null,
        {
          sessoes_criadas: sessoesCriadas,
          eventos_criados: eventosCriados,
          duplicados_ignorados: duplicadosIgnorados,
        },
      );

      return { sessoesCriadas, eventosCriados, duplicadosIgnorados };
    });
  });
