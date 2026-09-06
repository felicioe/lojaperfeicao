import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { comSessao, comPapel, SemPermissaoError } from "./authz";
import { registrarAuditoria } from "./auditoria";

// RLS original (mysql/migrations/0002_cadastros.sql):
// - irmaos: SELECT admin/secretario/tesoureiro (tudo) OU o próprio (usuario_id = current);
//   INSERT/UPDATE admin/secretario; DELETE admin.
// - irmao_orgs/irmao_formacao/irmao_filhos/irmao_parentes/irmao_elevacoes: mesmo SELECT
//   (admin/secretario/tesoureiro OU o próprio irmão vinculado); escrita admin/secretario.
const PAPEIS_PRIVILEGIADOS = ["admin", "secretario", "tesoureiro"];
const PAPEIS_ESCRITA = ["admin", "secretario"];

async function ehPrivilegiado(conn: PoolConnection): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT (${condicoes}) AS ok`,
    PAPEIS_PRIVILEGIADOS,
  );
  return !!row.ok;
}

/**
 * Autorização por PAPEL somada ao escopo de loja (issues #344 e #351).
 *
 * Ser secretário não é permissão para ver o irmão de outra Loja: papel diz o
 * que a pessoa pode fazer, `loja_id` diz sobre quais linhas. A versão
 * anterior deixava o papel privilegiado responder "pode" sem olhar de quem é
 * o irmão — e as consultas que só usam o irmaoId como PARÂMETRO (não como
 * filtro de linha), como listarFrequenciaIrmao, respondiam a uma pergunta
 * sobre o irmão de outra Loja em vez de recusar. Não vazava dado alheio (o
 * SELECT continua escopado), mas confirmava a existência do id e devolvia a
 * agenda da Loja como se a pergunta fizesse sentido. A suíte de isolamento
 * da #351 pegou isso.
 *
 * Agora a pergunta é uma só, e na ordem certa: o irmão é DESTA Loja e, sendo,
 * eu tenho papel para vê-lo ou sou eu mesmo?
 */
async function podeVerIrmao(
  conn: PoolConnection,
  usuarioId: string,
  irmaoId: string,
): Promise<boolean> {
  const condicoes = PAPEIS_PRIVILEGIADOS.map(() => "has_role(@current_usuario_id, ?)").join(" OR ");
  const [[row]] = await conn.query<RowDataPacket[]>(
    `SELECT EXISTS(
       SELECT 1 FROM irmaos
        WHERE id = ? AND loja_id = @current_loja_id
          AND ((${condicoes}) OR usuario_id = ?)
     ) AS ok`,
    [irmaoId, ...PAPEIS_PRIVILEGIADOS, usuarioId],
  );
  return !!row.ok;
}

/**
 * Confirma que o irmão pertence à Loja da sessão e devolve a loja para o
 * INSERT (issue #344).
 *
 * As tabelas-filhas (irmao_orgs, irmao_elevacoes, irmao_formacao, irmao_filhos,
 * irmao_parentes) recebem `irmao_id` direto do request. Sem esta checagem, o
 * secretário de uma Loja podia pendurar uma elevação, uma formação ou um
 * parente no irmão de OUTRA Loja — escrita cruzada, não só leitura. Não basta
 * escopar o SELECT: quem escreve também precisa provar que o alvo é dele.
 */
async function exigirIrmaoDaLoja(conn: PoolConnection, irmaoId: string): Promise<string> {
  const [[row]] = await conn.query<RowDataPacket[]>(
    "SELECT loja_id FROM irmaos WHERE id = ? AND loja_id = @current_loja_id",
    [irmaoId],
  );
  if (!row) throw new SemPermissaoError("Irmão não encontrado nesta Loja.");
  return row.loja_id as string;
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

// Achado da auditoria técnica: a tela de listagem (irmaos/index.tsx) só
// exibe estes 6 campos, e relatorioFrequencia (relatorios.ts) só usa
// id/nome_civil/nome_simbolico — não há motivo pra trazer as ~40 colunas
// de Irmao (CPF, RG, endereço, observações...) a cada carregamento da
// tela mais usada do sistema. Detalhe completo continua em obterIrmao.
export type IrmaoResumo = Pick<
  Irmao,
  "id" | "nome_civil" | "nome_simbolico" | "cim" | "grau" | "situacao"
>;

export const listarIrmaos = createServerFn({ method: "GET" }).handler(
  async (): Promise<IrmaoResumo[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const colunas = "id, nome_civil, nome_simbolico, cim, grau, situacao";
      const [rows] = privilegiado
        ? await conn.query<RowDataPacket[]>(
            `SELECT ${colunas} FROM irmaos WHERE loja_id = @current_loja_id ORDER BY nome_civil LIMIT 5000`,
          )
        : await conn.query<RowDataPacket[]>(
            `SELECT ${colunas} FROM irmaos WHERE loja_id = @current_loja_id AND usuario_id = ? ORDER BY nome_civil LIMIT 5000`,
            [usuarioId],
          );
      return rows as IrmaoResumo[];
    });
  },
);

/** Lista mínima id+nome_civil, usada em seletores (ex.: organograma de gestões). */
export const listarIrmaosNomes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ id: string; nome_civil: string }[]> => {
    return comSessao(async (conn, usuarioId) => {
      const privilegiado = await ehPrivilegiado(conn);
      const [rows] = privilegiado
        ? await conn.query<RowDataPacket[]>(
            "SELECT id, nome_civil FROM irmaos WHERE loja_id = @current_loja_id ORDER BY nome_civil",
          )
        : await conn.query<RowDataPacket[]>(
            "SELECT id, nome_civil FROM irmaos WHERE loja_id = @current_loja_id AND usuario_id = ? ORDER BY nome_civil",
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
      // O filtro de loja é o que impede o IDOR: o id vem do request, e sem ele
      // um secretário (privilegiado, portanto aprovado acima) leria a ficha
      // completa — CPF, endereço, filiação — de um irmão de outra Loja só por
      // adivinhar/obter o UUID.
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM irmaos WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
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
    return comPapel(PAPEIS_ESCRITA, async (conn, _usuarioId, lojaId) => {
      const id = crypto.randomUUID();
      const campos = Object.keys(data) as (keyof typeof data)[];
      const colunas = campos.join(", ");
      const placeholders = campos.map(() => "?").join(", ");
      // A loja vem do comPapel — quer dizer, da sessão —, nunca do request: o
      // schema acima sequer aceita loja_id, então não há como um cliente
      // adulterado cadastrar um irmão na Loja de outra pessoa. Hoje a coluna
      // ainda tem DEFAULT (migração 0092), mas informar explicitamente é o que
      // a #350 vai exigir quando esse DEFAULT sair.
      await conn.query(
        `INSERT INTO irmaos (id, loja_id, ${colunas}) VALUES (?, ?, ${placeholders})`,
        [id, lojaId, ...campos.map((c) => data[c] ?? null)],
      );
      return { id };
    });
  });

// Mesma lista de campos editáveis da tela de perfil (CAMPOS_PERFIL no
// frontend original) — tudo exceto usuario_id/criado_em/atualizado_em.
const CAMPOS_PERFIL = [
  "nome_civil",
  "nome_simbolico",
  "cim",
  "numero_matricula",
  "estado_civil",
  "cpf",
  "rg",
  "data_nascimento",
  "naturalidade",
  "nacionalidade",
  "religiao",
  "observacoes",
  "foto_url",
  "grau",
  "situacao",
  "data_iniciacao",
  "data_elevacao",
  "data_exaltacao",
  "loja_origem",
  "numero_grande_oriente",
  "fundador",
  "benemerito",
  "honorario",
  "licenciado",
  "potencia",
  "profissao",
  "empresa",
  "cargo_profissional",
  "area_atuacao",
  "valor_mensalidade",
  "email",
  "telefone",
  "celular",
  "endereco",
  "cep",
  "logradouro",
  "numero_endereco",
  "complemento",
  "bairro",
  "cidade",
  "estado",
] as const;

const perfilSchema = z.object({
  id: z.string().uuid(),
  perfil: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const atualizarPerfilIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => perfilSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const campos: string[] = CAMPOS_PERFIL.filter((c) => c in data.perfil);
      if (campos.length === 0) return;
      // Só o estado ANTERIOR dos campos que de fato vão ser alterados — sem
      // isso, uma mudança indevida de grau/situação/mensalidade não deixava
      // rastro nenhum de quem fez nem do valor anterior.
      const colunasAntes = campos.includes("valor_mensalidade")
        ? [...new Set([...campos, "valor_mensalidade_customizado"])]
        : campos;
      const [[antes]] = await conn.query<RowDataPacket[]>(
        `SELECT ${colunasAntes.join(", ")} FROM irmaos WHERE id = ? AND loja_id = @current_loja_id`,
        [data.id],
      );
      // Sem linha, o id não é desta Loja (ou não existe). Recusar aqui e não
      // deixar o UPDATE abaixo simplesmente não casar nada é o que evita uma
      // auditoria com `antes` nulo registrando uma edição que nunca aconteceu.
      if (!antes) throw new SemPermissaoError("Irmão não encontrado nesta Loja.");
      // Editar a mensalidade aqui (fora do reajuste em massa) só conta como
      // negociação individual quando o valor DE FATO muda — a tela de
      // perfil (irmaos/$id.tsx) manda TODOS os campos em toda edição, então
      // sem essa comparação qualquer alteração não relacionada (telefone,
      // endereço etc.) marcaria o irmão como customizado pra sempre,
      // travando-o fora de qualquer reajuste em massa futuro.
      if (
        campos.includes("valor_mensalidade") &&
        Number(data.perfil.valor_mensalidade) !== Number(antes?.valor_mensalidade)
      ) {
        campos.push("valor_mensalidade_customizado");
        data.perfil.valor_mensalidade_customizado = true;
      }
      const set = campos.map((c) => `${c} = ?`).join(", ");
      const valores = campos.map((c) => data.perfil[c] ?? null);
      await conn.query(`UPDATE irmaos SET ${set} WHERE id = ? AND loja_id = @current_loja_id`, [
        ...valores,
        data.id,
      ]);
      const depois = Object.fromEntries(campos.map((c) => [c, data.perfil[c] ?? null]));
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar_perfil",
        "irmao",
        data.id,
        antes ?? null,
        depois,
      );
    });
  });

export const excluirIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioIdAtual) => {
      const [[irmao]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_civil, cim FROM irmaos WHERE id = ? AND loja_id = @current_loja_id",
        [data.id],
      );
      if (!irmao) throw new SemPermissaoError("Irmão não encontrado nesta Loja.");
      await conn.query("DELETE FROM irmaos WHERE id = ? AND loja_id = @current_loja_id", [data.id]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "excluir_irmao",
        "irmao",
        data.id,
        irmao ?? null,
      );
    });
  });

// Upload de foto: guarda a imagem como data URL direto na coluna
// (irmaos.foto_url é MEDIUMTEXT, migração 0116) em vez de gravar em disco —
// public/uploads/ não é versionado no git e não sobrevive a um novo deploy
// da Hostinger (git clone + build do zero), o que deixava a foto quebrada
// assim que a aplicação era reimplantada depois do upload (mesma classe de
// bug do QR Code Pix, migração 0108). Só devolve o data URL — persistir em
// irmaos.foto_url continua exigindo o "Salvar alterações" (atualizarPerfilIrmao).
const uploadFotoSchema = z.object({
  irmaoId: z.string().uuid(),
  dataUrl: z.string().startsWith("data:"),
});

const TAMANHO_MAXIMO_FOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export const uploadFotoIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadFotoSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    return comPapel(PAPEIS_ESCRITA, async () => {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Arquivo inválido.");
      if (!match[1].startsWith("image/")) {
        throw new Error("Tipo de arquivo não permitido. Envie uma imagem.");
      }
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.byteLength > TAMANHO_MAXIMO_FOTO_BYTES) {
        throw new Error("Arquivo maior que o limite de 5 MB.");
      }
      return { url: data.dataUrl };
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
         FROM irmao_orgs io JOIN orgs o ON o.id = io.org_id AND o.loja_id = @current_loja_id
        WHERE io.irmao_id = ? AND io.loja_id = @current_loja_id`,
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
      const lojaId = await exigirIrmaoDaLoja(conn, data.irmaoId);
      // O corpo maçônico também vem do request e também precisa ser desta
      // Loja — senão o vínculo apontaria para um org de outra.
      const [[org]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM orgs WHERE id = ? AND loja_id = @current_loja_id",
        [data.orgId],
      );
      if (!org) throw new SemPermissaoError("Corpo maçônico não encontrado nesta Loja.");
      await conn.query(
        "INSERT INTO irmao_orgs (loja_id, irmao_id, org_id, principal, grau_atual) VALUES (?, ?, ?, ?, ?)",
        [lojaId, data.irmaoId, data.orgId, data.principal, data.grauAtual],
      );
    });
  });

