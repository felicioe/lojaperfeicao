import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Exportação de dados (issue #28) — complementa o "Resetar Financeiro"
// (issue #11/#28), que cobre o reset. Cada módulo é uma consulta fixa
// (nunca nome de tabela vindo do client) para não abrir superfície de SQL
// arbitrário mesmo sendo admin-only. usuarios propositalmente não expõe
// senha_hash.
const PAPEIS = ["admin"];

type Modulo = {
  label: string;
  query: string;
};

const MODULOS: Record<string, Modulo> = {
  irmaos: {
    label: "Irmãos",
    query: `SELECT id, nome_civil, nome_simbolico, cim, grau, situacao, potencia, loja_origem,
                    email, telefone, celular, data_nascimento, data_iniciacao, data_elevacao,
                    data_exaltacao, valor_mensalidade, criado_em
             FROM irmaos ORDER BY nome_civil`,
  },
  orgs: {
    label: "Corpos Maçônicos",
    query:
      "SELECT id, nome, sigla, natureza, numero, grau_min, grau_max, ativo, criado_em FROM orgs ORDER BY nome",
  },
  gestoes: {
    label: "Gestões",
    query:
      "SELECT id, org_id, nome, data_inicio, data_fim, ativo FROM gestoes ORDER BY data_inicio DESC",
  },
  sessoes: {
    label: "Sessões",
    query: "SELECT id, data, tipo, grau, observacoes FROM sessoes ORDER BY data DESC",
  },
  presencas: {
    label: "Presenças",
    query: "SELECT sessao_id, irmao_id, presente, justificado FROM presencas ORDER BY sessao_id",
  },
  terceiros: {
    label: "Fornecedores/Clientes",
    query: "SELECT id, nome, cnpj, cpf, tipo, email, contato FROM terceiros ORDER BY nome",
  },
  usuarios: {
    label: "Usuários",
    query: "SELECT id, email, nome_completo, ativo, criado_em FROM usuarios ORDER BY email",
  },
  plano_contas: {
    label: "Plano de Contas",
    query: "SELECT id, codigo, nome, tipo, analitica FROM plano_contas ORDER BY codigo",
  },
  contas_financeiras: {
    label: "Contas Financeiras",
    query: "SELECT id, nome, tipo, saldo_inicial, ativo FROM contas_financeiras ORDER BY nome",
  },
  lancamentos: {
    label: "Movimento Financeiro",
    query: `SELECT id, data, data_vencimento, data_pagamento, descricao, valor, tipo, pago,
                    is_mensalidade, categoria_recebimento, irmao_id, terceiro_id
             FROM lancamentos ORDER BY data DESC`,
  },
  recibos: {
    label: "Recibos",
    query: `SELECT id, irmao_id, data, valor_original, valor_multa, valor_juros, desconto,
                    valor_total, forma_pagamento
             FROM recibos ORDER BY data DESC`,
  },
};

export type ModuloExportavel = { chave: string; label: string };

export const listarModulosExportaveis = createServerFn({ method: "GET" }).handler(
  async (): Promise<ModuloExportavel[]> => {
    return comPapel(PAPEIS, async () => {
      return Object.entries(MODULOS).map(([chave, m]) => ({ chave, label: m.label }));
    });
  },
);

function paraCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const colunas = Object.keys(rows[0]);
  const escapar = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = rows.map((r) => colunas.map((c) => escapar(r[c])).join(";"));
  return [colunas.join(";"), ...linhas].join("\n");
}

const exportarSchema = z.object({
  modulo: z.string(),
  formato: z.enum(["csv", "json"]),
});

export type ExportacaoResultado = { nomeArquivo: string; conteudo: string };

export const exportarModulo = createServerFn({ method: "POST" })
  .validator((d: unknown) => exportarSchema.parse(d))
  .handler(async ({ data }): Promise<ExportacaoResultado> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      const modulo = MODULOS[data.modulo];
      if (!modulo) throw new Error("Módulo inválido.");

      const [rows] = await conn.query<RowDataPacket[]>(modulo.query);
      const data_ = new Date().toISOString().slice(0, 10);
      const conteudo =
        data.formato === "csv"
          ? paraCsv(rows as Record<string, unknown>[])
          : JSON.stringify(rows, null, 2);

      await registrarAuditoria(conn, usuarioIdAtual, "exportar_dados", "exportacao", null, null, {
        modulo: data.modulo,
        formato: data.formato,
        linhas: rows.length,
      });

      return {
        nomeArquivo: `${data.modulo}-${data_}.${data.formato}`,
        conteudo,
      };
    });
  });

export const exportarTudo = createServerFn({ method: "POST" }).handler(
  async (): Promise<ExportacaoResultado> => {
    return comPapel(PAPEIS, async (conn, usuarioIdAtual) => {
      const resultado: Record<string, RowDataPacket[]> = {};
      for (const [chave, modulo] of Object.entries(MODULOS)) {
        const [rows] = await conn.query<RowDataPacket[]>(modulo.query);
        resultado[chave] = rows;
      }
      const data_ = new Date().toISOString().slice(0, 10);

      await registrarAuditoria(conn, usuarioIdAtual, "exportar_dados", "exportacao", null, null, {
        modulo: "tudo",
        formato: "json",
        modulos: Object.keys(resultado),
      });

      return {
        nomeArquivo: `backup-completo-${data_}.json`,
        conteudo: JSON.stringify(resultado, null, 2),
      };
    });
  },
);
