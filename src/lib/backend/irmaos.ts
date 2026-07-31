import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel, SemPermissaoError } from "./authz";

// RLS original (mysql/migrations/0002_cadastros.sql):
// - irmaos: SELECT admin/secretario/tesoureiro (tudo) OU o próprio (usuario_id = current);
//   INSERT/UPDATE admin/secretario; DELETE admin.
// - irmao_orgs/irmao_formacao/irmao_filhos/irmao_parentes/irmao_elevacoes: mesmo SELECT
//   (admin/secretario/tesoureiro OU o próprio irmão vinculado); escrita admin/secretario.
const PAPEIS_PRIVILEGIADOS = ["admin", "secretario", "tesoureiro"];
const PAPEIS_ESCRITA = ["admin", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(`SELECT (${condicoes}) AS ok`, PAPEIS_PRIVILEGIADOS);
  return !!row.ok;
}

async function podeVerIrmao(conn: PoolConnection, usuarioId: string, irmaoId: string): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes} OR EXISTS(SELECT 1 FROM irmaos WHERE id = ? AND usuario_id = ?)) AS ok`,
    [...PAPEIS_PRIVILEGIADOS, irmaoId, usuarioId],
  );
  return !!row.ok;
}

export type Irmao = {
  id: string;
  usuario_id: string | null;
  nome_civil: string;
  nome_simbolico: string | null;
  cim: string | null;
  grau: "aprendiz" | "companheiro" | "mestre";
  data_iniciacao: string | null;
  data_elevacao: string | null;
  data_exaltacao: string | null;
  situacao: "ativo" | "quite" | "irregular" | "adormecido";
  potencia: string | null;
  loja_origem: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  data_nascimento: string | null;
  profissao: string | null;
  valor_mensalidade: number;
  numero_matricula: string | null;
  estado_civil: string | null;
  cpf: string | null;
  rg: string | null;
  naturalidade: string | null;
  nacionalidade: string | null;
  religiao: string | null;
  foto_url: string | null;
  observacoes: string | null;
  numero_grande_oriente: string | null;
  fundador: boolean;
  benemerito: boolean;
  honorario: boolean;
  licenciado: boolean;
  empresa: string | null;
  cargo_profissional: string | null;
  area_atuacao: string | null;
  cep: string | null;
  logradouro: string | null;
  numero_endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  celular: string | null;
  criado_em: string;
  atualizado_em: string;
};

export const listarIrmaos = createServerFn({ method: "GET" }).handler(async (): Promise<Irmao[]> => {
  return comSessao(async (conn, usuarioId) => {
    const privilegiado = await ehPrivilegiado(conn);
    const [rows] = privilegiado
      ? await conn.query<RowDataPacket[]>("SELECT * FROM irmaos ORDER BY nome_civil")
      : await conn.query<RowDataPacket[]>("SELECT * FROM irmaos WHERE usuario_id = ? ORDER BY nome_civil", [
          usuarioId,
        ]);
    return rows as Irmao[];
  });
});

/** Lista mínima id+nome_civil, usada em seletores (ex.: organograma de gestões). */
export const listarIrmaosNomes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; nome_civil: string }[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const [rows] = privilegiado
        ? await conn.query<RowDataPacket[]>("SELECT id, nome_civil FROM irmaos ORDER BY nome_civil")
        : await conn.query<RowDataPacket[]>(
            "SELECT id, nome_civil FROM irmaos WHERE usuario_id = ? ORDER BY nome_civil",
            [usuarioId],
          );
      return rows as { id: string; nome_civil: string }[];
    });
  },
);

export const obterIrmao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<Irmao | null> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.id))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM irmaos WHERE id = ?", [data.id]);
      return (rows[0] as Irmao) ?? null;
    });
  });

const novoIrmaoSchema = z.object({
  nome_civil: z.string().min(1),
  nome_simbolico: z.string().nullable().optional(),
  cim: z.string().nullable().optional(),
  grau: z.enum(["aprendiz", "companheiro", "mestre"]),
  data_iniciacao: z.string().nullable().optional(),
  data_elevacao: z.string().nullable().optional(),
  data_exaltacao: z.string().nullable().optional(),
  situacao: z.enum(["ativo", "quite", "irregular", "adormecido"]),
  potencia: z.string().nullable().optional(),
  loja_origem: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  endereco: z.string().nullable().optional(),
  data_nascimento: z.string().nullable().optional(),
  profissao: z.string().nullable().optional(),
  valor_mensalidade: z.number(),
});

export const criarIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => novoIrmaoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const id = crypto.randomUUID();
      const campos = Object.keys(data) as (keyof typeof data)[];
      const colunas = campos.join(", ");
      const placeholders = campos.map(() => "?").join(", ");
      await conn.query(`INSERT INTO irmaos (id, ${colunas}) VALUES (?, ${placeholders})`, [
        id,
        ...campos.map((c) => data[c] ?? null),
      ]);
      return { id };
    });
  });

// Mesma lista de campos editáveis da tela de perfil (CAMPOS_PERFIL no
// frontend original) — tudo exceto usuario_id/criado_em/atualizado_em.
const CAMPOS_PERFIL = [
  "nome_civil", "nome_simbolico", "cim", "numero_matricula", "estado_civil", "cpf", "rg",
  "data_nascimento", "naturalidade", "nacionalidade", "religiao", "observacoes", "foto_url",
  "grau", "situacao", "data_iniciacao", "data_elevacao", "data_exaltacao", "loja_origem",
  "numero_grande_oriente", "fundador", "benemerito", "honorario", "licenciado", "potencia",
  "profissao", "empresa", "cargo_profissional", "area_atuacao", "valor_mensalidade",
  "email", "telefone", "celular", "endereco", "cep", "logradouro", "numero_endereco",
  "complemento", "bairro", "cidade", "estado",
] as const;

const perfilSchema = z.object({
  id: z.string().uuid(),
  perfil: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const atualizarPerfilIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => perfilSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const campos = CAMPOS_PERFIL.filter((c) => c in data.perfil);
      if (campos.length === 0) return;
      const set = campos.map((c) => `${c} = ?`).join(", ");
      const valores = campos.map((c) => data.perfil[c] ?? null);
      await conn.query(`UPDATE irmaos SET ${set} WHERE id = ?`, [...valores, data.id]);
    });
  });

export const excluirIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn) => {
      await conn.query("DELETE FROM irmaos WHERE id = ?", [data.id]);
    });
  });

// Upload de foto: sem Supabase Storage, grava em disco sob public/uploads
// (servido estaticamente pelo Vite/Nitro, mesma pasta de favicon.ico/robots.txt)
// e devolve a URL pública relativa. Só grava o arquivo — persistir a URL em
// irmaos.foto_url continua exigindo o "Salvar alterações" (atualizarPerfilIrmao),
// igual ao fluxo original do Supabase Storage.
const uploadFotoSchema = z.object({
  irmaoId: z.string().uuid(),
  nomeArquivo: z.string().min(1),
  dataUrl: z.string().startsWith("data:"),
});

export const uploadFotoIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadFotoSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    return comPapel(PAPEIS_ESCRITA, async () => {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Arquivo inválido.");
      const buffer = Buffer.from(match[2], "base64");
      const nomeSeguro = data.nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
      const dir = join(process.cwd(), "public", "uploads", "irmaos", data.irmaoId);
      await mkdir(dir, { recursive: true });
      const nomeArquivoFinal = `${Date.now()}-${nomeSeguro}`;
      await writeFile(join(dir, nomeArquivoFinal), buffer);
      return { url: `/uploads/irmaos/${data.irmaoId}/${nomeArquivoFinal}` };
    });
  });

// ---------- irmao_orgs ----------
export type IrmaoOrg = {
  id: string;
  org_id: string;
  principal: boolean;
  grau_atual: number | null;
  orgs: { nome: string; sigla: string | null } | null;
};

export const listarIrmaoOrgs = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<IrmaoOrg[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT io.id, io.org_id, io.principal, io.grau_atual, o.nome AS org_nome, o.sigla AS org_sigla
         FROM irmao_orgs io JOIN orgs o ON o.id = io.org_id WHERE io.irmao_id = ?`,
        [data.irmaoId],
      );
      return rows.map((r) => ({
        id: r.id,
        org_id: r.org_id,
        principal: !!r.principal,
        grau_atual: r.grau_atual,
        orgs: { nome: r.org_nome, sigla: r.org_sigla },
      }));
    });
  });

