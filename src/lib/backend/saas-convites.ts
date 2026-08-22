import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { comSuperAdmin } from "./authz";
import { withUserConnection } from "./db";
import { registrarAuditoriaPlataforma } from "./auditoria";
import { criarSessao } from "./session";
import { carregarUsuarioComPapeis, type UsuarioSessao } from "./usuario-sessao";

// Convite do primeiro administrador de cada Loja (issue #339, parte 2).
//
// É a peça que faltava para uma Loja recém-cadastrada sair do papel: a parte 1
// cria a Loja vazia, e sem isto aqui não havia como criar o primeiro `admin`
// dela sem INSERT à mão no banco.
//
// A divisão de responsabilidade é a mesma do resto da área de plataforma: o
// super-admin diz *quem* administra *qual* Loja, e nada mais — ele não define
// senha, não entra na Loja e não vê nada de dentro dela. Quem recebe o convite
// escolhe a própria senha e é a primeira pessoa a entrar.
//
// Duas funções deste arquivo (verificarConvite/aceitarConvite) rodam SEM
// sessão, por definição: quem está aceitando ainda não tem conta. O que as
// autoriza é o token do link — 256 bits de aleatoriedade, guardado só como
// SHA-256 (ver migração 0095).

/** Quanto tempo o link do convite vale. Curto o bastante para que um e-mail
 * esquecido numa caixa de entrada não vire uma porta aberta indefinidamente,
 * longo o bastante para caber uma semana de férias de quem foi convidado. */
const DIAS_VALIDADE = 7;

export type SituacaoConvite = "pendente" | "aceito" | "revogado" | "expirado";

export type ConviteResumo = {
  id: string;
  email: string;
  nome_completo: string;
  situacao: SituacaoConvite;
  expira_em: string;
  criado_em: string;
  aceito_em: string | null;
};

/** `expirado` não é coluna: é o relógio comparado com `expira_em`. Guardar o
 * estado gravado daria margem a divergir do relógio (um convite "pendente" no
 * banco e vencido de fato), e ninguém roda um job só para virar essa chave. */
export const SQL_SITUACAO_CONVITE = `CASE
     WHEN c.aceito_em IS NOT NULL THEN 'aceito'
     WHEN c.revogado_em IS NOT NULL THEN 'revogado'
     WHEN c.expira_em < NOW() THEN 'expirado'
     ELSE 'pendente'
   END`;

function gerarToken(): { token: string; hash: string } {
  // 32 bytes = 256 bits. base64url para caber numa URL sem escape.
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDoToken(token) };
}

function hashDoToken(token: string): string {
  // SHA-256 sem sal e sem custo: diferente de senha, o token não é escolhido
  // por gente nem tem entropia baixa — não há dicionário a proteger, e o
  // aceite precisa achar a linha por igualdade de hash (por isso um índice
  // UNIQUE, e não um bcrypt por linha).
  return createHash("sha256").update(token).digest("hex");
}

function linkDoConvite(token: string): string {
  // Mesma origem que a fila de e-mail usa nos outros envios. Em produção vem
  // do painel Node da Hostinger (PUBLIC_ORIGIN); em desenvolvimento, do Vite.
  const origem = process.env.PUBLIC_ORIGIN || "http://localhost:5173";
  return `${origem}/convite/${token}`;
}

/**
 * Recusa convidar um e-mail que já é login em qualquer Loja.
 *
 * Na mesma Loja o motivo é óbvio (a conta já existe). Em OUTRA Loja o motivo é
 * menos óbvio e mais importante: desde a 0092 o e-mail é único por Loja, então
 * o banco aceitaria as duas contas — mas, enquanto a resolução por subdomínio
 * (issue #338) não existir, o login não tem como saber em qual Loja a pessoa
 * quer entrar e `usuarioUnicoParaLogin` (login-loja.ts) recusa as duas. O
 * resultado seria um convite aceito com sucesso que tranca a pessoa fora das
 * duas Lojas. Melhor recusar aqui, com o motivo na tela, do que produzir esse
 * estado.
 */
