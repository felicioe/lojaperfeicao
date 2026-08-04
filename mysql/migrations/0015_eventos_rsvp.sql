-- =========================================
-- EVENTOS COM RSVP — issue #20.
--
-- Referência no legado PHP: evento (titulo, data, hora, descricao,
-- publico 'todos'|'ativos'|'org', org, temAgape), RSVP por irmão
-- (participa: sim/não/talvez, agape: bool). `_eventoPublico()` filtra
-- visibilidade por status/vínculo de organização — reproduzido abaixo via
-- WHERE na consulta de listagem (não RLS de banco, mesma filosofia do
-- restante do projeto pós-migração do Postgres/Supabase).
--
-- Status (agendado/realizado) é derivado de data+hora na consulta, não
-- armazenado.
-- =========================================
CREATE TABLE IF NOT EXISTS eventos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  data DATE NOT NULL,
  hora TIME,
  descricao TEXT,
  publico ENUM('todos', 'ativos', 'org') NOT NULL DEFAULT 'todos',
  org_id CHAR(36),
  tem_agape BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eventos_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT chk_eventos_publico_org CHECK (publico <> 'org' OR org_id IS NOT NULL)
) ENGINE = InnoDB;
CREATE INDEX idx_eventos_data ON eventos (data);

CREATE TABLE IF NOT EXISTS evento_rsvps (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  evento_id CHAR(36) NOT NULL,
  irmao_id CHAR(36) NOT NULL,
  participa ENUM('sim', 'nao', 'talvez') NOT NULL,
  agape BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY evento_rsvps_evento_irmao_uniq (evento_id, irmao_id),
  CONSTRAINT fk_evento_rsvps_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
  CONSTRAINT fk_evento_rsvps_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_evento_rsvps_evento ON evento_rsvps (evento_id);
CREATE INDEX idx_evento_rsvps_irmao ON evento_rsvps (irmao_id);
