import type { RowDataPacket } from "mysql2";
import { withUserConnection } from "./db";

// `super_admin` é o administrador da PLATAFORMA (issue #339), não da loja:
// cadastra e suspende lojas, e não enxerga o dado interno de nenhuma. Os
// outros quatro papéis são todos internos a uma loja.
export type Papel =
  "admin" | "tesoureiro" | "secretario" | "irmao" | "super_admin" | "editor_cms" | "aprovador_cms";

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
      `SELECT u.id, u.email, u.nome_completo, u.consentimento_lgpd_em, u.ativo,
              u.deve_trocar_senha, l.ativa AS loja_ativa
         FROM usuarios u
         LEFT JOIN lojas l ON l.id = u.loja_id
        WHERE u.id = ?`,
      [usuarioId],
    );
    const usuario = usuarios[0];
    // usuário inativo é tratado como "sem sessão" — derruba qualquer
    // sessão já aberta no próximo carregamento, não só bloqueia o login.
    if (!usuario || !usuario.ativo) return null;
    // Loja suspensa pelo super-admin (issue #339) tem exatamente a mesma
    // semântica, um nível acima: ninguém da loja entra, e quem já estava
    // dentro cai na próxima navegação. Como todos os caminhos de login
    // (senha, passkey, 2FA, Google, Facebook) terminam aqui, esta é a única
    // checagem necessária — sem ela a pessoa autenticava normalmente e só
    // encontrava telas vazias, sem explicação nenhuma.
    if (!usuario.loja_ativa) return null;

    // Os papéis são lidos com a loja do próprio usuário: `usuarios_papeis`
    // ganhou loja_id na 0092, e uma linha de outra Loja aqui viraria papel
    // concedido onde não deveria.
    const [papeis] = await conn.query<RowDataPacket[]>(
      "SELECT papel FROM usuarios_papeis WHERE usuario_id = ? AND loja_id = @current_loja_id",
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
