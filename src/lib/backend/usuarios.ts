import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import type { Papel } from "./auth";
import { registrarAuditoria } from "./auditoria";

export const SENHA_PADRAO = "123";

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
    const [[existe]] = await conn.query<RowDataPacket[]>(
      "SELECT 1 AS x FROM usuarios WHERE email = ? LIMIT 1",
      [candidato],
    );
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
  ativo: boolean;
  deve_trocar_senha: boolean;
};

// Só admin — tela de gestão de usuários (evita precisar mexer direto no banco).
export const listarUsuarios = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsuarioAdmin[]> => {
    return comPapel(["admin"], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT u.id, u.email, u.nome_completo, u.ativo, u.deve_trocar_senha,
              GROUP_CONCAT(DISTINCT up.papel) AS papeis,
              i.id AS irmao_id, i.nome_civil AS irmao_nome
       FROM usuarios u
       LEFT JOIN usuarios_papeis up ON up.usuario_id = u.id
       LEFT JOIN irmaos i ON i.usuario_id = u.id
       GROUP BY u.id, u.email, u.nome_completo, u.ativo, u.deve_trocar_senha, i.id, i.nome_civil
       ORDER BY u.email`,
      );
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        nome_completo: r.nome_completo,
        papeis: (r.papeis ? String(r.papeis).split(",") : []) as Papel[],
        irmao: r.irmao_id ? { id: r.irmao_id, nome_civil: r.irmao_nome } : null,
        ativo: !!r.ativo,
        deve_trocar_senha: !!r.deve_trocar_senha,
      }));
    });
  },
);

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
const criarAcessoSchema = z.object({
  irmaoId: z.string().uuid(),
  // true (padrão) = senha "123" é temporária, barrada em /trocar-senha no
  // primeiro login. false = "fixar" — a pessoa fica com "123" até o admin
  // redefinir de novo (não recomendado, mas admin pode preferir em casos
  // pontuais).
  obrigarTrocaSenha: z.boolean().default(true),
  // Dispara e-mail de boas-vindas com login/senha (issue #105) — alternativa
  // opcional ao fluxo já existente de admin comunicar a senha manualmente,
  // decisão explícita do cliente (fica como alternativa, não substitui).
  enviarBoasVindas: z.boolean().default(false),
});

export const criarAcessoIrmao = createServerFn({ method: "POST" })
  .validator((d: unknown) => criarAcessoSchema.parse(d))
  .handler(async ({ data }): Promise<{ usuarioId: string; login: string }> => {
    return comPapel(["admin"], async (conn, usuarioIdAtual) => {
      const [[irmao]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_civil, usuario_id FROM irmaos WHERE id = ?",
        [data.irmaoId],
      );
      if (!irmao) throw new Error("Irmão não encontrado.");
      if (irmao.usuario_id) throw new Error("Este irmão já tem um usuário vinculado.");

      const login = await gerarLoginUnico(conn, irmao.nome_civil);
      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      try {
        await conn.query("CALL criar_usuario(?, ?, ?, @novo_id)", [
          login,
          senhaHash,
          irmao.nome_civil,
        ]);
      } catch (err: any) {
        throw new Error(err.sqlMessage || err.message);
      }
      const [[{ novo_id }]] = await conn.query<RowDataPacket[]>("SELECT @novo_id AS novo_id");
      await conn.query("UPDATE irmaos SET usuario_id = ? WHERE id = ?", [novo_id, data.irmaoId]);
      if (data.obrigarTrocaSenha) {
        await conn.query("UPDATE usuarios SET deve_trocar_senha = TRUE WHERE id = ?", [novo_id]);
      }
      await registrarAuditoria(conn, usuarioIdAtual, "criar_acesso", "usuario", novo_id, null, {
        login,
        nome_civil: irmao.nome_civil,
        obrigar_troca_senha: data.obrigarTrocaSenha,
      });
      if (data.enviarBoasVindas) {
        const { enviarEmailBoasVindas } = await import("../email-dispatch");
        enviarEmailBoasVindas(novo_id as string).catch((err) =>
          console.error("Falha ao enviar e-mail de boas-vindas:", err),
        );
      }
      return { usuarioId: novo_id as string, login };
    });
  });

export type RelatorioAcessosLote = {
  criados: { nome: string; login: string }[];
  falhas: { nome: string; motivo: string }[];
};

// Mesma lógica de criarAcessoIrmao, em lote, para todo irmão ainda sem
// usuario_id — é a ação que substitui ter que rodar SQL manual no phpMyAdmin.
export const criarAcessosEmLote = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        obrigarTrocaSenha: z.boolean().default(true),
        enviarBoasVindas: z.boolean().default(false),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<RelatorioAcessosLote> => {
    return comPapel(["admin"], async (conn, usuarioIdAtual) => {
      const [irmaos] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_civil FROM irmaos WHERE usuario_id IS NULL ORDER BY nome_civil",
      );
      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      const criados: { nome: string; login: string }[] = [];
      const falhas: { nome: string; motivo: string }[] = [];

      for (const irmao of irmaos) {
        try {
          const login = await gerarLoginUnico(conn, irmao.nome_civil);
          await conn.query("CALL criar_usuario(?, ?, ?, @novo_id)", [
            login,
            senhaHash,
            irmao.nome_civil,
          ]);
          const [[{ novo_id }]] = await conn.query<RowDataPacket[]>("SELECT @novo_id AS novo_id");
          await conn.query("UPDATE irmaos SET usuario_id = ? WHERE id = ?", [novo_id, irmao.id]);
          if (data.obrigarTrocaSenha) {
            await conn.query("UPDATE usuarios SET deve_trocar_senha = TRUE WHERE id = ?", [
              novo_id,
            ]);
          }
          await registrarAuditoria(conn, usuarioIdAtual, "criar_acesso", "usuario", novo_id, null, {
            login,
            nome_civil: irmao.nome_civil,
            obrigar_troca_senha: data.obrigarTrocaSenha,
          });
          if (data.enviarBoasVindas) {
            const { enviarEmailBoasVindas } = await import("../email-dispatch");
            enviarEmailBoasVindas(novo_id as string).catch((err) =>
              console.error("Falha ao enviar e-mail de boas-vindas:", err),
            );
          }
          criados.push({ nome: irmao.nome_civil, login });
        } catch (err: any) {
          falhas.push({ nome: irmao.nome_civil, motivo: err.sqlMessage || err.message });
        }
      }
      return { criados, falhas };
    });
  });

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
      const [antes] = await conn.query<RowDataPacket[]>(
        "SELECT papel FROM usuarios_papeis WHERE usuario_id = ?",
        [data.usuarioId],
      );
      await conn.query("DELETE FROM usuarios_papeis WHERE usuario_id = ?", [data.usuarioId]);
      for (const papel of data.papeis) {
        await conn.query("INSERT INTO usuarios_papeis (usuario_id, papel) VALUES (?, ?)", [
          data.usuarioId,
          papel,
        ]);
      }
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "atualizar_papeis",
        "usuario",
        data.usuarioId,
        { papeis: antes.map((p) => p.papel) },
        { papeis: data.papeis },
      );
    });
  });

const alternarAtivoSchema = z.object({
  usuarioId: z.string().uuid(),
  ativo: z.boolean(),
});

// Desabilita/reabilita um login sem excluir o usuário (mantém vínculo com
// irmão e o histórico de criado_por em lançamentos). O login.tsx bloqueia
// na hora de autenticar, e getSessao() derruba qualquer sessão já aberta.
export const alternarAtivoUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) => alternarAtivoSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioIdAtual) => {
      if (data.usuarioId === usuarioIdAtual && !data.ativo) {
        throw new Error("Você não pode inativar seu próprio usuário.");
      }
      await conn.query("UPDATE usuarios SET ativo = ? WHERE id = ?", [data.ativo, data.usuarioId]);
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        data.ativo ? "reativar_usuario" : "inativar_usuario",
        "usuario",
        data.usuarioId,
        { ativo: !data.ativo },
        { ativo: data.ativo },
      );
    });
  });

export { TODOS_PAPEIS };

const redefinirSenhaSchema = z.object({
  usuarioId: z.string().uuid(),
  novaSenha: z.string().min(3),
  // true = "obrigar troca no primeiro acesso" (senha vira temporária,
  // barrada em /trocar-senha). false = "fixar" (senha permanente).
  obrigarTrocaSenha: z.boolean(),
});

export const redefinirSenhaUsuario = createServerFn({ method: "POST" })
  .validator((d: unknown) => redefinirSenhaSchema.parse(d))
  .handler(async ({ data }) => {
    return comPapel(["admin"], async (conn, usuarioIdAtual) => {
      const hash = await bcrypt.hash(data.novaSenha, 10);
      await conn.query("UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = ? WHERE id = ?", [
        hash,
        data.obrigarTrocaSenha,
        data.usuarioId,
      ]);
      // nunca loga a senha em si, só o fato de ter sido redefinida.
      await registrarAuditoria(
        conn,
        usuarioIdAtual,
        "redefinir_senha",
        "usuario",
        data.usuarioId,
        null,
        { obrigar_troca_senha: data.obrigarTrocaSenha },
      );
    });
  });