export const removerIrmaoOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_orgs WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
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
        "SELECT id, grau, data FROM irmao_elevacoes WHERE irmao_id = ? AND loja_id = @current_loja_id ORDER BY grau",
        [data.irmaoId],
      );
      return rows as IrmaoElevacao[];
    });
  });

export const criarIrmaoElevacao = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        irmaoId: z.string().uuid(),
        grau: z.number().int().positive(),
        data: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const lojaId = await exigirIrmaoDaLoja(conn, data.irmaoId);
      await conn.query(
        "INSERT INTO irmao_elevacoes (loja_id, irmao_id, grau, data) VALUES (?, ?, ?, ?)",
        [lojaId, data.irmaoId, data.grau, data.data],
      );
    });
  });

export const removerIrmaoElevacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_elevacoes WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
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
        "SELECT id, curso, instituicao, nivel, ano_conclusao FROM irmao_formacao WHERE irmao_id = ? AND loja_id = @current_loja_id ORDER BY ano_conclusao DESC",
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
      const lojaId = await exigirIrmaoDaLoja(conn, data.irmaoId);
      await conn.query(
        "INSERT INTO irmao_formacao (loja_id, irmao_id, curso, instituicao, nivel, ano_conclusao) VALUES (?, ?, ?, ?, ?, ?)",
        [lojaId, data.irmaoId, data.curso, data.instituicao, data.nivel, data.anoConclusao],
      );
    });
  });

