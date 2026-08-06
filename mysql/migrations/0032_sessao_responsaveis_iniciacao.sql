-- =========================================
-- Sessões de iniciação (o importador de PDF de cronograma passa a
-- reconhecer "INICIAÇÃO DO GRAU N" como um tipo próprio, não uma sessão
-- ordinária qualquer) e responsáveis extraídos por sessão (peça de
-- arquitetura / apresentação), com tentativa de vínculo automático ao
-- cadastro de irmãos — irmao_id fica nullable porque nem todo nome
-- extraído do PDF necessariamente bate com um irmão já cadastrado (ou o
-- usuário escolhe não vincular no preview da importação).
-- =========================================
ALTER TABLE sessoes
  MODIFY COLUMN tipo ENUM('ordinaria', 'magna', 'branca', 'administrativa', 'iniciacao') NOT NULL DEFAULT 'ordinaria';

CREATE TABLE IF NOT EXISTS sessao_responsaveis (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  sessao_id CHAR(36) NOT NULL,
  irmao_id CHAR(36) NULL,
  nome_extraido VARCHAR(255) NOT NULL,
  apelido_extraido VARCHAR(255) NULL,
  atividade VARCHAR(500) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessao_responsaveis_sessao FOREIGN KEY (sessao_id) REFERENCES sessoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessao_responsaveis_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE SET NULL
) ENGINE = InnoDB;
CREATE INDEX idx_sessao_responsaveis_sessao ON sessao_responsaveis (sessao_id);
CREATE INDEX idx_sessao_responsaveis_irmao ON sessao_responsaveis (irmao_id);
