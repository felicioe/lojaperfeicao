-- =========================================
-- LOGIN COM GOOGLE (issue #98) — vinculação manual, mesma filosofia de
-- segurança das passkeys (issue #46): o irmão precisa estar logado (senha)
-- pra vincular a própria conta Google. Não vincula automaticamente por
-- e-mail — evita que alguém sequestre uma conta só por controlar um e-mail
-- que bate com o cadastro.
--
-- O fluxo OAuth atravessa um redirect externo (Google → nosso callback),
-- então não dá pra usar o cookie de sessão assinado (webauthnChallenge etc.)
-- pra guardar o "state" CSRF nem pra criar a sessão final — o endpoint de
-- callback roda fora do pipeline de request do TanStack Start (mesmo
-- padrão dos endpoints de cron em src/server.ts) e não tem acesso ao
-- H3Event necessário pra ler/escrever o cookie de sessão. Por isso duas
-- tabelas de apoio, ambas de vida curta e uso único:
--   - google_oauth_state: guarda o "state" gerado antes do redirect pro
--     Google, e se a intenção era login ou vincular conta (e de qual
--     usuário, no caso de vincular).
--   - google_login_tickets: depois que o callback confirma a identidade
--     Google, gera um ticket de uso único que uma rota normal do
--     TanStack Start (essa sim dentro do pipeline, com H3Event) consome
--     pra criar a sessão de verdade via criarSessao().
-- =========================================
ALTER TABLE usuarios ADD COLUMN google_id VARCHAR(255) NULL UNIQUE;

CREATE TABLE IF NOT EXISTS google_oauth_state (
  state CHAR(36) NOT NULL PRIMARY KEY,
  tipo ENUM('login', 'vincular') NOT NULL,
  usuario_id_vinculacao CHAR(36) NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_google_oauth_state_usuario FOREIGN KEY (usuario_id_vinculacao) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS google_login_tickets (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_google_login_tickets_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;
