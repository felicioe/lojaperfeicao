import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { withUserConnection, withLojaConnection } from "./db";
import { registrarAuditoria } from "./auditoria";
import { verificarBloqueio, registrarTentativaFalha } from "./rate-limit";
import { usuarioUnicoParaLogin } from "./login-loja";
import { lojaIdParaFiltroDeLogin, slugDaRequisicaoAtual } from "./subdominio";

// Recuperação de senha self-service (issue #364) — antes disso, um irmão
// que esquecesse a senha só tinha o admin da Loja pra resetar manualmente.
//
// As duas funções públicas deste arquivo rodam SEM sessão, por definição:
// quem chega aqui ainda não conseguiu entrar. O que autoriza
// redefinirSenhaComToken é o token do link — mesmo padrão de
// `loja_convites` (migração 0095, saas-convites.ts): 256 bits de
// aleatoriedade, guardados só como SHA-256 (ver migração 0111).
//
// `usuarios.email` pode ser só um login gerado (nome.sobrenome, sem "@") —
// não é destinatário confiável por si só. O e-mail só sai quando existe um
// contato de verdade (emailContatoDoUsuario, email-dispatch.ts). Quando não
// existe — ou quando o login nem existe —, a resposta é a mesma genérica
// orientando a procurar o administrador: decisão explícita do usuário, pra
// não revelar quais logins existem no sistema (ver issue #364, "Decisões já
// resolvidas").

const VALIDADE_MINUTOS = 30;

function gerarToken(): { token: string; hash: string } {
  // 32 bytes = 256 bits. base64url para caber numa URL sem escape.
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDoToken(token) };
}

function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function linkDeRecuperacao(token: string): string {
  const origem = process.env.PUBLIC_ORIGIN || "http://localhost:5173";
  return `${origem}/recuperar-senha/${token}`;
}

const solicitarSchema = z.object({ login: z.string().min(1) });

export type SolicitarRecuperacaoResultado = { enviado: boolean };

