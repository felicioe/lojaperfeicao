import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Tabela de valores (mensalidade, iniciação, troca de grau — parte da
// Loja) com data de vigência. Puro histórico/referência — só a operação
// "reajustar mensalidade em massa" abaixo também atualiza
// irmaos.valor_mensalidade (a cobrança de verdade), tudo mais aqui é só
// consulta/registro.
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

export type TIPOS_SUGERIDOS_KEY = "mensalidade" | "iniciacao" | "troca_grau_loja";
export const TIPOS_SUGERIDOS: { valor: TIPOS_SUGERIDOS_KEY; label: string }[] = [
  { valor: "mensalidade", label: "Mensalidade" },
  { valor: "iniciacao", label: "Iniciação" },
  { valor: "troca_grau_loja", label: "Troca de Grau (Loja)" },
];

export type ValorVigente = {
  id: string;
  tipo: string;
  org_id: string | null;
  org_nome: string | null;
  valor: number;
  vigencia_inicio: string;
  observacoes: string | null;
};

export const listarTabelaValores = createServerFn({ method: "GET" }).handler(
  async (): Promise<ValorVigente[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT tv.id, tv.tipo, tv.org_id, o.nome AS org_nome, tv.valor, tv.vigencia_inicio, tv.observacoes
         FROM tabela_valores tv
         LEFT JOIN orgs o ON o.id = tv.org_id
         ORDER BY tv.tipo, tv.vigencia_inicio DESC`,
      );
      return rows as ValorVigente[];
    });
  },
);

const criarValorSchema = z.object({
  tipo: z.string().min(1),
  orgId: z.string().uuid().nullable(),
  valor: z.number().nonnegative(),
  vigenciaInicio: z.string(),
  observacoes: z.string().nullable(),
});

export const criarValorVigente = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarValorSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query(
        "INSERT INTO tabela_valores (tipo, org_id, valor, vigencia_inicio, observacoes) VALUES (?, ?, ?, ?, ?)",
        [data.tipo, data.orgId, data.valor, data.vigenciaInicio, data.observacoes],
      );
      await registrarAuditoria(conn, usuarioIdAtual, "criar", "tabela_valores", null, null, {
        ...data,
      });
    });
  });

export const excluirValorVigente = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM tabela_valores WHERE id = ?", [data.id]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "excluir",
        "tabela_valores",
        data.id,
        null,
        null,
      );
    });
  });

export const contarIrmaosParaReajuste = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ apenasComValorAtual: z.number().nonnegative().nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<number> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const condicoes = [
        "situacao IN ('ativo', 'quite', 'irregular')",
        "valor_mensalidade_customizado = FALSE",
      ];
      const valores: unknown[] = [];
      if (data.apenasComValorAtual !== null) {
        condicoes.push("valor_mensalidade = ?");
        valores.push(data.apenasComValorAtual);
      }
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM irmaos WHERE ${condicoes.join(" AND ")}`,
        valores,
      );
      return Number(row.total);
    });
  });

const reajusteSchema = z.object({
  novoValor: z.number().positive(),
  vigenciaInicio: z.string(),
  observacoes: z.string().nullable(),
  apenasComValorAtual: z.number().nonnegative().nullable(),
});

export type ResultadoReajuste = { irmaosAtualizados: number };

// Reajuste em massa: grava a nova vigência na tabela de valores E atualiza
// irmaos.valor_mensalidade de quem está ativo — só afeta gerações futuras
// de mensalidade (gerar_mensalidades lê o valor no momento em que roda);
// lançamentos já gerados nunca são tocados. Nunca inclui quem tem
// valor_mensalidade_customizado = TRUE (mensalidade negociada à parte, ver
// atualizarPerfilIrmao) — e quem É incluído aqui passa a
// valor_mensalidade_customizado = FALSE, porque está justamente entrando
// no valor padrão de propósito (achado #5 da auditoria financeira: antes
// disso, mesmo "poupando" alguém do valor_mensalidade, gerar_mensalidades
// aplicava o histórico global da Tabela de Valores nele mesmo assim).
export const reajustarMensalidadeEmMassa = createServerFn({ method: "POST" })
  .validator((d: unknown) => reajusteSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoReajuste> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      await conn.query(
        "INSERT INTO tabela_valores (tipo, org_id, valor, vigencia_inicio, observacoes) VALUES ('mensalidade', NULL, ?, ?, ?)",
        [data.novoValor, data.vigenciaInicio, data.observacoes],
      );

      const condicoes = [
        "situacao IN ('ativo', 'quite', 'irregular')",
        "valor_mensalidade_customizado = FALSE",
      ];
      const valores: unknown[] = [];
      if (data.apenasComValorAtual !== null) {
        condicoes.push("valor_mensalidade = ?");
        valores.push(data.apenasComValorAtual);
      }
      const [resultado] = await conn.query<ResultSetHeader>(
        `UPDATE irmaos SET valor_mensalidade = ? WHERE ${condicoes.join(" AND ")}`,
        [data.novoValor, ...valores],
      );

      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "reajustar_mensalidade_em_massa",
        "tabela_valores",
        null,
        null,
        { ...data, irmaos_atualizados: resultado.affectedRows },
      );

      return { irmaosAtualizados: resultado.affectedRows };
    });
  });
