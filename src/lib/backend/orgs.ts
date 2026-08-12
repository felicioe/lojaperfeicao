import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// RLS original (mysql/migrations/0002_cadastros.sql): SELECT livre para
// autenticados; escrita (potencias/orgs/orgs_graus) admin OU secretario.
const PAPEIS_ESCRITA = ["admin", "secretario"];

export type Natureza = "loja" | "capitulo" | "conselho" | "areopago" | "consistorio" | "outro";

export type Potencia = {
  id: string;
  nome: string;
  sigla: string | null;
  jurisdicao: string | null;
  site: string | null;
  ativo: boolean;
};

export type Org = {
  id: string;
  potencia_id: string | null;
  nome: string;
  sigla: string | null;
  natureza: Natureza;
  numero: string | null;
  rito: string | null;
  grau_min: number;
  grau_max: number;
  mensalidade_padrao: number;
  cnpj: string | null;
  fundacao: string | null;
  endereco: string | null;
  logo_url: string | null;
  ativo: boolean;
};

export type OrgGrau = {
  id: string;
  org_id: string;
  grau: number;
  nome: string;
  interstico_minimo_meses: number | null;
};

export const listarPotencias = createServerFn({ method: "GET" }).handler(
  async (): Promise<Potencia[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome, sigla, jurisdicao, site, ativo FROM potencias ORDER BY nome",
      );
      return rows as Potencia[];
    });
  },
);

const potenciaSchema = z.object({
  id: z.string().uuid().nullable(),
  nome: z.string().min(1),
  sigla: z.string().nullable(),
  jurisdicao: z.string().nullable(),
  site: z.string().nullable(),
});

export const salvarPotencia = createServerFn({ method: "POST" })
  .validator((d: unknown) => potenciaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      if (data.id) {
        await conn.query("UPDATE potencias SET nome=?, sigla=?, jurisdicao=?, site=? WHERE id=?", [
          data.nome,
          data.sigla,
          data.jurisdicao,
          data.site,
          data.id,
        ]);
      } else {
        await conn.query(
          "INSERT INTO potencias (nome, sigla, jurisdicao, site) VALUES (?, ?, ?, ?)",
          [data.nome, data.sigla, data.jurisdicao, data.site],
        );
      }
    });
  });

export const alternarAtivoPotencia = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("UPDATE potencias SET ativo=? WHERE id=?", [data.ativo, data.id]);
    });
  });

export const listarOrgs = createServerFn({ method: "GET" }).handler(async (): Promise<Org[]> => {
  return comSessao(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM orgs ORDER BY nome");
    return rows as Org[];
  });
});

const orgSchema = z.object({
  id: z.string().uuid().nullable(),
  potencia_id: z.string().uuid().nullable(),
  nome: z.string().min(1),
  sigla: z.string().nullable(),
  natureza: z.enum(["loja", "capitulo", "conselho", "areopago", "consistorio", "outro"]),
  numero: z.string().nullable(),
  rito: z.string().nullable(),
  grau_min: z.number().int().positive(),
  grau_max: z.number().int().positive(),
  mensalidade_padrao: z.number(),
  cnpj: z.string().nullable(),
  fundacao: z.string().nullable(),
  endereco: z.string().nullable(),
  logo_url: z.string().nullable().optional(),
});