export const criarIrmaoOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        irmaoId: z.string().uuid(),
        orgId: z.string().uuid(),
        principal: z.boolean(),
        grauAtual: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("INSERT INTO irmao_orgs (irmao_id, org_id, principal, grau_atual) VALUES (?, ?, ?, ?)", [
        data.irmaoId,
        data.orgId,
        data.principal,
        data.grauAtual,
      ]);
    });
  });

export const removerIrmaoOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_orgs WHERE id = ?", [data.id]);
    });
  });

// ---------- irmao_elevacoes ----------
export type IrmaoElevacao = { id: string; grau: number; data: string | null };

export const listarIrmaoElevacoes = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<IrmaoElevacao[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, grau, data FROM irmao_elevacoes WHERE irmao_id = ? ORDER BY grau",
        [data.irmaoId],
      );
      return rows as IrmaoElevacao[];
    });
  });

export const criarIrmaoElevacao = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ irmaoId: z.string().uuid(), grau: z.number().int().positive(), data: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("INSERT INTO irmao_elevacoes (irmao_id, grau, data) VALUES (?, ?, ?)", [
        data.irmaoId,
        data.grau,
        data.data,
      ]);
    });
  });

export const removerIrmaoElevacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_elevacoes WHERE id = ?", [data.id]);
    });
  });

// ---------- irmao_formacao ----------
export type IrmaoFormacao = {
  id: string;
  curso: string;
  instituicao: string | null;
  nivel: string | null;
  ano_conclusao: number | null;
};

