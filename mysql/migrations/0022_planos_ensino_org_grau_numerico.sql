-- =========================================
-- PLANOS DE ENSINO: mesma correção de modelo já aplicada em sessões
-- (migração 0019) — este sistema não tem loja simbólica, então
-- `planos_ensino.grau` não pode continuar em
-- ENUM('aprendiz','companheiro','mestre'). Vira INT (graus filosóficos,
-- 4 a 13 no Rito Adonhiramita) e ganha org_id, já que currículo pode
-- variar entre Loja de Perfeição e Capítulo.
--
-- org_id fica nullable pelo mesmo motivo de sessoes.org_id: não quebrar
-- linhas antigas sem corpo definido. Os valores antigos do enum viram
-- 1/2/3 (ordinal preservado, não é uma correspondência real de grau —
-- não havia dado nenhum em produção nesta tabela antes desta migração,
-- então na prática não deve sobrar nenhuma linha "1/2/3" órfã; se
-- sobrar, o admin ajusta manualmente pelo campo numérico agora livre).
-- =========================================
ALTER TABLE planos_ensino ADD COLUMN org_id CHAR(36) NULL;
ALTER TABLE planos_ensino
  ADD CONSTRAINT fk_planos_ensino_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE SET NULL;
CREATE INDEX idx_planos_ensino_org ON planos_ensino (org_id);

ALTER TABLE planos_ensino ADD COLUMN grau_num INT NULL;
UPDATE planos_ensino
SET grau_num = CASE grau
  WHEN 'aprendiz' THEN 1
  WHEN 'companheiro' THEN 2
  WHEN 'mestre' THEN 3
END;
ALTER TABLE planos_ensino MODIFY COLUMN grau_num INT NOT NULL;
DROP INDEX idx_planos_ensino_grau ON planos_ensino;
ALTER TABLE planos_ensino DROP COLUMN grau;
ALTER TABLE planos_ensino CHANGE COLUMN grau_num grau INT NOT NULL;
CREATE INDEX idx_planos_ensino_grau ON planos_ensino (grau, ordem);
