import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel, SemPermissaoError } from "./authz";

// RLS original (mysql/migrations/0002_cadastros.sql): SELECT
// admin/tesoureiro/secretario; escrita admin/tesoureiro.
const PAPEIS_LEITURA = ["admin", "tesoureiro", "secretario"];
const PAPEIS_ESCRITA = ["admin", "tesoureiro"];

export type Terceiro = {
  id: string;
  tipo: "fornecedor" | "cliente" | "ambos";
  nome: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cpf: string | null;
  contato: string | null;
  email: string | null;
  categoria: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  observacoes: string | null;
  ativo: boolean;
};

export const listarTerceiros = createServerFn({ method: "GET" }).handler(
  async (): Promise<Terceiro[]> => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM terceiros WHERE loja_id = @current_loja_id ORDER BY nome",
      );
      return rows as Terceiro[];
    });
  },
);

/** Fornecedores ativos ("fornecedor" ou "ambos") — usado no seletor de contas a pagar/recorrentes. */
export const listarFornecedores = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; nome: string }[]> => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome FROM terceiros WHERE loja_id = @current_loja_id AND tipo IN ('fornecedor', 'ambos') AND ativo = TRUE ORDER BY nome",
      );
      return rows as { id: string; nome: string }[];
    });
  },
);

export const listarTerceirosAtivosPorTipo = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ tipo: z.enum(["fornecedor", "cliente"]) }).parse(d))
  .handler(async ({ data }): Promise<{ id: string; nome: string }[]> => {
    return comPapel(PAPEIS_LEITURA, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, nome FROM terceiros
         WHERE loja_id = @current_loja_id AND tipo IN (?, 'ambos') AND ativo = TRUE
         ORDER BY nome`,
        [data.tipo],
      );
      return rows as { id: string; nome: string }[];
    });
  });

const terceiroSchema = z.object({
  id: z.string().uuid().nullable(),
  tipo: z.enum(["fornecedor", "cliente", "ambos"]),
  nome: z.string().min(1),
  nome_fantasia: z.string().nullable(),
  cnpj: z.string().nullable(),
  cpf: z.string().nullable(),
  contato: z.string().nullable(),
  email: z.string().nullable(),
  categoria: z.string().nullable(),
  cep: z.string().nullable(),
  logradouro: z.string().nullable(),
  numero: z.string().nullable(),
  bairro: z.string().nullable(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  observacoes: z.string().nullable(),
});

export const salvarTerceiro = createServerFn({ method: "POST" })
  .validator((d: unknown) => terceiroSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
      const valores = [
        data.tipo,
        data.nome,
        data.nome_fantasia,
        data.cnpj,
        data.cpf,
        data.contato,
        data.email,
        data.categoria,
        data.cep,
        data.logradouro,
        data.numero,
        data.bairro,
        data.municipio,
        data.uf,
        data.observacoes,
      ];
      if (data.id) {
        await conn.query(
          `UPDATE terceiros SET tipo=?, nome=?, nome_fantasia=?, cnpj=?, cpf=?, contato=?, email=?, categoria=?,
           cep=?, logradouro=?, numero=?, bairro=?, municipio=?, uf=?, observacoes=?
           WHERE id=? AND loja_id = @current_loja_id`,
          [...valores, data.id],
        );
      } else {
        await conn.query(
          `INSERT INTO terceiros (loja_id, tipo, nome, nome_fantasia, cnpj, cpf, contato, email, categoria, cep,
           logradouro, numero, bairro, municipio, uf, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [lojaId, ...valores],
        );
      }
    });
  });

const fornecedorRapidoSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  documento: z.string().trim().max(18).nullable(),
  contato: z.string().trim().max(100).nullable(),
  email: z.string().trim().email().max(200).nullable().or(z.literal("")),
});

const terceiroRapidoSchema = fornecedorRapidoSchema.extend({
  tipo: z.enum(["fornecedor", "cliente"]),
});

