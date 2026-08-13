import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";
import { chavePixValida } from "@/lib/pix";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
        "SELECT * FROM contas_financeiras WHERE ativo = TRUE ORDER BY nome",
      );
      return rows as ContaFinanceira[];
    });
  },
);

export const listarSaldoContas = createServerFn({ method: "GET" }).handler(
  async (): Promise<SaldoConta[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM v_saldo_contas ORDER BY nome",
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
});

export const criarContaFinanceira = createServerFn({ method: "POST" })
  .validator((d: unknown) => novaContaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query(
        "INSERT INTO contas_financeiras (nome, tipo, saldo_inicial, banco) VALUES (?, ?, ?, ?)",
        [data.nome, data.tipo, data.saldo_inicial, data.banco],
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
        "SELECT * FROM contas_financeiras_pix WHERE conta_financeira_id = ? ORDER BY principal DESC, criado_em",
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
         WHERE cf.ativo = TRUE
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
  qrCodeUrl: z.string().max(500).nullable(),
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
          "UPDATE contas_financeiras_pix SET principal = FALSE WHERE conta_financeira_id = ?",
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
             (conta_financeira_id, tipo, chave, pix_copia_cola, qr_code_url, nome_beneficiario, cidade, principal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
             (conta_financeira_id, tipo, chave, nome_beneficiario, cidade, principal)
           VALUES (?, ?, ?, ?, ?, ?)`,
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

export const uploadQrCodePix = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadQrCodeSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    return comPapel(PAPEIS_ESCRITA, async () => {
      const match = data.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      if (!match) throw new Error("Envie uma imagem PNG, JPG ou WebP.");
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Imagem maior que 5 MB.");
      const extensao = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
      const dir = join(process.cwd(), "public", "uploads", "qrcode-pix");
      await mkdir(dir, { recursive: true });
      const nome = `${Date.now()}-${crypto.randomUUID()}.${extensao}`;
      await writeFile(join(dir, nome), buffer);
      return { url: `/uploads/qrcode-pix/${nome}` };
    });
  });

export const removerChavePix = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[chave]] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM contas_financeiras_pix WHERE id = ?",
        [data.id],
      );
      await conn.query("DELETE FROM contas_financeiras_pix WHERE id = ?", [data.id]);
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
