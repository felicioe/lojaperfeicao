import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { comSessao } from "./authz";
import { withUserConnection } from "./db";
import { usuarioUnicoParaLogin } from "./login-loja";
import { criarSessao, salvarDesafioWebauthn, consumirDesafioWebauthn } from "./session";
import { carregarUsuarioComPapeis, type UsuarioSessao } from "./usuario-sessao";
import { registrarAuditoria } from "./auditoria";

// Login/cadastro por passkey (Face ID, Touch ID, Windows Hello, chave de
// segurança...) — opcional, sempre ao lado da senha, nunca a substitui
// obrigatoriamente. rpID/origin vêm de env porque mudam entre dev
// (localhost) e produção (domínio real); sem eles configurados, cai num
// fallback de dev que só funciona em localhost mesmo — WebAuthn exige que
// o rpID bata exatamente com o host servido (ou seja um sufixo dele).
function rpConfig(): { rpID: string; origin: string } {
  return {
    rpID: process.env.WEBAUTHN_RP_ID || "localhost",
    origin: process.env.PUBLIC_ORIGIN || "http://localhost:5173",
  };
}

// ---------- Cadastro (usuário já autenticado registra um dispositivo) ----------

export const iniciarCadastroPasskey = createServerFn({ method: "POST" }).handler(
  async (): Promise<PublicKeyCredentialCreationOptionsJSON> => {
    return comSessao(async (conn, usuarioId) => {
      const [[usuario]] = await conn.query<RowDataPacket[]>(
        "SELECT email, nome_completo FROM usuarios WHERE id = ?",
        [usuarioId],
      );
      if (!usuario) throw new Error("Usuário não encontrado.");

      const [existentes] = await conn.query<RowDataPacket[]>(
        "SELECT credential_id, transportes FROM usuario_passkeys WHERE usuario_id = ?",
        [usuarioId],
      );

      const { rpID } = rpConfig();
      const options = await generateRegistrationOptions({
        rpName: "Gestão da Loja",
        rpID,
        userName: usuario.email,
        userDisplayName: usuario.nome_completo || usuario.email,
        userID: isoUint8Array.fromUTF8String(usuarioId),
        attestationType: "none",
        excludeCredentials: existentes.map((e) => ({
          id: e.credential_id as string,
          transports: e.transportes ? JSON.parse(e.transportes) : undefined,
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
      });

      await salvarDesafioWebauthn(options.challenge);
      return options;
    });
  },
);

const confirmarCadastroSchema = z.object({
  // Shape validado de verdade por verifyRegistrationResponse (assinatura
  // criptográfica) — aqui é só garantir que chegou algo parseável.
  response: z.record(z.string(), z.unknown()),
  nomeDispositivo: z.string().trim().min(1).max(255).nullable().optional(),
});

export const confirmarCadastroPasskey = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmarCadastroSchema.parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      const desafio = await consumirDesafioWebauthn();
      if (!desafio) {
        throw new Error("Cadastro expirado — tente novamente.");
      }

      const { rpID, origin } = rpConfig();
      const verificacao = await verifyRegistrationResponse({
        response: data.response as unknown as RegistrationResponseJSON,
        expectedChallenge: desafio.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
      if (!verificacao.verified || !verificacao.registrationInfo) {
        throw new Error("Não foi possível confirmar o cadastro deste dispositivo.");
      }

      const { credential } = verificacao.registrationInfo;
      await conn.query(
        `INSERT INTO usuario_passkeys
           (usuario_id, credential_id, public_key, contador, transportes, nome_dispositivo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          usuarioId,
          credential.id,
          isoBase64URL.fromBuffer(credential.publicKey),
          credential.counter,
          credential.transports ? JSON.stringify(credential.transports) : null,
          data.nomeDispositivo || null,
        ],
      );
      await registrarAuditoria(conn, usuarioId, "cadastrar_passkey", "usuario", usuarioId);
    });
  });

export type MinhaPasskey = {
  id: string;
  nome_dispositivo: string | null;
  criado_em: string;
  usado_em: string | null;
};

export const listarMinhasPasskeys = createServerFn({ method: "GET" }).handler(
  async (): Promise<MinhaPasskey[]> => {
    return comSessao(async (conn, usuarioId) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, nome_dispositivo, criado_em, usado_em FROM usuario_passkeys WHERE usuario_id = ? ORDER BY criado_em DESC",
        [usuarioId],
      );
      return rows as MinhaPasskey[];
    });
  },
);

export const removerPasskey = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    return comSessao(async (conn, usuarioId) => {
      // WHERE usuario_id garante que ninguém remove passkey de outra conta
      // trocando o id na requisição.
      await conn.query("DELETE FROM usuario_passkeys WHERE id = ? AND usuario_id = ?", [
        data.id,
        usuarioId,
      ]);
    });
  });

// ---------- Login (usuário ainda não autenticado) ----------

const iniciarLoginSchema = z.object({ email: z.string().min(1) });

export const iniciarLoginPasskey = createServerFn({ method: "POST" })
  .validator((d: unknown) => iniciarLoginSchema.parse(d))
  .handler(async ({ data }): Promise<PublicKeyCredentialRequestOptionsJSON> => {
    const usuario = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM usuarios WHERE email = ? AND ativo = TRUE",
        [data.email],
      );
      return usuarioUnicoParaLogin(rows);
    });
    // Mensagem propositalmente igual à de "nenhuma passkey cadastrada" —
    // não confirma se o e-mail existe (evita enumeração de contas).
    if (!usuario) {
      throw new Error("Nenhuma passkey cadastrada para esse usuário.");
    }

    const credenciais = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT credential_id, transportes FROM usuario_passkeys WHERE usuario_id = ?",
        [usuario.id],
      );
      return rows;
    });
    if (credenciais.length === 0) {
      throw new Error("Nenhuma passkey cadastrada para esse usuário.");
    }

    const { rpID } = rpConfig();
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credenciais.map((c) => ({
        id: c.credential_id as string,
        transports: c.transportes ? JSON.parse(c.transportes) : undefined,
      })),
      userVerification: "required",
    });

    await salvarDesafioWebauthn(options.challenge, usuario.id);
    return options;
  });

const confirmarLoginSchema = z.object({ response: z.record(z.string(), z.unknown()) });

export const confirmarLoginPasskey = createServerFn({ method: "POST" })
  .validator((d: unknown) => confirmarLoginSchema.parse(d))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const desafio = await consumirDesafioWebauthn();
    if (!desafio || !desafio.usuarioPendente) {
      throw new Error("Login expirado — tente novamente.");
    }
    const usuarioId = desafio.usuarioPendente;
    const response = data.response as unknown as AuthenticationResponseJSON;

    const credencial = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, credential_id, public_key, contador, transportes FROM usuario_passkeys WHERE credential_id = ? AND usuario_id = ?",
        [response.id, usuarioId],
      );
      return rows[0] ?? null;
    });
    if (!credencial) {
      throw new Error("Passkey não reconhecida.");
    }

    const { rpID, origin } = rpConfig();
    const verificacao = await verifyAuthenticationResponse({
      response,
      expectedChallenge: desafio.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credencial.credential_id,
        publicKey: isoBase64URL.toBuffer(credencial.public_key),
        counter: Number(credencial.contador),
        transports: credencial.transportes ? JSON.parse(credencial.transportes) : undefined,
      },
    });
    if (!verificacao.verified) {
      throw new Error("Não foi possível confirmar o login.");
    }

    await withUserConnection(null, (conn) =>
      conn.query("UPDATE usuario_passkeys SET contador = ?, usado_em = NOW() WHERE id = ?", [
        verificacao.authenticationInfo.newCounter,
        credencial.id,
      ]),
    );

    await criarSessao(usuarioId);
    const sessao = await carregarUsuarioComPapeis(usuarioId);
    if (!sessao) throw new Error("Não foi possível entrar.");
    await withUserConnection(usuarioId, (conn) =>
      registrarAuditoria(conn, usuarioId, "login_passkey", "usuario", usuarioId),
    );
    return sessao;
  });
