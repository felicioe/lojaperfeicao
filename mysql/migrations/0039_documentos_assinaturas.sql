-- =========================================
-- ASSINATURA DIGITAL SIMPLES (issue #87) — registro interno auditável de
-- "Fulano confirmou/aprovou X em tal data/hora", com hash SHA-256 do
-- conteúdo pra garantir integridade. SEM validade jurídica ICP-Brasil,
-- decisão confirmada na issue (opção "a": simples e interna, sem
-- provedor externo pago).
--
-- documento_assinaturas é append-only (mesmo padrão da auditoria da
-- issue #26, mysql/migrations/0013_auditoria.sql) — uma vez assinado,
-- ninguém edita/apaga a assinatura, nem por SQL direto.
-- =========================================
CREATE TABLE IF NOT EXISTS documentos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  conteudo LONGTEXT NOT NULL,
  hash_conteudo CHAR(64) NOT NULL,
  arquivo_url VARCHAR(500) NULL,
  arquivo_nome_original VARCHAR(255) NULL,
  arquivo_mime VARCHAR(100) NULL,
  criado_por CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_documentos_criado_por FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS documento_assinaturas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  documento_id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  hash_conteudo_no_momento CHAR(64) NOT NULL,
  assinado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY documento_assinaturas_documento_usuario_uniq (documento_id, usuario_id),
  CONSTRAINT fk_documento_assinaturas_documento FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_documento_assinaturas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
) ENGINE = InnoDB;
CREATE INDEX idx_documento_assinaturas_documento ON documento_assinaturas (documento_id);

DROP TRIGGER IF EXISTS trg_documento_assinaturas_no_update;
DROP TRIGGER IF EXISTS trg_documento_assinaturas_no_delete;
DELIMITER $$
CREATE TRIGGER trg_documento_assinaturas_no_update BEFORE UPDATE ON documento_assinaturas
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'assinatura é append-only: não é possível alterar uma assinatura existente';
END$$
CREATE TRIGGER trg_documento_assinaturas_no_delete BEFORE DELETE ON documento_assinaturas
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'assinatura é append-only: não é possível apagar uma assinatura existente';
END$$
DELIMITER ;