async function recusarEmailJaEmUso(
  conn: PoolConnection,
  lojaId: string,
  email: string,
): Promise<void> {
  const [[naMesma]] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM usuarios WHERE email = ? AND loja_id = ?",
    [email, lojaId],
  );
  if (naMesma) throw new Error("Já existe uma conta com este e-mail nesta Loja.");

  const [[emOutra]] = await conn.query<RowDataPacket[]>(
    `SELECT l.nome FROM usuarios u
       JOIN lojas l ON l.id = u.loja_id
      WHERE u.email = ? AND u.loja_id <> ?
      LIMIT 1`,
    [email, lojaId],
  );
  if (emOutra) {
    throw new Error(
      `Este e-mail já é login na Loja "${emOutra.nome as string}". ` +
        "Enquanto cada Loja não tiver endereço próprio de acesso, o mesmo e-mail em duas Lojas impede o login nas duas. Convide com outro e-mail.",
    );
  }
}

async function lojaAtivaOuErro(
  conn: PoolConnection,
  lojaId: string,
): Promise<{ id: string; nome: string }> {
  const [[loja]] = await conn.query<RowDataPacket[]>(
    "SELECT id, nome, ativa FROM lojas WHERE id = ?",
    [lojaId],
  );
  if (!loja) throw new Error("Loja não encontrada.");
  if (!loja.ativa) {
    throw new Error("Esta Loja está suspensa. Reative-a antes de convidar o administrador.");
  }
  return { id: loja.id as string, nome: loja.nome as string };
}

export type ResultadoConvite = {
  /** O link é devolvido de propósito, mesmo quando o e-mail sai: sem SMTP
   * configurado — que é exatamente a situação de uma Loja recém-cadastrada — o
   * envio falha e o super-admin ainda precisa de um jeito de entregar o
   * convite. Sem isto, uma falha de SMTP travaria o cadastro da Loja inteira. */
  link: string;
  enviado: boolean;
  erroEnvio: string | null;
};

async function enviarConvite(params: {
  lojaId: string;
  lojaNome: string;
  email: string;
  nomeCompleto: string;
  token: string;
  expiraEm: string;
  criadoPor: string;
}): Promise<ResultadoConvite> {
  const link = linkDoConvite(params.token);
  try {
    // import() dinâmico pelo mesmo motivo do resto do código: email-dispatch
    // puxa nodemailer e o pool MySQL, e este arquivo é importado por uma rota.
    const { enviarEmailConviteAdminLoja } = await import("../email-dispatch");
    const resultado = await enviarEmailConviteAdminLoja({
      lojaId: params.lojaId,
      lojaNome: params.lojaNome,
      destinatario: params.email,
      nomeCompleto: params.nomeCompleto,
      link,
      expiraEm: params.expiraEm,
      criadoPor: params.criadoPor,
    });
    return { link, enviado: resultado.enviado, erroEnvio: resultado.erro };
  } catch (err) {
    // Falha de envio não desfaz o convite: a linha já está gravada e o link
    // devolvido continua válido. Só o e-mail falhou.
    return { link, enviado: false, erroEnvio: err instanceof Error ? err.message : String(err) };
  }
}

const convidarSchema = z.object({
  lojaId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  nomeCompleto: z.string().trim().min(1, "Informe o nome de quem vai administrar a Loja."),
});