export const salvarOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) => orgSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      const valores = [
        data.potencia_id,
        data.nome,
        data.sigla,
        data.natureza,
        data.numero,
        data.rito,
        data.grau_min,
        data.grau_max,
        data.mensalidade_padrao,
        data.cnpj,
        data.fundacao,
        data.endereco,
        data.logo_url ?? null,
      ];
      if (data.id) {
        await conn.query(
          `UPDATE orgs SET potencia_id=?, nome=?, sigla=?, natureza=?, numero=?, rito=?, grau_min=?, grau_max=?,
           mensalidade_padrao=?, cnpj=?, fundacao=?, endereco=?, logo_url=? WHERE id=?`,
          [...valores, data.id],
        );
      } else {
        await conn.query(
          `INSERT INTO orgs (potencia_id, nome, sigla, natureza, numero, rito, grau_min, grau_max,
           mensalidade_padrao, cnpj, fundacao, endereco, logo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          valores,
        );
      }
    });
  });

export const alternarAtivoOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("UPDATE orgs SET ativo=? WHERE id=?", [data.ativo, data.id]);
    });
  });

// Exclusão real (não é só o "ativo=false" de alternarAtivoOrg) — pensada
// pra corpo cadastrado errado/duplicado, sem uso de verdade. A maioria das
// tabelas ligadas a orgs é ON DELETE CASCADE (irmao_orgs, gestoes, cargos,
// taxas_grau, sgcab_cobrancas, eventos, comunicados, tabela_valores,
// comissoes — ver mysql/migrations), então excluir sem checar antes
// apagaria em cascata dados reais (vínculo de irmãos, cobranças, gestões
// etc.). orgs_graus fica de fora da checagem por ser só nome de grau, sem
// dado de irmão/financeiro associado.
export type UsoOrg = {
  org_id: string;
  irmaos: number;
  gestoes: number;
  cobrancas: number;
  eventos: number;
  comissoes: number;
  cargos: number;
  taxasGrau: number;
  comunicados: number;
  tabelaValores: number;
};

const USO_LABEL: Record<Exclude<keyof UsoOrg, "org_id">, string> = {
  irmaos: "irmão(s) vinculado(s)",
  gestoes: "gestão(ões)",
  cobrancas: "cobrança(s) SGCAB",
  eventos: "evento(s)",
  comissoes: "comissão(ões)",
  cargos: "cargo(s)",
  taxasGrau: "taxa(s) de grau",
  comunicados: "comunicado(s)",
  tabelaValores: "valor(es) na Tabela de Valores",
};

// Quantidade de registros nas tabelas que dependem de cada org (ON DELETE
// CASCADE) — mostrado na tela antes do usuário tentar excluir, pra não
// precisar adivinhar o que está bloqueando (issue: "como saber quais dados
// estão vinculados a este corpo?").
export const listarUsoOrgs = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsoOrg[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT o.id AS org_id,
                (SELECT COUNT(*) FROM irmao_orgs WHERE org_id = o.id) AS irmaos,
                (SELECT COUNT(*) FROM gestoes WHERE org_id = o.id) AS gestoes,
                (SELECT COUNT(*) FROM sgcab_cobrancas WHERE org_id = o.id) AS cobrancas,
                (SELECT COUNT(*) FROM eventos WHERE org_id = o.id) AS eventos,
                (SELECT COUNT(*) FROM comissoes WHERE org_id = o.id) AS comissoes,
                (SELECT COUNT(*) FROM cargos WHERE org_id = o.id) AS cargos,
                (SELECT COUNT(*) FROM taxas_grau WHERE org_id = o.id) AS taxasGrau,
                (SELECT COUNT(*) FROM comunicados WHERE org_id = o.id) AS comunicados,
                (SELECT COUNT(*) FROM tabela_valores WHERE org_id = o.id) AS tabelaValores
         FROM orgs o`,
      );
      return rows as UsoOrg[];
    });
  },
);

function descreverUso(uso: Omit<UsoOrg, "org_id">): string {
  return (Object.keys(USO_LABEL) as (keyof typeof USO_LABEL)[])
    .filter((chave) => uso[chave] > 0)
    .map((chave) => `${uso[chave]} ${USO_LABEL[chave]}`)
    .join(", ");
}

