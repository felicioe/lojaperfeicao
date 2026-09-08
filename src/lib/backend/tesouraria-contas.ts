import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { chavePixValida } from "@/lib/pix";

// RLS original: SELECT livre; escrita admin OU tesoureiro.
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

export type ContaFinanceira = {
  id: string;
  nome: string;
  tipo: "caixa" | "banco" | "outro";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  saldo_inicial: number;
  plano_conta_id: string | null;
  ativo: boolean;
};

export type SaldoConta = ContaFinanceira & { saldo_atual: number };

export const listarContasFinanceiras = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContaFinanceira[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras WHERE loja_id = @current_loja_id AND ativo = TRUE ORDER BY nome",
      );
      return rows as ContaFinanceira[];
    });
  },
);

export const listarSaldoContas = createServerFn({ method: "GET" }).handler(
  async (): Promise<SaldoConta[]> => {
    return comSessao(async (conn) => {
      // A view expõe loja_id desde a 0096 (#349) — o JOIN com a tabela base,
      // que existia só pra descobrir de quem era cada conta, saiu.
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM v_saldo_contas WHERE loja_id = @current_loja_id ORDER BY nome",
      );
      return rows as SaldoConta[];
    });
  },
);

const novaContaSchema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["caixa", "banco", "outro"]),
  saldo_inicial: z.number(),
  banco: z.string().nullable(),
  planoContaId: z.string().uuid().nullable(),
});

// Confere que o id apontado é uma conta analítica (sem filhas) do plano de
// contas desta Loja, do tipo "ativo". As duas condições são exigidas mais
// adiante, em pontos diferentes: criar_transferencia (migração 0096) exige
// tipo = 'ativo' pra aceitar a conta como origem/destino de uma
// transferência, e registrar_lancamento_contabil (mesma migração) rejeita
// qualquer lançamento em conta sintética ("não analítica"). Sem checar as
// duas aqui, dava pra vincular uma conta sintética (ex.: "1.2.1 —
// Investimentos", um grupo) e só descobrir o problema depois, com um erro
// confuso na hora da transferência em vez de na hora do vínculo.
async function validarPlanoContaAtivo(conn: PoolConnection, planoContaId: string | null) {
  if (!planoContaId) return;
  const [[plano]] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM plano_contas WHERE id = ? AND loja_id = @current_loja_id AND tipo = 'ativo' AND analitica = TRUE",
    [planoContaId],
  );
  if (!plano) {
    throw new Error(
      "Conta do plano de contas inválida — selecione uma conta analítica do tipo Ativo.",
    );
  }
}

export const criarContaFinanceira = createServerFn({ method: "POST" })
  .validator((d: unknown) => novaContaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await validarPlanoContaAtivo(conn, data.planoContaId);
      await conn.query(
        "INSERT INTO contas_financeiras (loja_id, nome, tipo, saldo_inicial, banco, plano_conta_id) VALUES (@current_loja_id, ?, ?, ?, ?, ?)",
        [data.nome, data.tipo, data.saldo_inicial, data.banco, data.planoContaId],
      );
    });
  });

const editarContaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(1),
  tipo: z.enum(["caixa", "banco", "outro"]),
  banco: z.string().nullable(),
  planoContaId: z.string().uuid().nullable(),
});

// Só nome/tipo/banco/plano_conta_id são editáveis — saldo_inicial fica de
// fora de propósito: mudar o saldo inicial depois que a conta já tem
// lançamentos desalinharia o saldo atual (soma do inicial + movimentação)
// do saldo real, sem deixar rastro no extrato.
export const editarContaFinanceira = createServerFn({ method: "POST" })
  .validator((d: unknown) => editarContaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[antes]] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (!antes) throw new Error("Conta não encontrada nesta Loja.");
      await validarPlanoContaAtivo(conn, data.planoContaId);
      await conn.query(
        "UPDATE contas_financeiras SET nome = ?, tipo = ?, banco = ?, plano_conta_id = ? WHERE id = ? AND loja_id = @current_loja_id",
        [data.nome, data.tipo, data.banco, data.planoContaId, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar",
        "conta_financeira",
        data.id,
        antes,
        data,
      );
    });
  });

// ---------- Chaves PIX (por conta) ----------
// Usadas pra gerar o "Pix Copia e Cola" (BR Code) impresso na fatura —
// ver src/lib/pix.ts. Uma conta pode ter várias chaves de tipos
// diferentes; "principal" é só a pré-seleção sugerida nos formulários, a
// aplicação garante no máximo uma principal por conta.
export type ChavePix = {
  id: string;
  conta_financeira_id: string;
  tipo: "email" | "telefone" | "cpf" | "cnpj" | "aleatoria";
  chave: string;
  pix_copia_cola: string | null;
  qr_code_url: string | null;
  nome_beneficiario: string;
  cidade: string;
  principal: boolean;
};

export const listarChavesPix = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ contaId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ChavePix[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras_pix WHERE loja_id = @current_loja_id AND conta_financeira_id = ? ORDER BY principal DESC, criado_em",
        [data.contaId],
      );
      return rows as ChavePix[];
    });
  });