export const convidarAdminLoja = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const r = convidarSchema.safeParse(d);
    // Mesmo motivo de saas-lojas.ts: a `message` de um ZodError é o JSON
    // inteiro do erro, e a tela mostra err.message.
    if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join(" "));
    return r.data;
  })
  .handler(async ({ data }): Promise<ResultadoConvite> =>
    comSuperAdmin(async (conn, usuarioId) => {
      const loja = await lojaAtivaOuErro(conn, data.lojaId);
      await recusarEmailJaEmUso(conn, data.lojaId, data.email);

      const { token, hash } = gerarToken();
      const id = randomUUID();

      await conn.beginTransaction();
      try {
        // Um convite pendente por Loja: emitir um novo revoga o anterior, em
        // vez de deixar dois links válidos para a mesma vaga. Sem isto, um
        // convite mandado para o e-mail errado continuaria aceitável por
        // quem o recebeu por engano, mesmo depois de o certo ser enviado.
        await conn.query(
          `UPDATE loja_convites
                SET revogado_em = NOW()
              WHERE loja_id = ? AND aceito_em IS NULL AND revogado_em IS NULL`,
          [data.lojaId],
        );
        await conn.query(
          `INSERT INTO loja_convites
               (id, loja_id, email, nome_completo, token_hash, expira_em, criado_por)
             VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)`,
          [id, data.lojaId, data.email, data.nomeCompleto, hash, DIAS_VALIDADE, usuarioId],
        );
        await registrarAuditoriaPlataforma(
          conn,
          usuarioId,
          "convidar_admin_loja",
          data.lojaId,
          null,
          {
            email: data.email,
            nome_completo: data.nomeCompleto,
            dias_validade: DIAS_VALIDADE,
          },
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }

      const [[linha]] = await conn.query<RowDataPacket[]>(
        "SELECT expira_em FROM loja_convites WHERE id = ?",
        [id],
      );
      return enviarConvite({
        lojaId: loja.id,
        lojaNome: loja.nome,
        email: data.email,
        nomeCompleto: data.nomeCompleto,
        token,
        expiraEm: String(linha.expira_em),
        criadoPor: usuarioId,
      });
    }),
  );

const conviteIdSchema = z.object({ conviteId: z.string().uuid() });

/**
 * Reenvia o convite com um token NOVO, invalidando o anterior.
 *
 * Reenviar o mesmo token seria mais simples, mas o motivo comum de reenvio é
 * justamente o link ter ido parar onde não devia (e-mail errado, caixa
 * compartilhada, encaminhamento). Trocar o token faz do reenvio também um
 * conserto, não só uma segunda cópia.
 */
export const reenviarConviteLoja = createServerFn({ method: "POST" })
  .validator((d: unknown) => conviteIdSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoConvite> =>
    comSuperAdmin(async (conn, usuarioId) => {
      const [[convite]] = await conn.query<RowDataPacket[]>(
        `SELECT c.id, c.loja_id, c.email, c.nome_completo, c.aceito_em, c.revogado_em, l.nome AS loja_nome
             FROM loja_convites c JOIN lojas l ON l.id = c.loja_id
            WHERE c.id = ?`,
        [data.conviteId],
      );
      if (!convite) throw new Error("Convite não encontrado.");
      if (convite.aceito_em) throw new Error("Este convite já foi aceito.");
      if (convite.revogado_em) throw new Error("Este convite foi revogado. Emita um novo.");
      const loja = await lojaAtivaOuErro(conn, convite.loja_id as string);
      // O e-mail pode ter virado conta entre o convite e o reenvio (por
      // outro caminho, ou por um convite anterior aceito); reconfere.
      await recusarEmailJaEmUso(conn, convite.loja_id as string, convite.email as string);

      const { token, hash } = gerarToken();
      await conn.query(
        `UPDATE loja_convites
              SET token_hash = ?, expira_em = DATE_ADD(NOW(), INTERVAL ? DAY)
            WHERE id = ?`,
        [hash, DIAS_VALIDADE, data.conviteId],
      );
      await registrarAuditoriaPlataforma(
        conn,
        usuarioId,
        "reenviar_convite_loja",
        convite.loja_id as string,
        null,
        { email: convite.email, dias_validade: DIAS_VALIDADE },
      );

      const [[linha]] = await conn.query<RowDataPacket[]>(
        "SELECT expira_em FROM loja_convites WHERE id = ?",
        [data.conviteId],
      );
      return enviarConvite({
        lojaId: loja.id,
        lojaNome: loja.nome,
        email: convite.email as string,
        nomeCompleto: convite.nome_completo as string,
        token,
        expiraEm: String(linha.expira_em),
        criadoPor: usuarioId,
      });
    }),
  );

export const revogarConviteLoja = createServerFn({ method: "POST" })
  .validator((d: unknown) => conviteIdSchema.parse(d))
  .handler(async ({ data }): Promise<void> =>
    comSuperAdmin(async (conn, usuarioId) => {
      const [[convite]] = await conn.query<RowDataPacket[]>(
        "SELECT loja_id, email, aceito_em, revogado_em FROM loja_convites WHERE id = ?",
        [data.conviteId],
      );
      if (!convite) throw new Error("Convite não encontrado.");
      if (convite.aceito_em) {
        throw new Error(
          "Este convite já foi aceito — revogá-lo não removeria o acesso. Inative o usuário dentro da Loja.",
        );
      }
      if (convite.revogado_em) return;

      await conn.query("UPDATE loja_convites SET revogado_em = NOW() WHERE id = ?", [
        data.conviteId,
      ]);
      await registrarAuditoriaPlataforma(
        conn,
        usuarioId,
        "revogar_convite_loja",
        convite.loja_id as string,
        null,
        { email: convite.email },
      );
    }),
  );

// ---------------------------------------------------------------------------
// Fluxo público: quem recebeu o convite ainda não tem conta.
// ---------------------------------------------------------------------------

const tokenSchema = z.object({ token: z.string().min(1) });

export type ConviteAberto = {
  lojaNome: string;
  email: string;
  nomeCompleto: string;
  expiraEm: string;
};

/** Motivo pelo qual um link de convite não serve mais — a tela mostra o texto
 * cru, então cada mensagem precisa dizer o que a pessoa faz a seguir. */
export class ConviteInvalidoError extends Error {}

async function buscarConvitePeloToken(conn: PoolConnection, token: string): Promise<RowDataPacket> {
  const [[convite]] = await conn.query<RowDataPacket[]>(
    `SELECT c.id, c.loja_id, c.email, c.nome_completo, c.expira_em,
            c.aceito_em, c.revogado_em, l.nome AS loja_nome, l.ativa AS loja_ativa
       FROM loja_convites c
       JOIN lojas l ON l.id = c.loja_id
      WHERE c.token_hash = ?`,
    [hashDoToken(token)],
  );
  // Token desconhecido e token revogado dão mensagens diferentes de propósito:
  // quem tem um link revogado precisa saber que deve pedir outro, e não que
  // "o link está errado" (e ficar procurando o e-mail certo).
  if (!convite) throw new ConviteInvalidoError("Convite não encontrado. Peça um novo link.");
  if (convite.aceito_em) {
    throw new ConviteInvalidoError("Este convite já foi usado. Entre com seu e-mail e senha.");
  }
  if (convite.revogado_em) {
    throw new ConviteInvalidoError("Este convite foi cancelado. Peça um novo link.");
  }
  if (new Date(convite.expira_em).getTime() < Date.now()) {
    throw new ConviteInvalidoError("Este convite expirou. Peça um novo link.");
  }
  if (!convite.loja_ativa) {
    throw new ConviteInvalidoError("Esta Loja está suspensa. Fale com quem lhe enviou o convite.");
  }
  return convite;
}

export const verificarConvite = createServerFn({ method: "POST" })
  .validator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<ConviteAberto> =>
    // Sem usuário: @current_loja_id fica NULL e nenhuma query escopada
    // funcionaria — todas as daqui nomeiam a loja explicitamente.
    withUserConnection(null, async (conn) => {
      const convite = await buscarConvitePeloToken(conn, data.token);
      return {
        lojaNome: convite.loja_nome as string,
        email: convite.email as string,
        nomeCompleto: convite.nome_completo as string,
        expiraEm: new Date(convite.expira_em).toISOString(),
      };
    }),
  );