export const removerIrmaoFormacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_formacao WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
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
        "SELECT id, nome, data_nascimento FROM irmao_filhos WHERE irmao_id = ? AND loja_id = @current_loja_id ORDER BY data_nascimento",
        [data.irmaoId],
      );
      return rows as IrmaoFilho[];
    });
  });

export const criarIrmaoFilho = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        irmaoId: z.string().uuid(),
        nome: z.string().min(1),
        dataNascimento: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const lojaId = await exigirIrmaoDaLoja(conn, data.irmaoId);
      await conn.query(
        "INSERT INTO irmao_filhos (loja_id, irmao_id, nome, data_nascimento) VALUES (?, ?, ?, ?)",
        [lojaId, data.irmaoId, data.nome, data.dataNascimento],
      );
    });
  });

export const removerIrmaoFilho = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_filhos WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
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
    z
      .object({
        irmaoId: z.string().uuid(),
        tipo: z.enum(["pai", "mae", "conjuge", "contato_emergencia", "outro"]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<IrmaoParente[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, nome, data_nascimento, telefone, profissao, data_casamento FROM irmao_parentes
         WHERE irmao_id = ? AND tipo = ? AND loja_id = @current_loja_id ORDER BY nome`,
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
      const lojaId = await exigirIrmaoDaLoja(conn, data.irmaoId);
      await conn.query(
        `INSERT INTO irmao_parentes (loja_id, irmao_id, tipo, nome, data_nascimento, telefone, profissao, data_casamento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lojaId,
          data.irmaoId,
          data.tipo,
          data.nome,
          data.dataNascimento,
          data.telefone,
          data.profissao,
          data.dataCasamento,
        ],
      );
    });
  });

