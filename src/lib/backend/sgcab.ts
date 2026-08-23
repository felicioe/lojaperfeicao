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
const PAPEIS_GESTAO = ["admin", "secretario", "tesoureiro"];
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
                                AND og.loja_id = @current_loja_id
         WHERE tg.org_id = ? AND tg.ano = ? AND tg.loja_id = @current_loja_id
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
    return comPapel(PAPEIS_GESTAO, async (conn, usuarioIdAtual, lojaId) => {
      // O corpo vem do request; confirmar que é desta Loja antes de mexer nas
      // taxas dele.
      const [[org]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
        [data.orgId],
      );
      if (!org) throw new Error("Corpo maçônico não encontrado nesta Loja.");
      if (data.id) {
        await conn.query(
          `UPDATE taxas_grau SET sgcab = ?, ritual = ?, diploma = ?, taxa_propria = ?, ativo = ?
           WHERE id = ? AND loja_id = @current_loja_id`,
          [data.sgcab, data.ritual, data.diploma, data.taxaPropria, data.ativo, data.id],
        );
        await registrarAuditoria(conn, usuarioIdAtual, "atualizar", "taxa_grau", data.id, null, {
          ...data,
        });
      } else {
        await conn.query(
          `INSERT INTO taxas_grau (loja_id, org_id, ano, grau, sgcab, ritual, diploma, taxa_propria, ativo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE sgcab = VALUES(sgcab), ritual = VALUES(ritual),
             diploma = VALUES(diploma), taxa_propria = VALUES(taxa_propria), ativo = VALUES(ativo)`,
          [
            lojaId,
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
          "SELECT id FROM taxas_grau WHERE org_id = ? AND ano = ? AND grau = ? AND loja_id = @current_loja_id",
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
      await conn.query("DELETE FROM taxas_grau WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
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
  irmaoId: z.string().uuid().nullable(),
});

export const listarCobrancasSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => listarCobrancasSchema.parse(d))
  .handler(async ({ data }): Promise<SgcabCobranca[]> => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      // Escopo de loja sempre presente, independente dos filtros da tela —
      // mesmo padrão da Tesouraria (#343).
      const condicoes: string[] = ["sc.loja_id = @current_loja_id"];
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
      if (data.irmaoId) {
        condicoes.push("sc.irmao_id = ?");
        valores.push(data.irmaoId);
      }
      const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT sc.id, sc.irmao_id, i.nome_civil AS irmao_nome, sc.org_id, o.nome AS org_nome,
                sc.ano, sc.grau, og.nome AS nome_grau, sc.tipo, sc.valor, sc.vencimento, sc.status,
                sc.comprovante_url, sc.data_pagamento, sc.observacoes
         FROM sgcab_cobrancas sc
         JOIN irmaos i ON i.id = sc.irmao_id AND i.loja_id = @current_loja_id
         JOIN orgs o ON o.id = sc.org_id AND o.loja_id = @current_loja_id
         LEFT JOIN orgs_graus og ON og.org_id = sc.org_id AND og.grau = sc.grau
                                AND og.loja_id = @current_loja_id
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
         WHERE id = ? AND loja_id = @current_loja_id`,
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

export type SgcabFaturaItem = {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  ordem: number;
};

export type SgcabFatura = {
  id: string;
  irmao_id: string;
  irmao_nome: string;
  org_id: string;
  org_nome: string;
  ano: number;
  grau: number;
  nome_grau: string | null;
  titulo: string;
  data_sessao: string | null;
  vencimento: string | null;
  total: number;
  status: "pendente" | "pago" | "cancelado";
  data_pagamento: string | null;
  comprovante_url: string | null;
  observacoes: string | null;
  itens: SgcabFaturaItem[];
};

const filtroFaturasSchema = z.object({
  orgId: z.string().uuid().nullable(),
  ano: z.number().int().nullable(),
  status: z.enum(["pendente", "pago", "cancelado"]).nullable(),
  irmaoId: z.string().uuid().nullable(),
});

export const listarFaturasSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => filtroFaturasSchema.parse(d))
  .handler(async ({ data }): Promise<SgcabFatura[]> => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      const condicoes: string[] = [];
      const valores: unknown[] = [];
      if (data.orgId) {
        condicoes.push("sf.org_id = ?");
        valores.push(data.orgId);
      }
      if (data.ano) {
        condicoes.push("sf.ano = ?");
        valores.push(data.ano);
      }
      if (data.status) {
        condicoes.push("sf.status = ?");
        valores.push(data.status);
      }
      if (data.irmaoId) {
        condicoes.push("sf.irmao_id = ?");
        valores.push(data.irmaoId);
      }
      const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
      const [faturas] = await conn.query<RowDataPacket[]>(
        `SELECT sf.*, i.nome_civil AS irmao_nome, o.nome AS org_nome, og.nome AS nome_grau
         FROM sgcab_faturas sf
         JOIN irmaos i ON i.id = sf.irmao_id AND i.loja_id = @current_loja_id
         JOIN orgs o ON o.id = sf.org_id AND o.loja_id = @current_loja_id
         LEFT JOIN orgs_graus og ON og.org_id = sf.org_id AND og.grau = sf.grau
                                AND og.loja_id = @current_loja_id
         ${where}
         ORDER BY sf.vencimento IS NULL, sf.vencimento, sf.criado_em DESC`,
        valores,
      );
      if (faturas.length === 0) return [];
      const ids = faturas.map((f) => f.id);
      const [itens] = await conn.query<RowDataPacket[]>(
        `SELECT id, fatura_id, tipo, descricao, valor, ordem
         FROM sgcab_fatura_itens
          WHERE fatura_id IN (?) AND loja_id = @current_loja_id
          ORDER BY ordem, criado_em`,
        [ids],
      );
      return faturas.map((f) => ({
        ...f,
        itens: itens.filter((item) => item.fatura_id === f.id),
      })) as SgcabFatura[];
    });
  });

export const obterValoresFaturaSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), ano: z.number().int(), grau: z.number().int() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      const [[taxa]] = await conn.query<RowDataPacket[]>(
        `SELECT sgcab, ritual, diploma FROM taxas_grau
         WHERE org_id = ? AND ano = ? AND grau = ? AND ativo = TRUE
           AND loja_id = @current_loja_id LIMIT 1`,
        [data.orgId, data.ano, data.grau],
      );
      const [[boton]] = await conn.query<RowDataPacket[]>(
        `SELECT valor FROM sgcab_valores_catalogo
         WHERE tipo = ? AND ano = ? AND vigencia_inicio <= ?
           AND loja_id = @current_loja_id
         ORDER BY vigencia_inicio DESC LIMIT 1`,
        [data.grau === 13 ? "sgcab_boton_grau_13" : "sgcab_boton", data.ano, `${data.ano}-12-31`],
      );
      return {
        iniciacao: Number(taxa?.sgcab ?? 0),
        diploma: Number(taxa?.diploma ?? 0),
        ritual: Number(taxa?.ritual ?? 0),
        boton: Number(boton?.valor ?? 0),
      };
    });
  });

const criarFaturaSchema = z.object({
  irmaoId: z.string().uuid(),
  orgId: z.string().uuid(),
  ano: z.number().int(),
  grau: z.number().int().min(1).max(33),
  titulo: z.string().min(3).max(255),
  dataSessao: z.string().nullable(),
  vencimento: z.string().nullable(),
  observacoes: z.string().max(5000).nullable(),
  itens: z
    .array(
      z.object({
        tipo: z.string().min(1).max(50),
        descricao: z.string().min(1).max(255),
        valor: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export const criarFaturaSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarFaturaSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_GESTAO, async (conn, usuarioIdAtual, lojaId) => {
      // Irmão e corpo vêm do request: os dois precisam ser desta Loja, senão
      // a fatura nasceria cobrando o irmão de outra.
      const [[valido]] = await conn.query<RowDataPacket[]>(
        `SELECT 1 AS ok FROM irmaos i
           JOIN orgs o ON o.id = ? AND o.loja_id = @current_loja_id
          WHERE i.id = ? AND i.loja_id = @current_loja_id`,
        [data.orgId, data.irmaoId],
      );
      if (!valido) throw new Error("Irmão ou corpo maçônico não encontrado nesta Loja.");
      const total = data.itens.reduce((soma, item) => soma + item.valor, 0);
      await conn.beginTransaction();
      try {
        const [[novoId]] = await conn.query<RowDataPacket[]>("SELECT UUID() AS id");
        await conn.query(
          `INSERT INTO sgcab_faturas
             (id, loja_id, irmao_id, org_id, ano, grau, titulo, data_sessao, vencimento, total, observacoes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            novoId.id,
            lojaId,
            data.irmaoId,
            data.orgId,
            data.ano,
            data.grau,
            data.titulo,
            data.dataSessao,
            data.vencimento,
            total,
            data.observacoes,
          ],
        );
        for (const [ordem, item] of data.itens.entries()) {
          await conn.query(
            `INSERT INTO sgcab_fatura_itens (loja_id, fatura_id, tipo, descricao, valor, ordem)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [lojaId, novoId.id, item.tipo, item.descricao, item.valor, ordem],
          );
        }
        await registrarAuditoria(conn, usuarioIdAtual, "criar", "sgcab_fatura", novoId.id, null, {
          ...data,
          total,
        });
        await conn.commit();
        return { id: novoId.id };
      } catch (erro) {
        await conn.rollback();
        throw erro;
      }
    });
  });

const atualizarFaturaSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pendente", "pago", "cancelado"]),
  dataPagamento: z.string().nullable(),
  comprovanteUrl: z.string().nullable(),
  observacoes: z.string().max(5000).nullable(),
});

export const atualizarFaturaSgcab = createServerFn({ method: "POST" })
  .validator((d: unknown) => atualizarFaturaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_GESTAO, async (conn, usuarioIdAtual) => {
      await conn.query(
        `UPDATE sgcab_faturas SET status = ?, data_pagamento = ?,
           comprovante_url = COALESCE(?, comprovante_url), observacoes = ?
         WHERE id = ? AND loja_id = @current_loja_id`,
        [data.status, data.dataPagamento, data.comprovanteUrl, data.observacoes, data.id],
      );
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar_status",
        "sgcab_fatura",
        data.id,
        null,
        data,
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
