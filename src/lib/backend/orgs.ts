import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comSessao, comPapel } from "./authz";

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
  ativo: boolean;
};

export type OrgGrau = { id: string; org_id: string; grau: number; nome: string };

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
      ];
      if (data.id) {
        await conn.query(
          `UPDATE orgs SET potencia_id=?, nome=?, sigla=?, natureza=?, numero=?, rito=?, grau_min=?, grau_max=?,
           mensalidade_padrao=?, cnpj=?, fundacao=?, endereco=? WHERE id=?`,
          [...valores, data.id],
        );
      } else {
        await conn.query(
          `INSERT INTO orgs (potencia_id, nome, sigla, natureza, numero, rito, grau_min, grau_max,
           mensalidade_padrao, cnpj, fundacao, endereco) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export const removerOrgGrau = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comPapel(PAPEIS_ESCRITA, async (conn) => {
      await conn.query("DELETE FROM orgs_graus WHERE id=?", [data.id]);
    });
  });