export const removerIrmaoParente = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM irmao_parentes WHERE id = ? AND loja_id = @current_loja_id", [
        data.id,
      ]);
    });
  });

// Resolve o cadastro de irmão vinculado ao usuário logado (painel do
// próprio irmão) — retorna null se o login ainda não foi vinculado a um
// cadastro (admin precisa vincular via irmaos.usuario_id).
export const obterMeuIrmao = createServerFn({ method: "GET" }).handler(
  async (): Promise<Irmao | null> => {
    return comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM irmaos WHERE usuario_id = ? AND loja_id = @current_loja_id LIMIT 1",
        [usuarioId],
      );
      return (rows[0] as Irmao) ?? null;
    });
  },
);

// Campos que o próprio irmão pode editar no Meu Painel — só contato e dados
// profissionais. Tudo que é maçônico/administrativo (grau, situação, datas,
// valor da mensalidade, CIM, documentos) continua exclusivo de
// admin/secretario via atualizarPerfilIrmao.
const CAMPOS_MEU_PERFIL = [
  "telefone",
  "celular",
  "email",
  "cep",
  "logradouro",
  "numero_endereco",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "profissao",
  "empresa",
  "cargo_profissional",
  "area_atuacao",
] as const;

const meuPerfilSchema = z.object({
  perfil: z.record(z.string(), z.union([z.string(), z.null()])),
});

