-- =========================================
-- LOGIN COM FACEBOOK (issue #99) — mesmo desenho do login com Google
-- (issue #98, mysql/migrations/0041_google_login.sql): vinculação manual
-- (irmão precisa estar logado com senha pra vincular a própria conta
-- Facebook), e duas tabelas de vida curta e uso único porque o callback
-- OAuth roda fora do pipeline de request do TanStack Start (mesmo padrão
-- dos endpoints de cron em src/server.ts) e não tem acesso ao H3Event
-- necessário pra ler/escrever o cookie de sessão direto.
--
-- Tabelas paralelas às do Google (não compartilhadas) — cada provedor
-- OAuth já tinha suas próprias no padrão estabelecido, mais simples do
-- que generalizar agora e arriscar mexer nas tabelas do Google já em
-- produção.
-- =========================================
ALTER TABLE usuarios ADD COLUMN facebook_id VARCHAR(255) NULL UNIQUE;

CREATE TABLE IF NOT EXISTS facebook_oauth_state (
  state CHAR(36) NOT NULL PRIMARY KEY,
  tipo ENUM('login', 'vincular') NOT NULL,
  usuario_id_vinculacao CHAR(36) NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_facebook_oauth_state_usuario FOREIGN KEY (usuario_id_vinculacao) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS facebook_login_tickets (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  expira_em TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_facebook_login_tickets_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;
