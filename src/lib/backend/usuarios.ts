import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import type { Papel } from "./auth";

const SENHA_PADRAO = "123";

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

export type IrmaoSemAcesso = { id: string; nome_civil: string; email: string | null };

export const listarIrmaosSemAcesso = createServerFn({ method: "GET" }).handler(
  async (): Promise<IrmaoSemAcesso[]> => {
    return comPapel(["admin"], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_civil, email FROM irmaos WHERE usuario_id IS NULL ORDER BY nome_civil",
      );
      return rows as IrmaoSemAcesso[];
    });
  },
);

// Cria login para um irmão específico usando o e-mail já cadastrado e a
// senha padrão (decisão explícita do cliente — ver histórico da conversa:
// manter "123" fixo em vez de forçar troca no primeiro login).
export const criarAcessoIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ irmaoId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ usuarioId: string }> => {
    return comPapel(["admin"], async (conn) => {
      const [[irmao]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_civil, email, usuario_id FROM irmaos WHERE id = ?",
        [data.irmaoId],
      );
      if (!irmao) throw new Error("Irmão não encontrado.");
      if (irmao.usuario_id) throw new Error("Este irmão já tem um usuário vinculado.");
      if (!irmao.email) throw new Error("Este irmão não tem e-mail cadastrado — cadastre um e-mail antes de criar o acesso.");

      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      try {
        await conn.query("CALL criar_usuario(?, ?, ?, @novo_id)", [irmao.email, senhaHash, irmao.nome_civil]);
      } catch (err: any) {
        throw new Error(err.sqlMessage || err.message);
      }
      const [[{ novo_id }]] = await conn.query<RowDataPacket[]>("SELECT @novo_id AS novo_id");
      await conn.query("UPDATE irmaos SET usuario_id = ? WHERE id = ?", [novo_id, data.irmaoId]);
      return { usuarioId: novo_id as string };
    });
  });

export type RelatorioAcessosLote = {
  criados: string[];
  semEmail: string[];
  falhas: { nome: string; motivo: string }[];
};

// Mesma lógica de criarAcessoIrmao, em lote, para todo irmão ainda sem
// usuario_id — é a ação que substitui ter que rodar SQL manual no phpMyAdmin.
export const criarAcessosEmLote = createServerFn({ method: "POST" }).handler(
  async (): Promise<RelatorioAcessosLote> => {
    return comPapel(["admin"], async (conn) => {
      const [irmaos] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_civil, email FROM irmaos WHERE usuario_id IS NULL ORDER BY nome_civil",
      );
      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      const criados: string[] = [];
      const semEmail: string[] = [];
      const falhas: { nome: string; motivo: string }[] = [];

      for (const irmao of irmaos) {
        if (!irmao.email) {
          semEmail.push(irmao.nome_civil);
          continue;
        }
        try {
          await conn.query("CALL criar_usuario(?, ?, ?, @novo_id)", [irmao.email, senhaHash, irmao.nome_civil]);
          const [[{ novo_id }]] = await conn.query<RowDataPacket[]>("SELECT @novo_id AS novo_id");
          await conn.query("UPDATE irmaos SET usuario_id = ? WHERE id = ?", [novo_id, irmao.id]);
          criados.push(irmao.nome_civil);
        } catch (err: any) {
          falhas.push({ nome: irmao.nome_civil, motivo: err.sqlMessage || err.message });
        }
      }
      return { criados, semEmail, falhas };
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