export const atualizarMeuPerfil = createServerFn({ method: "POST" })
  .validator((d: unknown) => meuPerfilSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      const campos = CAMPOS_MEU_PERFIL.filter((c) => c in data.perfil);
      if (campos.length === 0) return;
      const set = campos.map((c) => `${c} = ?`).join(", ");
      const valores = campos.map((c) => data.perfil[c] ?? null);
      const [resultado] = await conn.query<ResultSetHeader>(
        `UPDATE irmaos SET ${set} WHERE usuario_id = ? AND loja_id = @current_loja_id`,
        [...valores, usuarioId],
      );
      if (resultado.affectedRows === 0) {
        throw new Error("Cadastro ainda não vinculado a este usuário.");
      }
    });
  });

export type StatusQuitacao = { quite: boolean; pendentes: number };

// "Quite" aqui significa sem nenhuma mensalidade em aberto — mesmo
// critério já usado no resumo financeiro do Meu Painel.
export const obterStatusQuitacao = createServerFn({ method: "GET" }).handler(
  async (): Promise<StatusQuitacao> => {
    return comSessao(async (conn, usuarioId) => {
      const [[row]] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS pendentes
         FROM lancamentos l
         JOIN irmaos i ON i.id = l.irmao_id AND i.loja_id = @current_loja_id
         WHERE i.usuario_id = ? AND l.loja_id = @current_loja_id
           AND l.tipo = 'entrada' AND l.is_mensalidade = TRUE AND l.pago = FALSE`,
        [usuarioId],
      );
      const pendentes = Number(row.pendentes);
      return { quite: pendentes === 0, pendentes };
    });
  },
);

// ---------- Painéis somente-leitura (financeiro / cargos histórico) ----------
export type LancamentoIrmao = {
  id: string;
  data: string;
  descricao: string;
  tipo: string;
  valor: number;
  valor_pago: number;
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
        "SELECT id, data, descricao, tipo, valor, valor_pago, pago FROM lancamentos WHERE irmao_id = ? AND loja_id = @current_loja_id ORDER BY data DESC LIMIT 100",
        [data.irmaoId],
      );
      return rows as LancamentoIrmao[];
    });
  });

export type FrequenciaSessaoIrmao = {
  id: string;
  data: string;
  tipo: string;
  grau: number;
  presente: boolean | null;
  justificado: boolean;
};

// Sessões (leitura livre) com a presença do irmão específico marcada via
// LEFT JOIN — presente = null quando a sessão ainda não teve chamada
// registrada para esse irmão. Mesma visibilidade "privilegiado ou próprio"
// de listarLancamentosIrmao.
export const listarFrequenciaIrmao = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<FrequenciaSessaoIrmao[]> => {
    return comSessao(async (conn, usuarioId) => {
      if (!(await podeVerIrmao(conn, usuarioId, data.irmaoId))) throw new SemPermissaoError();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.data, s.tipo, s.grau, p.presente, p.justificado
         FROM sessoes s
         LEFT JOIN presencas p ON p.sessao_id = s.id AND p.irmao_id = ?
                              AND p.loja_id = @current_loja_id
         WHERE s.loja_id = @current_loja_id
         ORDER BY s.data DESC
         LIMIT 100`,
        [data.irmaoId],
      );
      return rows.map((r) => ({
        id: r.id,
        data: r.data,
        tipo: r.tipo,
        grau: r.grau,
        presente: r.presente === null ? null : !!r.presente,
        justificado: !!r.justificado,
      }));
    });
  });

export type CargoHistorico = {
  id: string;
  cargos: { nome: string } | null;
  gestoes: {
    nome: string;
    ativo: boolean;
    org_id: string;
    orgs: { nome: string; sigla: string | null } | null;
  } | null;
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
         JOIN cargos c ON c.id = gc.cargo_id AND c.loja_id = @current_loja_id
         JOIN gestoes g ON g.id = gc.gestao_id AND g.loja_id = @current_loja_id
         JOIN orgs o ON o.id = g.org_id AND o.loja_id = @current_loja_id
         WHERE gc.irmao_id = ? AND gc.loja_id = @current_loja_id`,
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
