import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { comPapel } from "./authz";
import { registrarAuditoria } from "./auditoria";

// Parâmetros de e-mail (SMTP) por loja — issue #352.
//
// Só admin da própria loja edita: é configuração de infraestrutura da loja,
// não de tesouraria. A alternativa (restringir ao super-admin da plataforma)
// daria mais controle, mas criaria dependência de suporte a cada cliente novo.
const PAPEIS = ["admin"];

export type ParametrosEmail = {
  host: string;
  porta: number;
  usuario: string;
  remetenteNome: string;
  remetenteEmail: string;
  // A senha nunca volta pro navegador — só se existe uma guardada.
  senhaConfigurada: boolean;
  // De onde sai o e-mail hoje: da configuração desta loja ou das variáveis de
  // ambiente do servidor (o SMTP padrão da plataforma).
  origem: "loja" | "servidor" | "nenhuma";
};

export const obterParametrosEmail = createServerFn({ method: "GET" }).handler(
  async (): Promise<ParametrosEmail> =>
    comPapel(PAPEIS, async (conn, _usuarioId, lojaId) => {
      const [[linha]] = await conn.query<RowDataPacket[]>(
        `SELECT host, porta, usuario, senha_cifrada, remetente_nome, remetente_email
           FROM loja_parametros_email WHERE loja_id = ?`,
        [lojaId],
      );
      if (linha) {
        const { decifrar } = await import("./cripto");
        return {
          host: linha.host as string,
          porta: Number(linha.porta),
          usuario: linha.usuario as string,
          remetenteNome: (linha.remetente_nome as string) ?? "",
          remetenteEmail: (linha.remetente_email as string) ?? "",
          // Senha ilegível (SESSION_SECRET trocado desde que foi salva) conta
          // como não configurada: a tela pede de novo em vez de fingir que
          // está tudo certo e falhar no envio.
          senhaConfigurada: decifrar(linha.senha_cifrada as string) !== null,
          origem: "loja",
        };
      }
      // Sem linha, o envio usa o SMTP do servidor — a tela mostra isso em vez
      // de campos vazios sem explicação.
      const temServidor = Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD,
      );
      return {
        host: "",
        porta: 465,
        usuario: "",
        remetenteNome: "",
        remetenteEmail: "",
        senhaConfigurada: false,
        origem: temServidor ? "servidor" : "nenhuma",
      };
    }),
);

const salvarSchema = z.object({
  host: z.string().trim().min(1, "Informe o servidor de saída (SMTP)."),
  porta: z.number().int().min(1).max(65535),
  // Login SMTP é o endereço completo: guardar só a parte antes do @ foi a
  // causa do "535 authentication failed" que custou horas de investigação.
  usuario: z.string().trim().email("O usuário é o endereço de e-mail completo."),
  // Vazio = manter a senha já gravada (a tela nunca recebe a atual de volta).
  senha: z.string().default(""),
  remetenteNome: z.string().trim().max(255).default(""),
  remetenteEmail: z.union([z.string().trim().email(), z.literal("")]).default(""),
});

export const salvarParametrosEmail = createServerFn({ method: "POST" })
  .validator((d: unknown) => salvarSchema.parse(d))
  .handler(async ({ data }): Promise<void> =>
    comPapel(PAPEIS, async (conn, usuarioId, lojaId) => {
      const { cifrar } = await import("./cripto");
      const [[atual]] = await conn.query<RowDataPacket[]>(
        "SELECT host, porta, usuario, senha_cifrada, remetente_nome, remetente_email FROM loja_parametros_email WHERE loja_id = ?",
        [lojaId],
      );
      const senhaCifrada = data.senha ? cifrar(data.senha) : (atual?.senha_cifrada as string);
      if (!senhaCifrada) throw new Error("Informe a senha da caixa de e-mail.");

      await conn.query(
        `INSERT INTO loja_parametros_email
           (loja_id, host, porta, usuario, senha_cifrada, remetente_nome, remetente_email, atualizado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           host = VALUES(host), porta = VALUES(porta), usuario = VALUES(usuario),
           senha_cifrada = VALUES(senha_cifrada), remetente_nome = VALUES(remetente_nome),
           remetente_email = VALUES(remetente_email), atualizado_por = VALUES(atualizado_por)`,
        [
          lojaId,
          data.host,
          data.porta,
          data.usuario,
          senhaCifrada,
          data.remetenteNome || null,
          data.remetenteEmail || null,
          usuarioId,
        ],
      );

      // Auditoria sem a senha, nem a cifrada: o registro de auditoria é lido
      // por mais gente do que a configuração em si.
      const semSenha = (linha: RowDataPacket | undefined) =>
        linha
          ? {
              host: linha.host,
              porta: linha.porta,
              usuario: linha.usuario,
              remetente_nome: linha.remetente_nome,
              remetente_email: linha.remetente_email,
            }
          : null;
      await registrarAuditoria(
        conn,
        usuarioId,
        atual ? "editar" : "criar",
        "parametros_email",
        lojaId,
        semSenha(atual),
        {
          host: data.host,
          porta: data.porta,
          usuario: data.usuario,
          remetente_nome: data.remetenteNome || null,
          remetente_email: data.remetenteEmail || null,
          senha_alterada: Boolean(data.senha),
        },
      );
    }),
  );

export const enviarEmailDeTeste = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ destinatario: string }> =>
    comPapel(PAPEIS, async (conn, usuarioId, lojaId) => {
      const [[usuario]] = await conn.query<RowDataPacket[]>(
        "SELECT email FROM usuarios WHERE id = ?",
        [usuarioId],
      );
      const destinatario = usuario?.email as string | undefined;
      if (!destinatario) throw new Error("Seu usuário não tem e-mail cadastrado.");

      const { configSmtpDaLoja, transporterDe } = await import("../email-dispatch");
      const config = await configSmtpDaLoja(conn, lojaId);
      if (!config) {
        throw new Error("Preencha e salve os parâmetros antes de testar.");
      }
      // Envio real, não só verificação de credencial: só a mensagem chegando
      // na caixa prova que o caminho inteiro funciona. Sem fila e sem anexo,
      // para isolar a configuração do resto do fluxo.
      await transporterDe(config).sendMail({
        from: config.remetente,
        to: destinatario,
        subject: "Teste de configuração de e-mail — SGLFM",
        text:
          "Se você recebeu esta mensagem, o envio de e-mail da sua Loja está configurado corretamente.\n\n" +
          `Servidor: ${config.host}:${config.porta}\nUsuário: ${config.usuario}\n` +
          `Origem da configuração: ${config.origem === "loja" ? "parâmetros da Loja" : "padrão da plataforma"}`,
      });
      return { destinatario };
    }),
);
