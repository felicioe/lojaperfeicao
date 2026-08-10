import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Taxas por grau (SGCAB) — issue #21. Deliberadamente separado do fluxo
// contábil (lancamentos/faturas): estas taxas normalmente são repassadas a
// um órgão federativo externo, não são receita da loja (ver migração
// 0014_taxas_grau_sgcab.sql).
const PAPEIS_GESTAO = ["admin", "secretario"];
const PAPEIS_LEITURA = ["admin", "secretario", "tesoureiro"];

export type TaxaGrau = {
  id: string;
  org_id: string;
  ano: number;
  grau: number;
  nome_grau: string | null;
  sgcab: number;
  ritual: number;
  diploma: number;
  taxa_propria: number;
  ativo: boolean;
};

export const listarTaxasGrau = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orgId: z.string().uuid(), ano: z.number().int() }).parse(d))
  .handler(async ({ data }): Promise<TaxaGrau[]> => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT tg.id, tg.org_id, tg.ano, tg.grau, og.nome AS nome_grau,
                tg.sgcab, tg.ritual, tg.diploma, tg.taxa_propria, tg.ativo
         FROM taxas_grau tg
         LEFT JOIN orgs_graus og ON og.org_id = tg.org_id AND og.grau = tg.grau
         WHERE tg.org_id = ? AND tg.ano = ?
         ORDER BY tg.grau`,
        [data.orgId, data.ano],
      );
      return rows as TaxaGrau[];
    });
  });

const salvarTaxaGrauSchema = z.object({
  id: z.string().uuid().nullable(),
  orgId: z.string().uuid(),
  ano: z.number().int(),
  grau: z.number().int().min(1).max(33),
  sgcab: z.number().min(0),
  ritual: z.number().min(0),
  diploma: z.number().min(0),
  taxaPropria: z.number().min(0),
  ativo: z.boolean(),
});

export const salvarTaxaGrau = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarTaxaGrauSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_GESTAO, async (conn, usuarioIdAtual) => {
      if (data.id) {
        await conn.query(
          `UPDATE taxas_grau SET sgcab = ?, ritual = ?, diploma = ?, taxa_propria = ?, ativo = ?
           WHERE id = ?`,
          [data.sgcab, data.ritual, data.diploma, data.taxaPropria, data.ativo, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "taxa_grau", data.id, null, {
          ...data,
        });
      } else {
        await conn.query(
          `INSERT INTO taxas_grau (org_id, ano, grau, sgcab, ritual, diploma, taxa_propria, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE sgcab = VALUES(sgcab), ritual = VALUES(ritual),
             diploma = VALUES(diploma), taxa_propria = VALUES(taxa_propria), ativo = VALUES(ativo)`,
          [
            data.orgId,
            data.ano,
            data.grau,
            data.sgcab,
            data.ritual,
            data.diploma,
            data.taxaPropria,
            data.ativo,
          ],
        );
        const [[novo]] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM taxas_grau WHERE org_id = ? AND ano = ? AND grau = ?",
          [data.orgId, data.ano, data.grau],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "taxa_grau", novo.id, null, {
          ...data,
        });
      }
    });
  });

export const excluirTaxaGrau = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_GESTAO, async (conn, usuarioIdAtual) => {
      await conn.query("DELETE FROM taxas_grau WHERE id = ?", [data.id]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "taxa_grau", data.id, null, null);
    });
  });

const gerarCobrancasSchema = z.object({ orgId: z.string().uuid(), ano: z.number().int() });

export const gerarCobrancasSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => gerarCobrancasSchema.parse(d))
  .handler(async ({ data }): Promise<{ totalGerado: number }> => {
    return comPapel(PAPEIS_GESTAO, async (conn, usuarioIdAtual) => {
      await conn.query("CALL gerar_cobrancas_sgcab(?, ?, @total)", [data.orgId, data.ano]);
      const [[row]] = await conn.query<RowDataPacket[]>("SELECT @total AS total");
      const totalGerado = Number(row.total ?? 0);
      await registrarAuditoria(conn, usuarioIdAtual, "gerar_cobrancas", "sgcab", null, null, {
        org_id: data.orgId,
        ano: data.ano,
        total_gerado: totalGerado,
      });
      return { totalGerado };
    });
  });

export type SgcabCobranca = {
  id: string;
  irmao_id: string;
  irmao_nome: string;
  org_id: string;
  org_nome: string;
  ano: number;
  grau: number;
  nome_grau: string | null;
  tipo: "sgcab" | "ritual" | "diploma" | "taxa_propria";
  valor: number;
  vencimento: string | null;
  status: "pendente" | "pago" | "cancelado";
  comprovante_url: string | null;
  data_pagamento: string | null;
  observacoes: string | null;
};

const listarCobrancasSchema = z.object({
  orgId: z.string().uuid().nullable(),
  ano: z.number().int().nullable(),
  status: z.enum(["pendente", "pago", "cancelado"]).nullable(),
});

export const listarCobrancasSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => listarCobrancasSchema.parse(d))
  .handler(async ({ data }): Promise<SgcabCobranca[]> => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      const condicoes: string[] = [];
      const valores: unknown[] = [];
      if (data.orgId) {
        condicoes.push("sc.org_id = ?");
        valores.push(data.orgId);
      }
      if (data.ano) {
        condicoes.push("sc.ano = ?");
        valores.push(data.ano);
      }
      if (data.status) {
        condicoes.push("sc.status = ?");
        valores.push(data.status);
      }
      const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT sc.id, sc.irmao_id, i.nome_civil AS irmao_nome, sc.org_id, o.nome AS org_nome,
                sc.ano, sc.grau, og.nome AS nome_grau, sc.tipo, sc.valor, sc.vencimento, sc.status,
                sc.comprovante_url, sc.data_pagamento, sc.observacoes
         FROM sgcab_cobrancas sc
         JOIN irmaos i ON i.id = sc.irmao_id
         JOIN orgs o ON o.id = sc.org_id
         LEFT JOIN orgs_graus og ON og.org_id = sc.org_id AND og.grau = sc.grau
         ${where}
         ORDER BY i.nome_civil, sc.grau, sc.tipo`,
        valores,
      );
      return rows as SgcabCobranca[];
    });
  });

const registrarPagamentoSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pendente", "pago", "cancelado"]),
  dataPagamento: z.string().nullable(),
  comprovanteUrl: z.string().nullable(),
  observacoes: z.string().nullable(),
});

export const registrarPagamentoSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => registrarPagamentoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_LEITURA, async (conn, usuarioIdAtual) => {
      await conn.query(
        `UPDATE sgcab_cobrancas
         SET status = ?, data_pagamento = ?, comprovante_url = COALESCE(?, comprovante_url), observacoes = ?
         WHERE id = ?`,
        [data.status, data.dataPagamento, data.comprovanteUrl, data.observacoes, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar_status",
        "sgcab_cobranca",
        data.id,
        null,
        {
          status: data.status,
          data_pagamento: data.dataPagamento,
        },
      );
    });
  });

// Upload de comprovante: mesmo padrão de uploadFotoIrmao (irmaos.ts) — sem
// Supabase Storage, grava em disco sob public/uploads e devolve a URL
// pública relativa.
const uploadComprovanteSchema = z.object({
  cobrancaId: z.string().uuid(),
  nomeArquivo: z.string().min(1),
  dataUrl: z.string().startsWith("data:"),
});

// O atributo accept="image/*,application/pdf" do <input> no cliente
// (sgcab/cobrancas.tsx) é só cosmético — a validação real de tipo/tamanho
// tem que acontecer aqui, senão qualquer arquivo de qualquer tamanho pode
// ser gravado no servidor por quem chamar a função direto (achado #154 da
// revisão de segurança).
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

export const uploadComprovanteSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadComprovanteSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    return comPapel(PAPEIS_LEITURA, async () => {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Arquivo inválido.");
      const mime = match[1];
      if (!(mime.startsWith("image/") || mime === "application/pdf")) {
        throw new Error("Tipo de arquivo não permitido. Envie uma imagem ou PDF.");
      }
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.byteLength > TAMANHO_MAXIMO_BYTES) {
        throw new Error("Arquivo maior que o limite de 10 MB.");
      }
      const nomeSeguro = data.nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
      const dir = join(process.cwd(), "public", "uploads", "sgcab", data.cobrancaId);
      await mkdir(dir, { recursive: true });
      const nomeArquivoFinal = `${Date.now()}-${nomeSeguro}`;
      await writeFile(join(dir, nomeArquivoFinal), buffer);
      return { url: `/uploads/sgcab/${data.cobrancaId}/${nomeArquivoFinal}` };
    });
  });
