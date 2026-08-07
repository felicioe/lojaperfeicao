-- =========================================
-- BACKUP AGENDADO — histórico dos backups completos gerados (issue #85).
-- Os arquivos em si ficam fora de public/ (não podem ser servidos
-- estaticamente — teriam senha_hash, secrets de 2FA/passkey etc.), essa
-- tabela só guarda os metadados pra listar/baixar via rota autenticada.
-- =========================================
CREATE TABLE IF NOT EXISTS backups_gerados (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  nome_arquivo VARCHAR(255) NOT NULL,
  tamanho_bytes BIGINT UNSIGNED NOT NULL,
  total_tabelas INT UNSIGNED NOT NULL,
  total_linhas INT UNSIGNED NOT NULL,
  origem ENUM('cron', 'manual') NOT NULL DEFAULT 'cron',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;
CREATE INDEX idx_backups_gerados_criado_em ON backups_gerados (criado_em);