export const listarIrmaoFormacao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<IrmaoFormacao[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, curso, instituicao, nivel, ano_conclusao FROM irmao_formacao WHERE irmao_id = ? ORDER BY ano_conclusao DESC",
        [data.irmaoId],
      );
      return rows as IrmaoFormacao[];
    });
  });

export const criarIrmaoFormacao = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        irmaoId: z.string().uuid(),
        curso: z.string().min(1),
        instituicao: z.string().nullable(),
        nivel: z.string().nullable(),
        anoConclusao: z.number().int().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query(
        "INSERT INTO irmao_formacao (irmao_id, curso, instituicao, nivel, ano_conclusao) VALUES (?, ?, ?, ?, ?)",
        [data.irmaoId, data.curso, data.instituicao, data.nivel, data.anoConclusao],
      );
    });
  });

export const removerIrmaoFormacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_formacao WHERE id = ?", [data.id]);
    });
  });

// ---------- irmao_filhos ----------
export type IrmaoFilho = { id: string; nome: string; data_nascimento: string | null };

export const listarIrmaoFilhos = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<IrmaoFilho[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome, data_nascimento FROM irmao_filhos WHERE irmao_id = ? ORDER BY data_nascimento",
        [data.irmaoId],
      );
      return rows as IrmaoFilho[];
    });
  });

export const criarIrmaoFilho = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ irmaoId: z.string().uuid(), nome: z.string().min(1), dataNascimento: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("INSERT INTO irmao_filhos (irmao_id, nome, data_nascimento) VALUES (?, ?, ?)", [
        data.irmaoId,
        data.nome,
        data.dataNascimento,
      ]);
    });
  });

export const removerIrmaoFilho = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_filhos WHERE id = ?", [data.id]);
    });
  });

// ---------- irmao_parentes ----------
export type TipoParente = "pai" | "mae" | "conjuge" | "contato_emergencia" | "outro";
export type IrmaoParente = {
  id: string;
  nome: string;
  data_nascimento: string | null;
  telefone: string | null;
  profissao: string | null;
  data_casamento: string | null;
};

export const listarIrmaoParentes = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ irmaoId: z.string().uuid(), tipo: z.enum(["pai", "mae", "conjuge", "contato_emergencia", "outro"]) }).parse(d),
  )
  .handler(async ({ data }): Promise<IrmaoParente[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, nome, data_nascimento, telefone, profissao, data_casamento FROM irmao_parentes
         WHERE irmao_id = ? AND tipo = ? ORDER BY nome`,
        [data.irmaoId, data.tipo],
      );
      return rows as IrmaoParente[];
    });
  });

export const criarIrmaoParente = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        irmaoId: z.string().uuid(),
        tipo: z.enum(["pai", "mae", "conjuge", "contato_emergencia", "outro"]),
        nome: z.string().min(1),
        dataNascimento: z.string().nullable(),
        telefone: z.string().nullable(),
        profissao: z.string().nullable(),
        dataCasamento: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query(
        `INSERT INTO irmao_parentes (irmao_id, tipo, nome, data_nascimento, telefone, profissao, data_casamento)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.irmaoId, data.tipo, data.nome, data.dataNascimento, data.telefone, data.profissao, data.dataCasamento],
      );
    });
  });

export const removerIrmaoParente = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_parentes WHERE id = ?", [data.id]);
    });
  });

// ---------- Painéis somente-leitura (financeiro / cargos histórico) ----------
export type LancamentoIrmao = {
  id: string;
  data: string;
  descricao: string;
  tipo: string;
  valor: number;
  pago: boolean;
};

// lancamentos_select original: admin/tesoureiro (tudo) OU o próprio irmão
// vinculado — mesma checagem de podeVerIrmao serve aqui.
export const listarLancamentosIrmao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<LancamentoIrmao[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, data, descricao, tipo, valor, pago FROM lancamentos WHERE irmao_id = ? ORDER BY data DESC LIMIT 100",
        [data.irmaoId],
      );
      return rows as LancamentoIrmao[];
    });
  });

export type CargoHistorico = {
  id: string;
  cargos: { nome: string } | null;
  gestoes: { nome: string; ativo: boolean; org_id: string; orgs: { nome: string; sigla: string | null } | null } | null;
};

export const listarCargosHistoricoIrmao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CargoHistorico[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT gc.id, c.nome AS cargo_nome, g.nome AS gestao_nome, g.ativo AS gestao_ativo, g.org_id,
                o.nome AS org_nome, o.sigla AS org_sigla
         FROM gestao_cargos gc
         JOIN cargos c ON c.id = gc.cargo_id
         JOIN gestoes g ON g.id = gc.gestao_id
         JOIN orgs o ON o.id = g.org_id
         WHERE gc.irmao_id = ?`,
        [data.irmaoId],
      );
      return rows.map((r) => ({
        id: r.id,
        cargos: { nome: r.cargo_nome },
        gestoes: {
          nome: r.gestao_nome,
          ativo: !!r.gestao_ativo,
          org_id: r.org_id,
          orgs: { nome: r.org_nome, sigla: r.org_sigla },
        },
      }));
    });
  });
