-- =========================================
-- PASSKEYS (WebAuthn) — login/cadastro por Face ID, Touch ID, Windows Hello
-- etc., opcional ao lado da senha (issue: reforma de login). Cada linha é
-- uma credencial registrada num dispositivo/navegador específico — um
-- usuário pode ter várias (celular, notebook...).
--
-- public_key e credential_id ficam em base64url (formato que a própria
-- lib @simplewebauthn já usa pra serializar), sem precisar de coluna
-- binária — mais simples de inspecionar/depurar direto no banco.
-- =========================================
CREATE TABLE IF NOT EXISTS usuario_passkeys (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  credential_id VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,
  contador BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transportes VARCHAR(255),
  nome_dispositivo VARCHAR(255),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usado_em TIMESTAMP NULL,
  UNIQUE KEY usuario_passkeys_credential_id_uniq (credential_id),
  CONSTRAINT fk_usuario_passkeys_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_usuario_passkeys_usuario ON usuario_passkeys (usuario_id);
