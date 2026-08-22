import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import type { TipoConta } from "./plano-contas";

// RLS: leitura livre pra quem está autenticado nesta Loja; escrita só
// admin/tesoureiro — é configuração que decide onde toda baixa de fatura,
// conta a pagar e fechamento de exercício posta o lançamento contábil.
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

export type PapelContabil =
  | "contas_a_receber"
  | "fornecedores"
  | "mensalidades"
  | "multas_juros"
  | "descontos_concedidos"
  | "resultado_receita_padrao"
  | "resultado_despesa_padrao"
  | "resultado_acumulado";

// Cada papel espera uma conta de um tipo específico do plano de contas —
// usado tanto para filtrar o seletor quanto para recusar no servidor uma
// conta do tipo errado (ex.: apontar "fornecedores" pra uma conta de
// receita).
//
// `permiteInativa`: contas_a_receber/fornecedores são o único papel que
// aponta legitimamente pra uma conta desativada — o par renomeado/desativado
// pela 0071 quando o sistema passou a regime de caixa. Elas nunca recebem
// lançamento de verdade (servem só de sentinela pra registrar_lancamento_
// contabil substituir pela conta de resultado da própria fatura), então
// exigir "ativa" aqui recusaria justamente a semeadura automática que faz
// instalações existentes continuarem funcionando sem configurar nada.
export const PAPEL_INFO: Record<
  PapelContabil,
  { label: string; descricao: string; tipo: TipoConta; permiteInativa?: boolean }
> = {
  contas_a_receber: {
    label: "Contas a Receber",
    descricao:
      "Conta patrimonial legada do regime de competência. Em regime de caixa quase nunca é usada de verdade — a baixa credita direto a conta de receita da fatura —, mas ainda serve de referência interna em algumas rotinas. Pode apontar para uma conta desativada.",
    tipo: "ativo",
    permiteInativa: true,
  },
  fornecedores: {
    label: "Fornecedores",
    descricao:
      "Conta patrimonial legada do regime de competência, equivalente a Contas a Receber do lado das despesas. Pode apontar para uma conta desativada.",
    tipo: "passivo",
    permiteInativa: true,
  },
  mensalidades: {
    label: "Mensalidades",
    descricao: "Conta de receita usada ao emitir fatura avulsa ou gerar mensalidades em lote.",
    tipo: "receita",
  },
  multas_juros: {
    label: "Multas e Juros Recebidos",
    descricao:
      "Conta de receita creditada quando uma baixa de fatura inclui multa ou juros por atraso.",
    tipo: "receita",
  },
  descontos_concedidos: {
    label: "Descontos Concedidos",
    descricao: "Conta de despesa debitada quando uma baixa de fatura inclui desconto.",
    tipo: "despesa",
  },
  resultado_receita_padrao: {
    label: "Outras Receitas (padrão)",
    descricao:
      "Conta de receita usada como último recurso quando uma baixa não consegue achar a conta de receita da própria fatura.",
    tipo: "receita",
  },
  resultado_despesa_padrao: {
    label: "Outras Despesas (padrão)",
    descricao:
      "Conta de despesa usada como último recurso quando uma baixa não consegue achar a conta de despesa da própria fatura.",
    tipo: "despesa",
  },
  resultado_acumulado: {
    label: "Lucros/Prejuízos Acumulados",
    descricao: "Conta de patrimônio líquido que recebe o resultado apurado ao fechar um exercício.",
    tipo: "patrimonio_liquido",
  },
};

export const PAPEIS_CONTABEIS = Object.keys(PAPEL_INFO) as PapelContabil[];

export type ParametroContabil = {
  papel: PapelContabil;
  planoContaId: string;
  codigo: string;
  nome: string;
};

export const obterParametrosContabeis = createServerFn({ method: "GET" }).handler(
  async (): Promise<ParametroContabil[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT p.papel, p.plano_conta_id AS planoContaId, pc.codigo, pc.nome
           FROM parametros_contabeis p
           JOIN plano_contas pc ON pc.id = p.plano_conta_id AND pc.loja_id = p.loja_id
          WHERE p.loja_id = @current_loja_id`,
      );
      return rows as ParametroContabil[];
    });
  },
);

const salvarSchema = z.object({
  itens: z
    .array(
      z.object({
        papel: z.enum(PAPEIS_CONTABEIS as [PapelContabil, ...PapelContabil[]]),
        planoContaId: z.string().uuid(),
      }),
    )
    .length(PAPEIS_CONTABEIS.length),
});

// Todo papel é obrigatório: a tela recusa salvar incompleto (decisão da
// issue #354), então a validação de "todos os 8 papéis vieram, sem
// repetir" acontece aqui antes de qualquer escrita.
export const salvarParametrosContabeis = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const papeisEnviados = new Set(data.itens.map((item) => item.papel));
      if (papeisEnviados.size !== PAPEIS_CONTABEIS.length) {
        throw new Error(
          "Configure todos os papéis contábeis antes de salvar — nenhum pode ficar em branco.",
        );
      }

      // Sem o filtro de ativo/analítica aqui: contas_a_receber/fornecedores
      // podem legitimamente apontar pra uma conta desativada (ver comentário
      // em PAPEL_INFO). A checagem de "ativa" pros outros 6 papéis acontece
      // por item, abaixo — response, não a query, decide isso.
      const idsUnicos = [...new Set(data.itens.map((item) => item.planoContaId))];
      const [contasRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, tipo, analitica, ativo FROM plano_contas
          WHERE loja_id = @current_loja_id AND id IN (?)`,
        [idsUnicos],
      );
      const contaPorId = new Map(
        contasRows.map((row) => [
          row.id as string,
          { tipo: row.tipo as TipoConta, analitica: !!row.analitica, ativo: !!row.ativo },
        ]),
      );

      for (const item of data.itens) {
        const conta = contaPorId.get(item.planoContaId);
        const info = PAPEL_INFO[item.papel];
        if (!conta) {
          throw new Error(`A conta escolhida para "${info.label}" não foi encontrada nesta loja.`);
        }
        if (conta.tipo !== info.tipo) {
          throw new Error(
            `A conta escolhida para "${info.label}" precisa ser do tipo ${info.tipo}.`,
          );
        }
        if (!conta.analitica) {
          throw new Error(`A conta escolhida para "${info.label}" precisa ser analítica.`);
        }
        if (!info.permiteInativa && !conta.ativo) {
          throw new Error(`A conta escolhida para "${info.label}" precisa estar ativa.`);
        }
      }

      const [antesRows] = await conn.query<RowDataPacket[]>(
        "SELECT papel, plano_conta_id FROM parametros_contabeis WHERE loja_id = @current_loja_id",
      );
      const antes = Object.fromEntries(antesRows.map((row) => [row.papel, row.plano_conta_id]));

      const valoresSql = data.itens.map(() => "(@current_loja_id, ?, ?)").join(", ");
      const valoresParams = data.itens.flatMap((item) => [item.papel, item.planoContaId]);
      await conn.query(
        `INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
         VALUES ${valoresSql}
         ON DUPLICATE KEY UPDATE plano_conta_id = VALUES(plano_conta_id)`,
        valoresParams,
      );

      const depois = Object.fromEntries(data.itens.map((item) => [item.papel, item.planoContaId]));
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar",
        "parametros_contabeis",
        null,
        antes,
        depois,
      );
    });
  });