// Move os dados vinculados a um corpo (origem) pra outro (destino) — pensado
// pra corpo cadastrado duplicado/errado que já tem histórico real preso
// (issue: "consegue transferir deste corpo para o corpo ativo?"). Depois de
// transferir, o corpo de origem fica sem uso e passa a poder ser excluído
// normalmente por excluirOrg. irmao_orgs usa UPDATE IGNORE porque tem
// UNIQUE(irmao_id, org_id) — se o irmão já estiver no destino, a linha da
// origem simplesmente é descartada (o vínculo já existe lá) em vez de
// travar a transferência inteira. sessoes e planos_ensino não entram na
// checagem de "uso" (a FK é ON DELETE SET NULL, não CASCADE — excluir sem
// transferir não apaga esses registros, só desvincula o corpo), mas ainda
// assim são movidos pra manter o histórico correto sob o corpo certo.
export const transferirDadosOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ origemId: z.string().uuid(), destinoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.origemId === data.destinoId) {
      throw new Error("Corpo de origem e destino não podem ser o mesmo.");
    }
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[destino]] = await conn.query<RowDataPacket[]>(
        "SELECT id, grau_min, grau_max FROM orgs WHERE id = ?",
        [data.destinoId],
      );
      if (!destino) throw new Error("Corpo de destino não encontrado.");

      // sessoes.grau e irmao_orgs.grau_atual não têm FK pra orgs_graus —
      // sem essa checagem, transferir pra um corpo com faixa de grau menor
      // (ex.: Loja grau_max=3) deixaria dados de grau fora da faixa válida
      // do corpo destino, silenciosamente.
      const [[faixaUsada]] = await conn.query<RowDataPacket[]>(
        `SELECT
           GREATEST(
             COALESCE((SELECT MAX(grau_atual) FROM irmao_orgs WHERE org_id = ?), 0),
             COALESCE((SELECT MAX(grau) FROM sessoes WHERE org_id = ?), 0)
           ) AS grau_max_usado,
           LEAST(
             COALESCE((SELECT MIN(grau_atual) FROM irmao_orgs WHERE org_id = ?), 999),
             COALESCE((SELECT MIN(grau) FROM sessoes WHERE org_id = ?), 999)
           ) AS grau_min_usado`,
        [data.origemId, data.origemId, data.origemId, data.origemId],
      );
      if (
        faixaUsada.grau_max_usado > 0 &&
        (faixaUsada.grau_min_usado < destino.grau_min ||
          faixaUsada.grau_max_usado > destino.grau_max)
      ) {
        throw new Error(
          `O corpo destino só aceita graus ${destino.grau_min}–${destino.grau_max}, mas a ` +
            `origem tem dados de grau ${faixaUsada.grau_min_usado}–${faixaUsada.grau_max_usado}.`,
        );
      }

      await conn.query("UPDATE IGNORE irmao_orgs SET org_id = ? WHERE org_id = ?", [
        data.destinoId,
        data.origemId,
      ]);
      // taxas_grau tem UNIQUE(org_id, ano, grau) — se o destino já tiver uma
      // taxa pro mesmo ano/grau, IGNORE descarta a linha da origem em vez de
      // travar a transferência inteira (mesmo raciocínio de irmao_orgs acima).
      await conn.query("UPDATE IGNORE taxas_grau SET org_id = ? WHERE org_id = ?", [
        data.destinoId,
        data.origemId,
      ]);
      for (const tabela of [
        "gestoes",
        "sgcab_cobrancas",
        "eventos",
        "comissoes",
        "sessoes",
        "cargos",
        "comunicados",
        "tabela_valores",
      ]) {
        await conn.query(`UPDATE ${tabela} SET org_id = ? WHERE org_id = ?`, [
          data.destinoId,
          data.origemId,
        ]);
      }
      await conn.query("UPDATE planos_ensino SET org_id = ? WHERE org_id = ?", [
        data.destinoId,
        data.origemId,
      ]);

      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "transferir_dados",
        "org",
        data.origemId,
        null,
        { destinoId: data.destinoId },
      );
    });
  });