export type ChavePixComConta = ChavePix & { conta_nome: string };

// Lista achatada (todas as contas) pra popular um único seletor de chave
// na fatura, sem precisar de um segundo select em cascata "conta -> chave".
export const listarTodasChavesPix = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChavePixComConta[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT pix.*, cf.nome AS conta_nome
         FROM contas_financeiras_pix pix
         JOIN contas_financeiras cf ON cf.id = pix.conta_financeira_id
         WHERE pix.loja_id = @current_loja_id AND cf.loja_id = @current_loja_id
           AND cf.ativo = TRUE
         ORDER BY cf.nome, pix.principal DESC`,
      );
      return rows as ChavePixComConta[];
    });
  },
);

const chavePixSchema = z.object({
  contaFinanceiraId: z.string().uuid(),
  tipo: z.enum(["email", "telefone", "cpf", "cnpj", "aleatoria"]),
  chave: z.string().max(140),
  pixCopiaCola: z.string().max(1000).nullable(),
  // Data URL da imagem (não mais um caminho em disco — ver uploadQrCodePix),
  // por isso o limite alto: cobre uma imagem de até 5 MB em base64.
  qrCodeUrl: z.string().max(7_000_000).nullable(),
  nomeBeneficiario: z.string().min(1).max(25),
  cidade: z.string().min(1).max(15),
  principal: z.boolean(),
});

export const criarChavePix = createServerFn({ method: "POST" })
  .validator((d: unknown) => chavePixSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      if (!data.chave && !data.pixCopiaCola && !data.qrCodeUrl) {
        throw new Error("Informe uma chave, um código copia e cola ou uma imagem do QR Code.");
      }
      if (data.chave && !chavePixValida(data.tipo, data.chave)) {
        throw new Error("Chave não bate com o formato esperado para o tipo selecionado.");
      }
      if (data.principal) {
        await conn.query(
          "UPDATE contas_financeiras_pix SET principal = FALSE WHERE loja_id = @current_loja_id AND conta_financeira_id = ?",
          [data.contaFinanceiraId],
        );
      }
      const [[estrutura]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contas_financeiras_pix'
           AND COLUMN_NAME IN ('pix_copia_cola', 'qr_code_url')`,
      );
      const pixAvancadoDisponivel = Number(estrutura.total) === 2;
      if (!pixAvancadoDisponivel && (data.pixCopiaCola || data.qrCodeUrl)) {
        throw new Error("Atualize o banco de dados antes de salvar copia e cola ou QR Code.");
      }
      if (pixAvancadoDisponivel) {
        await conn.query(
          `INSERT INTO contas_financeiras_pix
             (loja_id, conta_financeira_id, tipo, chave, pix_copia_cola, qr_code_url, nome_beneficiario, cidade, principal)
           VALUES (@current_loja_id, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.contaFinanceiraId,
            data.tipo,
            data.chave,
            data.pixCopiaCola,
            data.qrCodeUrl,
            data.nomeBeneficiario,
            data.cidade,
            data.principal,
          ],
        );
      } else {
        await conn.query(
          `INSERT INTO contas_financeiras_pix
             (loja_id, conta_financeira_id, tipo, chave, nome_beneficiario, cidade, principal)
           VALUES (@current_loja_id, ?, ?, ?, ?, ?, ?)`,
          [
            data.contaFinanceiraId,
            data.tipo,
            data.chave,
            data.nomeBeneficiario,
            data.cidade,
            data.principal,
          ],
        );
      }
      // id é UUID gerado por DEFAULT (UUID()) no MySQL, não auto_increment —
      // insertId não reflete o id real, então não dá pra usar como
      // entidade_id aqui (mesmo padrão de tabela_valores.criarValorVigente).
      await registrarAuditoria(conn, usuarioIdAtual, "criar", "chave_pix", null, null, data);
    });
  });

const uploadQrCodeSchema = z.object({
  nomeArquivo: z.string().min(1).max(255),
  dataUrl: z.string().startsWith("data:image/"),
});

// Guarda a imagem como data URL na própria coluna (qr_code_url é MEDIUMTEXT,
// migração 0108) em vez de gravar em disco: uploads em public/uploads/ não
// são versionados no git e não sobrevivem a um novo deploy da Hostinger
// (git clone + build do zero), o que deixava o QR Code quebrado assim que a
// aplicação era reimplantada depois do upload.
export const uploadQrCodePix = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadQrCodeSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    return comPapel(PAPEIS_ESCRITA, async () => {
      const match = data.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      if (!match) throw new Error("Envie uma imagem PNG, JPG ou WebP.");
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Imagem maior que 5 MB.");
      return { url: data.dataUrl };
    });
  });

export const removerChavePix = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      // O id vem da requisição: sem o filtro de loja, trocar o id no payload
      // apagaria a chave PIX de outra loja (IDOR).
      const [[chave]] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras_pix WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      await conn.query(
        "DELETE FROM contas_financeiras_pix WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "excluir",
        "chave_pix",
        data.id,
        chave ?? null,
        null,
      );
    });
  });