export const criarTerceiroRapido = createServerFn({ method: "POST" })
  .validator((d: unknown) => terceiroRapidoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string; nome: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
      const id = crypto.randomUUID();
      const digitos = (data.documento ?? "").replace(/\D/g, "");
      await conn.query(
        `INSERT INTO terceiros (id, loja_id, tipo, nome, cnpj, cpf, contato, email, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          id,
          lojaId,
          data.tipo,
          data.nome,
          digitos.length === 14 ? digitos : null,
          digitos.length === 11 ? digitos : null,
          data.contato || null,
          data.email || null,
        ],
      );
      return { id, nome: data.nome };
    });
  });

export const criarFornecedorRapido = createServerFn({ method: "POST" })
  .validator((d: unknown) => fornecedorRapidoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string; nome: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
      const id = crypto.randomUUID();
      const digitos = (data.documento ?? "").replace(/\D/g, "");
      await conn.query(
        `INSERT INTO terceiros (id, loja_id, tipo, nome, cnpj, cpf, contato, email, ativo)
         VALUES (?, ?, 'fornecedor', ?, ?, ?, ?, ?, TRUE)`,
        [
          id,
          lojaId,
          data.nome,
          digitos.length === 14 ? digitos : null,
          digitos.length === 11 ? digitos : null,
          data.contato || null,
          data.email || null,
        ],
      );
      return { id, nome: data.nome };
    });
  });

export const alternarAtivoTerceiro = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("UPDATE terceiros SET ativo=? WHERE id=? AND loja_id = @current_loja_id", [
        data.ativo,
        data.id,
      ]);
    });
  });

// ---------- Consulta de CNPJ (antes Supabase Edge Function "consulta-cnpj") ----------
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

type DadosCnpj = {
  nome: string;
  fantasia: string;
  contato: string;
  categoria: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
};

async function consultarProvedor(cnpj: string): Promise<{ dados: DadosCnpj } | { erro: string }> {
  const urls = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
  ];
  let ultimoErro = "";
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "FraternityLedger/1.0" },
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) {
        ultimoErro = `HTTP ${resp.status}`;
        continue;
      }
      // A resposta vem de APIs públicas de CNPJ que divergem nos nomes dos
      // campos (por isso os vários ?? abaixo). Record<string, unknown> diz a
      // verdade sobre o que se sabe do formato — que é: nada garantido —, e
      // `texto()` faz a conversão segura de cada campo lido.
      const j = (await resp.json()) as Record<string, unknown>;
      const texto = (valor: unknown): string => (typeof valor === "string" ? valor : "");
      const primeiraAtividade = Array.isArray(j.atividade_principal)
        ? (j.atividade_principal[0] as { text?: unknown } | undefined)
        : undefined;
      const nome = texto(j.razao_social) || texto(j.nome) || texto(j.fantasia);
      if (!nome) {
        ultimoErro = texto(j.message) || texto(j.status) || "CNPJ não localizado";
        continue;
      }
      return {
        dados: {
          nome,
          fantasia: texto(j.nome_fantasia) || texto(j.fantasia),
          contato: [j.ddd_telefone_1, j.telefone].map(texto).filter(Boolean).join(" ").trim(),
          categoria: texto(j.cnae_fiscal_descricao) || texto(primeiraAtividade?.text),
          logradouro: texto(j.logradouro),
          numero: texto(j.numero),
          bairro: texto(j.bairro),
          municipio: texto(j.municipio) || texto(j.cidade),
          uf: texto(j.uf),
          cep: texto(j.cep),
        },
      };
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
    }
  }
  return { erro: ultimoErro || "Não foi possível consultar o CNPJ." };
}

export const consultarCnpj = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ cnpj: z.string().length(14) }).parse(d))
  .handler(async ({ data }): Promise<{ dados: DadosCnpj; cache: boolean }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioId) => {
      const agora = Date.now();

      // Rate limit por usuário.
      const [limites] = await conn.query<RowDataPacket[]>(
        "SELECT tentativas, janela_inicio FROM cnpj_rate_limit WHERE usuario_id = ?",
        [usuarioId],
      );
      const limite = limites[0];
      if (limite) {
        const janelaInicio = new Date(limite.janela_inicio).getTime();
        if (agora - janelaInicio < RATE_LIMIT_WINDOW_MS) {
          if (limite.tentativas >= RATE_LIMIT_MAX) {
            throw new Error("Muitas consultas. Aguarde alguns minutos e tente novamente.");
          }
          await conn.query(
            "UPDATE cnpj_rate_limit SET tentativas = tentativas + 1 WHERE usuario_id = ?",
            [usuarioId],
          );
        } else {
          await conn.query(
            "UPDATE cnpj_rate_limit SET tentativas = 1, janela_inicio = NOW() WHERE usuario_id = ?",
            [usuarioId],
          );
        }
      } else {
        await conn.query("INSERT INTO cnpj_rate_limit (usuario_id, tentativas) VALUES (?, 1)", [
          usuarioId,
        ]);
      }

      // Cache.
      const [cacheados] = await conn.query<RowDataPacket[]>(
        "SELECT dados, consultado_em FROM cnpj_consultas_cache WHERE cnpj = ?",
        [data.cnpj],
      );
      const cacheado = cacheados[0];
      if (cacheado && agora - new Date(cacheado.consultado_em).getTime() < CACHE_TTL_MS) {
        const dados =
          typeof cacheado.dados === "string" ? JSON.parse(cacheado.dados) : cacheado.dados;
        return { dados, cache: true };
      }

      const resultado = await consultarProvedor(data.cnpj);
      if ("erro" in resultado) throw new Error(resultado.erro);

      await conn.query(
        "INSERT INTO cnpj_consultas_cache (cnpj, dados, consultado_em) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE dados = VALUES(dados), consultado_em = NOW()",
        [data.cnpj, JSON.stringify(resultado.dados)],
      );
      return { dados: resultado.dados, cache: false };
    });
  });