export const excluirOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn, usuarioIdAtual) => {
      const [[uso]] = await conn.query<RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM irmao_orgs WHERE org_id = ?) AS irmaos,
           (SELECT COUNT(*) FROM gestoes WHERE org_id = ?) AS gestoes,
           (SELECT COUNT(*) FROM sgcab_cobrancas WHERE org_id = ?) AS cobrancas,
           (SELECT COUNT(*) FROM eventos WHERE org_id = ?) AS eventos,
           (SELECT COUNT(*) FROM comissoes WHERE org_id = ?) AS comissoes,
           (SELECT COUNT(*) FROM cargos WHERE org_id = ?) AS cargos,
           (SELECT COUNT(*) FROM taxas_grau WHERE org_id = ?) AS taxasGrau,
           (SELECT COUNT(*) FROM comunicados WHERE org_id = ?) AS comunicados,
           (SELECT COUNT(*) FROM tabela_valores WHERE org_id = ?) AS tabelaValores`,
        [data.id, data.id, data.id, data.id, data.id, data.id, data.id, data.id, data.id],
      );
      const descricao = descreverUso(uso as Omit<UsoOrg, "org_id">);
      if (descricao) {
        throw new Error(
          `Este corpo tem ${descricao} e não pode ser excluído — desative-o em vez disso.`,
        );
      }
      const [[org]] = await conn.query<RowDataPacket[]>("SELECT * FROM orgs WHERE id = ?", [
        data.id,
      ]);
      await conn.query("DELETE FROM orgs WHERE id = ?", [data.id]);
      await registrarAuditoria(conn, usuarioIdAtual, "excluir", "org", data.id, org, null);
    });
  });

export const listarOrgsGraus = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<OrgGrau[]> => {
    return comSessao(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM orgs_graus WHERE org_id = ? ORDER BY grau",
        [data.orgId],
      );
      return rows as OrgGrau[];
    });
  });

export const gerarGrausPadraoOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<number> => {
    return comSessao(async (conn) => {
      await conn.query("CALL gerar_graus_padrao_org(?, @total)", [data.orgId]);
      const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT @total AS total");
      return Number(total);
    });
  });

export const criarOrgGrau = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        grau: z.number().int().positive(),
        nome: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("INSERT INTO orgs_graus (org_id, grau, nome) VALUES (?, ?, ?)", [
        data.orgId,
        data.grau,
        data.nome,
      ]);
    });
  });

export const renomearOrgGrau = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid(), nome: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("UPDATE orgs_graus SET nome=? WHERE id=?", [data.nome, data.id]);
    });
  });

export const atualizarIntersticioOrgGrau = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), meses: z.number().int().positive().nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("UPDATE orgs_graus SET interstico_minimo_meses=? WHERE id=?", [
        data.meses,
        data.id,
      ]);
    });
  });

export const removerOrgGrau = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM orgs_graus WHERE id=?", [data.id]);
    });
  });

// Mesmo padrão de uploadFotoIrmao (irmaos.ts): só grava o arquivo em
// public/uploads/ e devolve a URL — persistir em orgs.logo_url continua
// exigindo o "Salvar alterações" (salvarOrg).
const uploadLogoSchema = z.object({
  orgId: z.string().uuid(),
  nomeArquivo: z.string().min(1),
  dataUrl: z.string().startsWith("data:"),
});

export const uploadLogoOrg = createServerFn({ method: "POST" })
  .validator((d: unknown) => uploadLogoSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    return comPapel(PAPEIS_ESCRITA, async () => {
      const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error("Arquivo inválido.");
      const buffer = Buffer.from(match[2], "base64");
      const nomeSeguro = data.nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
      const dir = join(process.cwd(), "public", "uploads", "orgs", data.orgId);
      await mkdir(dir, { recursive: true });
      const nomeArquivoFinal = `${Date.now()}-${nomeSeguro}`;
      await writeFile(join(dir, nomeArquivoFinal), buffer);
      return { url: `/uploads/orgs/${data.orgId}/${nomeArquivoFinal}` };
    });
  });
