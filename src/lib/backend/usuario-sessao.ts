import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";

export type Papel = "admin" | "tesoureiro" | "secretario" | "irmao";

export type UsuarioSessao = {
  id: string;
  email: string;
  nomeCompleto: string | null;
  papeis: Papel[];
  // null = ainda não aceitou a Política de Privacidade (LGPD) — barrado em
  // /aceite-termos até aceitar, ver _authenticated/route.tsx.
  consentimentoLgpdEm: string | null;
  // true = senha temporária (definida pelo admin com "obrigar troca no
  // primeiro acesso") — barrado em /trocar-senha até definir uma nova,
  // mesmo padrão de gate do consentimentoLgpdEm acima.
  deveTrocarSenha: boolean;
};

// Módulo separado (não é um createServerFn) só pra evitar que arquivos
// client-reachable (auth.ts, passkeys.ts) acabem levando esta função —
// e a conexão MySQL que ela puxa — pro bundle do navegador. Enquanto for
// só chamada de dentro de handlers de createServerFn nesses arquivos, o
// compilador do TanStack Start remove essa referência do bundle client;
// se ela virasse um "export" direto num arquivo importado por rota, isso
// deixaria de funcionar (foi exatamente o bug corrigido aqui).
export async function carregarUsuarioComPapeis(usuarioId: string): Promise<UsuarioSessao | null> {
  return withUserConnection(usuarioId, async (conn) => {
    const [usuarios] = await conn.query<RowDataPacket[]>(
      "SELECT id, email, nome_completo, consentimento_lgpd_em, ativo, deve_trocar_senha FROM usuarios WHERE id = ?",
      [usuarioId],
    );
    const usuario = usuarios[0];
    // usuário inativo é tratado como "sem sessão" — derruba qualquer
    // sessão já aberta no próximo carregamento, não só bloqueia o login.
    if (!usuario || !usuario.ativo) return null;

    const [papeis] = await conn.query<RowDataPacket[]>(
      "SELECT papel FROM usuarios_papeis WHERE usuario_id = ?",
      [usuarioId],
    );

    return {
      id: usuario.id,
      email: usuario.email,
      nomeCompleto: usuario.nome_completo,
      papeis: papeis.map((p) => p.papel as Papel),
      consentimentoLgpdEm: usuario.consentimento_lgpd_em
        ? new Date(usuario.consentimento_lgpd_em).toISOString()
        : null,
      deveTrocarSenha: !!usuario.deve_trocar_senha,
    };
  });
}
