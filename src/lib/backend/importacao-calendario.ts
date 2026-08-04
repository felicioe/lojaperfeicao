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
const PAPEIS_ESCRITA = ["admin", "secretario"];

type Grau = "aprendiz" | "companheiro" | "mestre";

function detectarGrau(texto: string): Grau | null {
  const t = texto.toLowerCase();
  if (/\bmestre\b/.test(t) || /\bgrau\s*3\b/.test(t)) return "mestre";
  if (/\bcompanheiro\b/.test(t) || /\bgrau\s*2\b/.test(t)) return "companheiro";
  if (/\baprendiz\b/.test(t) || /\bgrau\s*1\b/.test(t)) return "aprendiz";
  return null;
}

const itemSchema = z.object({
  titulo: z.string().min(1),
  data: z.string(),
  hora: z.string().nullable(),
  descricao: z.string().nullable(),
});

const importarSchema = z.object({ itens: z.array(itemSchema).max(500) });

export type ItemPreview = {
  titulo: string;
  data: string;
  hora: string | null;
  descricao: string | null;
  tipo: "sessao" | "evento";
  grau: Grau | null;
  duplicado: boolean;
};

async function classificarItens(
  conn: import("mysql2/promise").PoolConnection,
  itens: z.infer<typeof importarSchema>["itens"],
): Promise<ItemPreview[]> {
  const resultado: ItemPreview[] = [];
  for (const item of itens) {
    const grau = detectarGrau(`${item.titulo} ${item.descricao ?? ""}`);
    if (grau) {
      const [[dup]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM sessoes WHERE data = ? AND observacoes = ? LIMIT 1",
        [item.data, item.titulo],
      );
      resultado.push({ ...item, tipo: "sessao", grau, duplicado: !!dup });
    } else {
      const [[dup]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM eventos WHERE data = ? AND titulo = ? LIMIT 1",
        [item.data, item.titulo],
      );
      resultado.push({ ...item, tipo: "evento", grau: null, duplicado: !!dup });
    }
  }
  return resultado;
}

export const previewImportacaoCalendario = createServerFn({ method: "POST" })
  .validator((d: unknown) => importarSchema.parse(d))
  .handler(async ({ data }): Promise<ItemPreview[]> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => classificarItens(conn, data.itens));
  });

export type ResumoImportacao = {
  sessoesCriadas: number;
  eventosCriados: number;
  duplicadosIgnorados: number;
};

export const confirmarImportacaoCalendario = createServerFn({ method: "POST" })
  .validator((d: unknown) => importarSchema.parse(d))
  .handler(async ({ data }): Promise<ResumoImportacao> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const classificados = await classificarItens(conn, data.itens);
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
            "INSERT INTO sessoes (data, tipo, grau, observacoes) VALUES (?, 'ordinaria', ?, ?)",
            [item.data, item.grau, item.titulo],
          );
          sessoesCriadas++;
        } else {
          await conn.query(
            `INSERT INTO eventos (titulo, data, hora, descricao, publico) VALUES (?, ?, ?, ?, 'todos')`,
            [item.titulo, item.data, item.hora, item.descricao],
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
