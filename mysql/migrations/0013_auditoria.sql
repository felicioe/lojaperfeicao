-- =========================================
-- AUDITORIA SERVER-SIDE IMUTÁVEL (issue #26).
-- Tabela append-only: dois triggers bloqueiam UPDATE/DELETE mesmo por
-- SQL direto (não só por não ter rota de escrita na aplicação) — a única
-- forma de "editar" o histórico seria alguém com acesso de superusuário
-- dropando os triggers, o que já foge do modelo de ameaça de uma
-- auditoria de aplicação.
--
-- Cobertura inicial (ações de maior risco/sensibilidade, ver
-- src/lib/backend/auditoria.ts para o helper e os pontos instrumentados):
-- login/logout, mudança de papéis, ativar/inativar usuário, redefinir
-- senha, criar acesso de irmão, excluir irmão, e resetar_financeiro (a
-- ação mais destrutiva do sistema). Não é cobertura de 100% das escritas
-- do sistema — ver comentário na issue #26 para o que ficou de fora.
-- =========================================
CREATE TABLE IF NOT EXISTS auditoria (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36),
  acao VARCHAR(100) NOT NULL,
  entidade_tipo VARCHAR(100) NOT NULL,
  entidade_id CHAR(36),
  dados_antes JSON,
  dados_depois JSON,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_auditoria_criado_em ON auditoria (criado_em);
CREATE INDEX idx_auditoria_entidade ON auditoria (entidade_tipo, entidade_id);
CREATE INDEX idx_auditoria_usuario ON auditoria (usuario_id);

DROP TRIGGER IF EXISTS trg_auditoria_no_update;
DROP TRIGGER IF EXISTS trg_auditoria_no_delete;
DELIMITER $$
CREATE TRIGGER trg_auditoria_no_update BEFORE UPDATE ON auditoria
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'auditoria é append-only: não é possível alterar um registro existente';
END$$
CREATE TRIGGER trg_auditoria_no_delete BEFORE DELETE ON auditoria
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'auditoria é append-only: não é possível apagar um registro existente';
END$$
DELIMITER ;
