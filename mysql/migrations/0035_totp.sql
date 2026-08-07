-- =========================================
-- 2FA (TOTP) — autenticação de dois fatores via app autenticador (Google
-- Authenticator, Authy etc.), sempre opcional (mesmo espírito do passkey,
-- issue #81/#82 — nunca obrigatório, nem para admin). Complementa o login
-- por senha; quem usa passkey já tem um segundo fator equivalente.
-- =========================================
CREATE TABLE IF NOT EXISTS usuario_totp (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  secret VARCHAR(64) NOT NULL,
  -- NULL enquanto o usuário ainda não confirmou o código do app (etapa de
  -- ativação) — só conta como "2FA ativo" depois de ativado_em preenchido.
  ativado_em TIMESTAMP NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY usuario_totp_usuario_uniq (usuario_id),
  CONSTRAINT fk_usuario_totp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Códigos de backup de uso único (caso o app/celular seja perdido) — hash
-- igual ao de senha (bcrypt), nunca guardados em texto puro.
CREATE TABLE IF NOT EXISTS usuario_totp_codigos_backup (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  codigo_hash VARCHAR(255) NOT NULL,
  usado_em TIMESTAMP NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuario_totp_codigos_backup_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_usuario_totp_codigos_backup_usuario ON usuario_totp_codigos_backup (usuario_id);
