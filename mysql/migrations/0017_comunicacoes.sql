-- =========================================
-- COMUNICAÇÕES INTERNAS — issue #23.
--
-- Referência no legado PHP: `pg-comunicacoes`/`renderComunicacoes()` —
-- lista simples de comunicados (título/corpo/data/público-alvo). Leitura
-- rastreada por irmão para o badge de não lidos no portal.
-- =========================================
CREATE TABLE IF NOT EXISTS comunicados (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  corpo TEXT NOT NULL,
  publico ENUM('todos', 'org') NOT NULL DEFAULT 'todos',
  org_id CHAR(36),
  criado_por CHAR(36),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comunicados_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT fk_comunicados_criado_por FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT chk_comunicados_publico_org CHECK (publico <> 'org' OR org_id IS NOT NULL)
) ENGINE = InnoDB;
CREATE INDEX idx_comunicados_criado_em ON comunicados (criado_em);

CREATE TABLE IF NOT EXISTS comunicado_leituras (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  comunicado_id CHAR(36) NOT NULL,
  irmao_id CHAR(36) NOT NULL,
  lido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY comunicado_leituras_comunicado_irmao_uniq (comunicado_id, irmao_id),
  CONSTRAINT fk_comunicado_leituras_comunicado FOREIGN KEY (comunicado_id) REFERENCES comunicados(id) ON DELETE CASCADE,
  CONSTRAINT fk_comunicado_leituras_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_comunicado_leituras_irmao ON comunicado_leituras (irmao_id);