const aceitarSchema = z.object({
  token: z.string().min(1),
  nomeCompleto: z.string().trim().min(1, "Informe seu nome."),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  aceiteLgpd: z.literal(true, { message: "É preciso aceitar a Política de Privacidade." }),
});

/**
 * Aceita o convite: cria a conta e devolve a sessão já aberta.
 *
 * Por que não passa pela procedure `criar_usuario` (0006), que é o caminho de
 * toda outra criação de conta: ela não conhece loja (a linha nasce com o
 * DEFAULT de transição da 0092, ou seja, na Adonhiram) e concede 'admin' só
 * quando `usuarios_papeis` está vazia — numa base com dados, o convidado
 * nasceria 'irmao' na Loja errada. Aqui a loja e o papel são explícitos, que é
 * exatamente o que a #350 vai exigir de todo INSERT.
 */
export const aceitarConvite = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const r = aceitarSchema.safeParse(d);
    if (!r.success) throw new Error(r.error.issues.map((i) => i.message).join(" "));
    return r.data;
  })
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const criado = await withUserConnection(null, async (conn) => {
      const senhaHash = await bcrypt.hash(data.senha, 10);
      await conn.beginTransaction();
      try {
        const convite = await buscarConvitePeloToken(conn, data.token);
        // FOR UPDATE dentro da transação: dois cliques no botão (ou duas abas)
        // criariam duas contas com o mesmo convite, e a segunda esbarraria no
        // UNIQUE de e-mail por loja com um erro de banco na cara do usuário.
        const [[travado]] = await conn.query<RowDataPacket[]>(
          "SELECT aceito_em FROM loja_convites WHERE id = ? FOR UPDATE",
          [convite.id],
        );
        if (travado.aceito_em) {
          throw new ConviteInvalidoError(
            "Este convite já foi usado. Entre com seu e-mail e senha.",
          );
        }
        await recusarEmailJaEmUso(conn, convite.loja_id as string, convite.email as string);

        const novoId = randomUUID();
        await conn.query(
          `INSERT INTO usuarios (id, loja_id, email, senha_hash, nome_completo, consentimento_lgpd_em)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [novoId, convite.loja_id, convite.email, senhaHash, data.nomeCompleto],
        );
        await conn.query(
          "INSERT INTO usuarios_papeis (loja_id, usuario_id, papel) VALUES (?, ?, 'admin')",
          [convite.loja_id, novoId],
        );
        await conn.query(
          "UPDATE loja_convites SET aceito_em = NOW(), usuario_id = ? WHERE id = ?",
          [novoId, convite.id],
        );
        // Auditoria da plataforma (loja_id NULL, como as demais ações de
        // super-admin): o convite é ato de plataforma, mesmo que o efeito —
        // uma conta nova — aconteça dentro da Loja. Sem usuário autenticado,
        // quem assina é o próprio convidado, que acabou de existir.
        await registrarAuditoriaPlataforma(
          conn,
          novoId,
          "aceitar_convite_loja",
          convite.loja_id as string,
          null,
          { email: convite.email },
        );
        await conn.commit();
        return {
          novoId,
          lojaId: convite.loja_id as string,
          lojaNome: convite.loja_nome as string,
          email: convite.email as string,
        };
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    });

    await criarSessao(criado.novoId);
    const sessao = await carregarUsuarioComPapeis(criado.novoId);
    if (!sessao) throw new Error("Conta criada, mas não foi possível abrir a sessão. Faça login.");

    // Melhor esforço (issue #340) — falha de e-mail não pode impedir a
    // pessoa de entrar: a conta e a sessão já existem nesse ponto.
    try {
      const { enviarEmailBoasVindasAdminLoja } = await import("../email-dispatch");
      await enviarEmailBoasVindasAdminLoja({
        lojaId: criado.lojaId,
        lojaNome: criado.lojaNome,
        destinatario: criado.email,
        nomeCompleto: data.nomeCompleto,
      });
    } catch (err) {
      console.error("Falha ao enviar e-mail de boas-vindas ao admin da Loja:", err);
    }

    return sessao;
  });
