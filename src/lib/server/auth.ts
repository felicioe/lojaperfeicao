import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";
import { criarSessao, encerrarSessao, usuarioIdDaSessao } from "./session";

export type Papel = "admin" | "tesoureiro" | "secretario" | "irmao";

export type UsuarioSessao = {
  id: string;
  email: string;
  nomeCompleto: string | null;
  papeis: Papel[];
};

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

const signupSchema = z.object({
  nomeCompleto: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(6),
});

async function carregarUsuarioComPapeis(usuarioId: string): Promise<UsuarioSessao | null> {
  return withUserConnection(usuarioId, async (conn) => {
    const [usuarios] = await conn.query<RowDataPacket[]>(
      "SELECT id, email, nome_completo FROM usuarios WHERE id = ?",
      [usuarioId],
    );
    const usuario = usuarios[0];
    if (!usuario) return null;

    const [papeis] = await conn.query<RowDataPacket[]>(
      "SELECT papel FROM usuarios_papeis WHERE usuario_id = ?",
      [usuarioId],
    );

    return {
      id: usuario.id,
      email: usuario.email,
      nomeCompleto: usuario.nome_completo,
      papeis: papeis.map((p) => p.papel as Papel),
    };
  });
}

export const login = createServerFn({ method: "POST" })
  .validator((data: unknown) => loginSchema.parse(data))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const usuario = await withUserConnection(null, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, senha_hash FROM usuarios WHERE email = ?",
        [data.email],
      );
      return rows[0] ?? null;
    });

    if (!usuario || !(await bcrypt.compare(data.senha, usuario.senha_hash))) {
      throw new Error("E-mail ou senha inválidos.");
    }

    await criarSessao(usuario.id);
    const sessao = await carregarUsuarioComPapeis(usuario.id);
    if (!sessao) throw new Error("E-mail ou senha inválidos.");
    return sessao;
  });

export const signup = createServerFn({ method: "POST" })
  .validator((data: unknown) => signupSchema.parse(data))
  .handler(async ({ data }): Promise<UsuarioSessao> => {
    const senhaHash = await bcrypt.hash(data.senha, 10);

    const usuarioId = await withUserConnection(null, async (conn) => {
      await conn.query("CALL criar_usuario(?, ?, ?, @novo_usuario_id)", [
        data.email,
        senhaHash,
        data.nomeCompleto,
      ]);
      const [[{ novo_usuario_id }]] = await conn.query<RowDataPacket[]>(
        "SELECT @novo_usuario_id AS novo_usuario_id",
      );
      return novo_usuario_id as string;
    });

    await criarSessao(usuarioId);
    const sessao = await carregarUsuarioComPapeis(usuarioId);
    if (!sessao) throw new Error("Falha ao criar conta.");
    return sessao;
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await encerrarSessao();
});

export const getSessao = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsuarioSessao | null> => {
    const usuarioId = await usuarioIdDaSessao();
    if (!usuarioId) return null;
    return carregarUsuarioComPapeis(usuarioId);
  },
);

export const contarUsuarios = createServerFn({ method: "GET" }).handler(async (): Promise<number> => {
  return withUserConnection(null, async (conn) => {
    const [[{ total }]] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM usuarios");
    return Number(total);
  });
});
