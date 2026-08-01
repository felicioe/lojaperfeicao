import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import type { Papel } from "./auth";

const SENHA_PADRAO = "123";

// Login = nome.sobrenome (decisão explícita do cliente, fase de testes —
// trocar para algo mais rígido depois). Gerado a partir de nome_civil, sem
// depender de e-mail cadastrado.
function normalizarParteNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function gerarLoginBase(nomeCivil: string): string {
  const partes = nomeCivil.trim().split(/\s+/).filter(Boolean);
  const primeiro = normalizarParteNome(partes[0] ?? "");
  const ultimo = partes.length > 1 ? normalizarParteNome(partes[partes.length - 1]) : "";
  return (ultimo ? `${primeiro}.${ultimo}` : primeiro) || "irmao";
}

async function gerarLoginUnico(conn: PoolConnection, nomeCivil: string): Promise<string> {
  const base = gerarLoginBase(nomeCivil);
  let candidato = base;
  let sufixo = 2;
  while (true) {
    const [[existe]] = await conn.query<RowDataPacket[]>("SELECT 1 AS x FROM usuarios WHERE email = ? LIMIT 1", [
      candidato,
    ]);
    if (!existe) return candidato;
    candidato = `${base}${sufixo}`;
    sufixo++;
  }
}

export type UsuarioAdmin = {
  id: string;
  email: string;
  nome_completo: string | null;
  papeis: Papel[];
  irmao: { id: string; nome_civil: string } | null;
};

// Só admin — tela de gestão de usuários (evita precisar mexer direto no banco).
export const listarUsuarios = createServerFn({ method: "GET" }).handler(async (): Promise<UsuarioAdmin[]> => {
  return comPapel(["admin"], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT u.id, u.email, u.nome_completo,
              GROUP_CONCAT(DISTINCT up.papel) AS papeis,
              i.id AS irmao_id, i.nome_civil AS irmao_nome
       FROM usuarios u
       LEFT JOIN usuarios_papeis up ON up.usuario_id = u.id
       LEFT JOIN irmaos i ON i.usuario_id = u.id
       GROUP BY u.id, u.email, u.nome_completo, i.id, i.nome_civil
       ORDER BY u.email`,
    );
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      nome_completo: r.nome_completo,
      papeis: (r.papeis ? String(r.papeis).split(",") : []) as Papel[],
      irmao: r.irmao_id ? { id: r.irmao_id, nome_civil: r.irmao_nome } : null,
    }));
  });
});

export type IrmaoSemAcesso = { id: string; nome_civil: string; loginSugerido: string };

// loginSugerido é só uma prévia (não reserva nada) — a geração definitiva
// acontece de novo no momento de criar, pra evitar corrida entre dois
// irmãos com o mesmo nome sendo criados ao mesmo tempo.
export const listarIrmaosSemAcesso = createServerFn({ method: "GET" }).handler(
  async (): Promise<IrmaoSemAcesso[]> => {
    return comPapel(["admin"], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_civil FROM irmaos WHERE usuario_id IS NULL ORDER BY nome_civil",
      );
      const comLogin = await Promise.all(
        rows.map(async (r) => ({
          id: r.id as string,
          nome_civil: r.nome_civil as string,
          loginSugerido: await gerarLoginUnico(conn, r.nome_civil),
        })),
      );
      return comLogin;
    });
  },
);

// Cria login para um irmão específico a partir do nome civil (nome.sobrenome)
// e a senha padrão (decisão explícita do cliente — ver histórico da
// conversa: login por nome em vez de e-mail, "123" fixo por enquanto,
// fase de testes — trocar para algo mais rígido depois).
export const criarAcessoIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ usuarioId: string; login: string }> => {
    return comPapel(["admin"], async (conn) => {
      const [[irmao]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_civil, usuario_id FROM irmaos WHERE id = ?",
        [data.irmaoId],
      );
      if (!irmao) throw new Error("Irmão não encontrado.");
      if (irmao.usuario_id) throw new Error("Este irmão já tem um usuário vinculado.");

      const login = await gerarLoginUnico(conn, irmao.nome_civil);
      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      try {
        await conn.query("CALL criar_usuario(?, ?, ?, @novo_id)", [login, senhaHash, irmao.nome_civil]);
      } catch (err: any) {
        throw new Error(err.sqlMessage || err.message);
      }
      const [[{ novo_id }]] = await conn.query<RowDataPacket[]>("SELECT @novo_id AS novo_id");
      await conn.query("UPDATE irmaos SET usuario_id = ? WHERE id = ?", [novo_id, data.irmaoId]);
      return { usuarioId: novo_id as string, login };
    });
  });

export type RelatorioAcessosLote = {
  criados: { nome: string; login: string }[];
  falhas: { nome: string; motivo: string }[];
};

// Mesma lógica de criarAcessoIrmao, em lote, para todo irmão ainda sem
// usuario_id — é a ação que substitui ter que rodar SQL manual no phpMyAdmin.
export const criarAcessosEmLote = createServerFn({ method: "POST" }).handler(
  async (): Promise<RelatorioAcessosLote> => {
    return comPapel(["admin"], async (conn) => {
      const [irmaos] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_civil FROM irmaos WHERE usuario_id IS NULL ORDER BY nome_civil",
      );
      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      const criados: { nome: string; login: string }[] = [];
      const falhas: { nome: string; motivo: string }[] = [];

      for (const irmao of irmaos) {
        try {
          const login = await gerarLoginUnico(conn, irmao.nome_civil);
          await conn.query("CALL criar_usuario(?, ?, ?, @novo_id)", [login, senhaHash, irmao.nome_civil]);
          const [[{ novo_id }]] = await conn.query<RowDataPacket[]>("SELECT @novo_id AS novo_id");
          await conn.query("UPDATE irmaos SET usuario_id = ? WHERE id = ?", [novo_id, irmao.id]);
          criados.push({ nome: irmao.nome_civil, login });
        } catch (err: any) {
          falhas.push({ nome: irmao.nome_civil, motivo: err.sqlMessage || err.message });
        }
      }
      return { criados, falhas };
    });
  },
);

const TODOS_PAPEIS: Papel[] = ["admin", "tesoureiro", "secretario", "irmao"];

const papeisSchema = z.object({
  usuarioId: z.string().uuid(),
  papeis: z.array(z.enum(["admin", "tesoureiro", "secretario", "irmao"])).min(1),
});

export const atualizarPapeisUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) => papeisSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioIdAtual) => {
      if (data.usuarioId === usuarioIdAtual && !data.papeis.includes("admin")) {
        throw new Error("Você não pode remover seu próprio papel de administrador.");
      }
      await conn.query("DELETE FROM usuarios_papeis WHERE usuario_id = ?", [data.usuarioId]);
      for (const papel of data.papeis) {
        await conn.query("INSERT INTO usuarios_papeis (usuario_id, papel) VALUES (?, ?)", [
          data.usuarioId,
          papel,
        ]);
      }
    });
  });

export { TODOS_PAPEIS };

const redefinirSenhaSchema = z.object({ usuarioId: z.string().uuid(), novaSenha: z.string().min(3) });

export const redefinirSenhaUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) => redefinirSenhaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn) => {
      const hash = await bcrypt.hash(data.novaSenha, 10);
      await conn.query("UPDATE usuarios SET senha_hash = ? WHERE id = ?", [hash, data.usuarioId]);
    });
  });
