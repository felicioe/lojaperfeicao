import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comPapel, ehAlvoSuperAdmin } from "./authz";
import type { Papel } from "./auth";
import { registrarAuditoria } from "./auditoria";

// O mysql2 lança erros que carregam `sqlMessage` (a mensagem do servidor,
// mais específica que a genérica do driver). O tipo Error do JS não conhece
// esse campo, e o código pegava `err: any` só para alcançá-lo. Este helper
// resolve o acesso sem abrir mão da tipagem no resto do bloco.
function mensagemDeErroSql(err: unknown): string {
  if (typeof err === "object" && err !== null && "sqlMessage" in err) {
    const sqlMessage = (err as { sqlMessage?: unknown }).sqlMessage;
    if (typeof sqlMessage === "string" && sqlMessage) return sqlMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

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

/**
 * Login livre DENTRO da Loja (issue #344).
 *
 * A unicidade passou a ser por Loja na migração 0092 — `joao.silva` da
 * Adonhiram e `joao.silva` de outra Loja são contas distintas. Checar global,
 * como era antes, produziria `joao.silva2` numa Loja onde `joao.silva` está
 * livre: sufixo feio, e a cada Loja nova o problema piora.
 */
async function gerarLoginUnico(conn: PoolConnection, nomeCivil: string): Promise<string> {
  const base = gerarLoginBase(nomeCivil);
  let candidato = base;
  let sufixo = 2;
  while (true) {
    const [[existe]] = await conn.query<RowDataPacket[]>(
      "SELECT 1 AS x FROM usuarios WHERE email = ? AND loja_id = @current_loja_id LIMIT 1",
      [candidato],
    );
    if (!existe) return candidato;
    candidato = `${base}${sufixo}`;
    sufixo++;
  }
}

/**
 * Cria a conta na Loja informada, no lugar da procedure `criar_usuario` (0006).
 *
 * A procedure é anterior ao multi-tenant e faz duas coisas erradas hoje: o
 * INSERT não informa `loja_id`, então a conta cai no DEFAULT de transição da
 * 0092 — a Adonhiram —, e o papel sai de uma contagem global de
 * usuarios_papeis, que numa base com dados é sempre 'irmao'. Juntas, elas fariam o
 * admin de uma Loja criar acessos que nascem na Loja de outra pessoa: escrita
 * cruzada, não só leitura. Reescrever a procedure é a issue #349; aqui a loja
 * e o papel são explícitos, que é o que a #350 vai exigir de todo INSERT.
 *
 * O erro de e-mail duplicado é traduzido para a mesma frase que a procedure
 * emitia, porque a tela já a mostra.
 */
async function criarUsuarioNaLoja(
  conn: PoolConnection,
  lojaId: string,
  dados: { login: string; senhaHash: string; nomeCompleto: string },
): Promise<string> {
  const [[jaExiste]] = await conn.query<RowDataPacket[]>(
    "SELECT 1 AS x FROM usuarios WHERE email = ? AND loja_id = ? LIMIT 1",
    [dados.login, lojaId],
  );
  if (jaExiste) throw new Error("Já existe uma conta com este e-mail.");

  const novoId = randomUUID();
  await conn.query(
    "INSERT INTO usuarios (id, loja_id, email, senha_hash, nome_completo) VALUES (?, ?, ?, ?, ?)",
    [novoId, lojaId, dados.login, dados.senhaHash, dados.nomeCompleto],
  );
  await conn.query(
    "INSERT INTO usuarios_papeis (loja_id, usuario_id, papel) VALUES (?, ?, 'irmao')",
    [lojaId, novoId],
  );
  return novoId;
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
       LEFT JOIN usuarios_papeis up ON up.usuario_id = u.id AND up.loja_id = @current_loja_id
       LEFT JOIN irmaos i ON i.usuario_id = u.id AND i.loja_id = @current_loja_id
       WHERE u.loja_id = @current_loja_id
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
        "SELECT id, nome_civil FROM irmaos WHERE usuario_id IS NULL AND loja_id = @current_loja_id ORDER BY nome_civil",
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
    return comPapel(["admin"], async (conn, usuarioIdAtual, lojaId) => {
      const [[irmao]] = await conn.query<RowDataPacket[]>(
        "SELECT nome_civil, usuario_id FROM irmaos WHERE id = ? AND loja_id = @current_loja_id",
        [data.irmaoId],
      );
      if (!irmao) throw new Error("Irmão não encontrado.");
      if (irmao.usuario_id) throw new Error("Este irmão já tem um usuário vinculado.");

      const login = await gerarLoginUnico(conn, irmao.nome_civil);
      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      let novoId: string;
      try {
        novoId = await criarUsuarioNaLoja(conn, lojaId, {
          login,
          senhaHash,
          nomeCompleto: irmao.nome_civil,
        });
      } catch (err) {
        throw new Error(mensagemDeErroSql(err));
      }
      await conn.query(
        "UPDATE irmaos SET usuario_id = ? WHERE id = ? AND loja_id = @current_loja_id",
        [novoId, data.irmaoId],
      );
      if (data.obrigarTrocaSenha) {
        await conn.query(
          "UPDATE usuarios SET deve_trocar_senha = TRUE WHERE id = ? AND loja_id = @current_loja_id",
          [novoId],
        );
      }
      await registrarAuditoria(conn, usuarioIdAtual, "criar_acesso", "usuario", novoId, null, {
        login,
        nome_civil: irmao.nome_civil,
        obrigar_troca_senha: data.obrigarTrocaSenha,
      });
      if (data.enviarBoasVindas) {
        const { enviarEmailBoasVindas } = await import("../email-dispatch");
        enviarEmailBoasVindas(novoId, lojaId).catch((err) =>
          console.error("Falha ao enviar e-mail de boas-vindas:", err),
        );
      }
      return { usuarioId: novoId, login };
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
    return comPapel(["admin"], async (conn, usuarioIdAtual, lojaId) => {
      const [irmaos] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_civil FROM irmaos WHERE usuario_id IS NULL AND loja_id = @current_loja_id ORDER BY nome_civil",
      );
      const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);
      const criados: { nome: string; login: string }[] = [];
      const falhas: { nome: string; motivo: string }[] = [];

      for (const irmao of irmaos) {
        try {
          const login = await gerarLoginUnico(conn, irmao.nome_civil);
          const novoId = await criarUsuarioNaLoja(conn, lojaId, {
            login,
            senhaHash,
            nomeCompleto: irmao.nome_civil,
          });
          await conn.query(
            "UPDATE irmaos SET usuario_id = ? WHERE id = ? AND loja_id = @current_loja_id",
            [novoId, irmao.id],
          );
          if (data.obrigarTrocaSenha) {
            await conn.query(
              "UPDATE usuarios SET deve_trocar_senha = TRUE WHERE id = ? AND loja_id = @current_loja_id",
              [novoId],
            );
          }
          await registrarAuditoria(conn, usuarioIdAtual, "criar_acesso", "usuario", novoId, null, {
            login,
            nome_civil: irmao.nome_civil,
            obrigar_troca_senha: data.obrigarTrocaSenha,
          });
          if (data.enviarBoasVindas) {
            const { enviarEmailBoasVindas } = await import("../email-dispatch");
            enviarEmailBoasVindas(novoId, lojaId).catch((err) =>
              console.error("Falha ao enviar e-mail de boas-vindas:", err),
            );
          }
          criados.push({ nome: irmao.nome_civil, login });
        } catch (err) {
          falhas.push({ nome: irmao.nome_civil, motivo: mensagemDeErroSql(err) });
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
    return comPapel(["admin"], async (conn, usuarioIdAtual, lojaId) => {
      if (data.usuarioId === usuarioIdAtual && !data.papeis.includes("admin")) {
        throw new Error("Você não pode remover seu próprio papel de administrador.");
      }
      if (await ehAlvoSuperAdmin(conn, data.usuarioId)) {
        throw new Error("Não é possível alterar os papéis do super-admin da plataforma por aqui.");
      }
      // O id vem da requisição: sem confirmar que pertence a esta Loja, um
      // admin descobrindo o UUID de um usuário de OUTRA Loja conseguia
      // conceder papel a ele por aqui (achado crítico da auditoria — ver
      // 0106_has_role_escopado_por_loja.sql para a correção de raiz em
      // has_role(), esta é a checagem de borda complementar).
      const [[alvo]] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM usuarios WHERE id = ? AND loja_id = @current_loja_id",
        [data.usuarioId],
      );
      if (!alvo) throw new Error("Usuário não encontrado nesta loja.");
      const [antes] = await conn.query<RowDataPacket[]>(
        "SELECT papel FROM usuarios_papeis WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [data.usuarioId],
      );
      await conn.query(
        "DELETE FROM usuarios_papeis WHERE usuario_id = ? AND loja_id = @current_loja_id",
        [data.usuarioId],
      );
      for (const papel of data.papeis) {
        await conn.query(
          "INSERT INTO usuarios_papeis (loja_id, usuario_id, papel) VALUES (?, ?, ?)",
          [lojaId, data.usuarioId, papel],
        );
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
      if (await ehAlvoSuperAdmin(conn, data.usuarioId)) {
        throw new Error("Não é possível ativar/inativar o super-admin da plataforma por aqui.");
      }
      await conn.query(
        "UPDATE usuarios SET ativo = ? WHERE id = ? AND loja_id = @current_loja_id",
        [data.ativo, data.usuarioId],
      );
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
      if (await ehAlvoSuperAdmin(conn, data.usuarioId)) {
        throw new Error("Não é possível redefinir a senha do super-admin da plataforma por aqui.");
      }
      const hash = await bcrypt.hash(data.novaSenha, 10);
      await conn.query(
        "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = ?, senha_alterada_em = NOW() WHERE id = ? AND loja_id = @current_loja_id",
        [hash, data.obrigarTrocaSenha, data.usuarioId],
      );
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