export const solicitarRecuperacaoSenha = createServerFn({ method: "POST" })
  .validator((d: unknown) => solicitarSchema.parse(d))
  .handler(async ({ data }): Promise<SolicitarRecuperacaoResultado> => {
    // Bucket separado do rate-limit de login (issue #183): mesma tabela,
    // chave diferente — spam de pedido de recuperação não deve travar quem
    // só está tentando entrar com a senha errada, e vice-versa.
    const chaveBloqueio = `recuperar_senha:${data.login}`;
    await withUserConnection(null, (conn) => verificarBloqueio(conn, chaveBloqueio));
    await withUserConnection(null, (conn) => registrarTentativaFalha(conn, chaveBloqueio));

    const slug = slugDaRequisicaoAtual();
    const usuario = await withUserConnection(null, async (conn) => {
      const lojaId = await lojaIdParaFiltroDeLogin(conn, slug);
      const [rows] = await conn.query<RowDataPacket[]>(
        lojaId
          ? "SELECT id, loja_id, ativo FROM usuarios WHERE email = ? AND loja_id = ?"
          : "SELECT id, loja_id, ativo FROM usuarios WHERE email = ?",
        lojaId ? [data.login, lojaId] : [data.login],
      );
      // Ambíguo (mesmo login em mais de uma Loja, fora de um subdomínio
      // reconhecível) deixa passar como "não encontrado" aqui — ao contrário
      // do login em si, orientar a pessoa a "acessar pelo endereço da Loja"
      // recuperando senha já confirmaria que aquele login existe em alguma
      // Loja, o que a resposta genérica está evitando.
      try {
        return usuarioUnicoParaLogin(rows);
      } catch {
        return null;
      }
    });

    if (!usuario || !usuario.ativo) return { enviado: false };

    const { emailContatoDoUsuario, enviarEmailRecuperacaoSenha } =
      await import("../email-dispatch");
    const temContatoReal = await withLojaConnection(usuario.loja_id, (conn) =>
      emailContatoDoUsuario(conn, usuario.id),
    );
    if (!temContatoReal) return { enviado: false };

    const { token, hash } = gerarToken();
    await withLojaConnection(usuario.loja_id, (conn) =>
      conn.query(
        `INSERT INTO tokens_recuperacao_senha (loja_id, usuario_id, token_hash, expira_em)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [usuario.loja_id, usuario.id, hash, VALIDADE_MINUTOS],
      ),
    );
    const enviado = await enviarEmailRecuperacaoSenha(
      usuario.id,
      usuario.loja_id,
      linkDeRecuperacao(token),
      VALIDADE_MINUTOS,
    );
    return { enviado };
  });

/** Motivo pelo qual um link de recuperação não serve mais — a tela mostra o
 * texto cru, então cada mensagem precisa dizer o que a pessoa faz a seguir. */
export class TokenRecuperacaoInvalidoError extends Error {}

async function buscarTokenValido(conn: PoolConnection, token: string): Promise<RowDataPacket> {
  const [[linha]] = await conn.query<RowDataPacket[]>(
    `SELECT id, loja_id, usuario_id, expira_em, usado_em
       FROM tokens_recuperacao_senha WHERE token_hash = ?`,
    [hashDoToken(token)],
  );
  if (!linha) throw new TokenRecuperacaoInvalidoError("Link inválido. Solicite um novo.");
  if (linha.usado_em) {
    throw new TokenRecuperacaoInvalidoError("Este link já foi usado. Solicite um novo.");
  }
  if (new Date(linha.expira_em).getTime() < Date.now()) {
    throw new TokenRecuperacaoInvalidoError("Este link expirou. Solicite um novo.");
  }
  return linha;
}

const tokenSchema = z.object({ token: z.string().min(1) });

/** Confere o link antes de mostrar o formulário — mesmo papel de
 * verificarConvite (saas-convites.ts). */
export const verificarTokenRecuperacao = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> =>
    withUserConnection(null, async (conn) => {
      await buscarTokenValido(conn, data.token);
      return { ok: true };
    }),
  );

const redefinirSchema = z.object({
  token: z.string().min(1),
  novaSenha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export const redefinirSenhaComToken = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const r = redefinirSchema.safeParse(d);
    if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join(" "));
    return r.data;
  })
  .handler(async ({ data }): Promise<void> => {
    // Primeiro lookup sem loja (ainda não sabemos qual é) só pra achar a
    // linha do token e sua loja_id — a mutação em si acontece depois, já
    // dentro de withLojaConnection, pra registrarAuditoria gravar na Loja
    // certa (ela lê @current_loja_id da conexão).
    const linha = await withUserConnection(null, (conn) => buscarTokenValido(conn, data.token));

    await withLojaConnection(linha.loja_id, async (conn) => {
      await conn.beginTransaction();
      try {
        // FOR UPDATE + reconferência dentro da transação: mesmo motivo do
        // aceite de convite (saas-convites.ts) — duas abas com o mesmo link
        // não podem redefinir a senha duas vezes.
        const [[travada]] = await conn.query<RowDataPacket[]>(
          "SELECT usado_em, expira_em FROM tokens_recuperacao_senha WHERE id = ? FOR UPDATE",
          [linha.id],
        );
        if (!travada || travada.usado_em || new Date(travada.expira_em).getTime() < Date.now()) {
          throw new TokenRecuperacaoInvalidoError("Este link não é mais válido. Solicite um novo.");
        }
        const senhaHash = await bcrypt.hash(data.novaSenha, 10);
        // loja_id = @current_loja_id além do id: o usuario_id já veio de uma
        // linha de token pertencente a esta loja (buscarTokenValido), mas o
        // filtro extra é defesa em profundidade — o mesmo padrão que toda
        // outra escrita em `usuarios` já segue neste código.
        await conn.query(
          "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = FALSE, senha_alterada_em = NOW() WHERE id = ? AND loja_id = @current_loja_id",
          [senhaHash, linha.usuario_id],
        );
        await conn.query("UPDATE tokens_recuperacao_senha SET usado_em = NOW() WHERE id = ?", [
          linha.id,
        ]);
        // nunca loga a senha em si, só o fato de ter sido redefinida — mesmo
        // padrão de redefinirSenhaUsuario (usuarios.ts).
        await registrarAuditoria(
          conn,
          linha.usuario_id,
          "redefinir_senha_recuperacao",
          "usuario",
          linha.usuario_id,
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    });
  });
