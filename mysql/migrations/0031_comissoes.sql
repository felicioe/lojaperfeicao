-- =========================================
-- COMISSÕES — grupos de trabalho de um corpo maçônico (ex.: Ensino/
-- Ritualística/Liturgia/Graus, Finanças), com membros ocupando papéis
-- (Presidente, Suplente, Secretário, Membro...). Análogo a gestao_cargos,
-- mas sem vínculo com o mandato (gestão) — comissão é mais estável que
-- o mandato anual.
-- =========================================
CREATE TABLE IF NOT EXISTS comissoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comissoes_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_comissoes_org ON comissoes (org_id);

CREATE TABLE IF NOT EXISTS comissao_membros (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  comissao_id CHAR(36) NOT NULL,
  papel VARCHAR(100) NOT NULL,
  irmao_id CHAR(36) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY comissao_membros_uniq (comissao_id, papel, irmao_id),
  CONSTRAINT fk_comissao_membros_comissao FOREIGN KEY (comissao_id) REFERENCES comissoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_comissao_membros_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE RESTRICT
) ENGINE = InnoDB;
CREATE INDEX idx_comissao_membros_comissao ON comissao_membros (comissao_id);
CREATE INDEX idx_comissao_membros_irmao ON comissao_membros (irmao_id);

-- Seed das duas comissões do Programa de Ensino 2026, uma por corpo
-- (Loja de Perfeição e Capítulo têm cada uma a sua). Só roda se o corpo
-- existir e a comissão com esse nome ainda não tiver sido criada nele.
INSERT INTO comissoes (org_id, nome)
SELECT o.id, 'Ensino, Ritualística, Liturgia e Graus'
FROM orgs o
WHERE NOT EXISTS (
  SELECT 1 FROM comissoes c WHERE c.org_id = o.id AND c.nome = 'Ensino, Ritualística, Liturgia e Graus'
);

INSERT INTO comissoes (org_id, nome)
SELECT o.id, 'Finanças'
FROM orgs o
WHERE NOT EXISTS (
  SELECT 1 FROM comissoes c WHERE c.org_id = o.id AND c.nome = 'Finanças'
);
