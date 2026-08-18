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
//
// TODA consulta aqui filtra por @current_loja_id (issue #345). Este é o pior
// lugar do sistema para faltar escopo: não vaza uma linha, vaza a base inteira
// da outra Loja num arquivo pronto pra sair do sistema — e "admin" aqui é
// admin DA Loja, não da plataforma.
const PAPEIS = ["admin"];

type Modulo = {
  label: string;
  query: string;
  // Colunas com HTML do RichTextEditor (issue #228) — só relevante pro
  // export CSV (legível por humano); o JSON de exportarTudo mantém o HTML
  // cru de propósito, já que é o formato usado como backup pra restore.
  colunasRicas?: string[];
};

const MODULOS: Record<string, Modulo> = {
  irmaos: {
    label: "Irmãos",
    query: `SELECT id, nome_civil, nome_simbolico, cim, grau, situacao, potencia, loja_origem,
                    email, telefone, celular, data_nascimento, data_iniciacao, data_elevacao,
                    data_exaltacao, valor_mensalidade, criado_em
             FROM irmaos WHERE loja_id = @current_loja_id ORDER BY nome_civil`,
  },
  orgs: {
    label: "Corpos Maçônicos",
    query: `SELECT id, nome, sigla, natureza, numero, grau_min, grau_max, ativo, criado_em
             FROM orgs WHERE loja_id = @current_loja_id ORDER BY nome`,
  },
  gestoes: {
    label: "Gestões",
    query: `SELECT id, org_id, nome, data_inicio, data_fim, ativo
             FROM gestoes WHERE loja_id = @current_loja_id ORDER BY data_inicio DESC`,
  },
  sessoes: {
    label: "Sessões",
    query: `SELECT id, data, tipo, grau, local, observacoes
             FROM sessoes WHERE loja_id = @current_loja_id ORDER BY data DESC`,
    colunasRicas: ["observacoes"],
  },
  presencas: {
    label: "Presenças",
    query: `SELECT sessao_id, irmao_id, presente, justificado
             FROM presencas WHERE loja_id = @current_loja_id ORDER BY sessao_id`,
  },
  terceiros: {
    label: "Fornecedores/Clientes",
    query: `SELECT id, nome, cnpj, cpf, tipo, email, contato
             FROM terceiros WHERE loja_id = @current_loja_id ORDER BY nome`,
  },
  usuarios: {
    label: "Usuários",
    query: `SELECT id, email, nome_completo, ativo, criado_em
             FROM usuarios WHERE loja_id = @current_loja_id ORDER BY email`,
  },
  plano_contas: {
    label: "Plano de Contas",
    query: `SELECT id, codigo, nome, tipo, analitica
             FROM plano_contas WHERE loja_id = @current_loja_id ORDER BY codigo`,
  },
  contas_financeiras: {
    label: "Contas Financeiras",
    query: `SELECT id, nome, tipo, saldo_inicial, ativo
             FROM contas_financeiras WHERE loja_id = @current_loja_id ORDER BY nome`,
  },
  lancamentos: {
    label: "Movimento Financeiro",
    query: `SELECT id, data, data_vencimento, data_pagamento, descricao, valor, tipo, pago,
                    is_mensalidade, categoria_recebimento, irmao_id, terceiro_id
             FROM lancamentos WHERE loja_id = @current_loja_id ORDER BY data DESC`,
  },
  recibos: {
    label: "Recibos",
    query: `SELECT id, irmao_id, data, valor_original, valor_multa, valor_juros, desconto,
                    valor_total, forma_pagamento
             FROM recibos WHERE loja_id = @current_loja_id ORDER BY data DESC`,
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

// Só pro export CSV (legível por humano) — troca o HTML salvo pelo
// RichTextEditor por texto simples, já que uma célula de planilha com
// "<p>Reunião <strong>extraordinária</strong></p>" não serve pra ninguém.
function textoSimples(html: string): string {
  // &amp; decodifica por último — se viesse antes, um "&amp;lt;" (a
  // sequência literal "&lt;" digitada como texto pelo usuário) virava
  // "&lt;" e o passo seguinte decodificava de novo pra "<", um caractere
  // que ninguém digitou.
  return html
    .replace(/<\/(p|li|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .trim();
}

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
          ? paraCsv(
              (rows as Record<string, unknown>[]).map((r) => {
                if (!modulo.colunasRicas) return r;
                const linha = { ...r };
                for (const coluna of modulo.colunasRicas) {
                  if (typeof linha[coluna] === "string")
                    linha[coluna] = textoSimples(linha[coluna]);
                }
                return linha;
              }),
            )
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
