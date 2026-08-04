-- =========================================
-- SESSÕES: corpo + grau numérico — correção de modelo.
--
-- Este sistema não administra uma loja simbólica (graus 1-3): é voltado
-- aos corpos filosóficos (Loja de Perfeição, Capítulo — graus 4 a 13 no
-- Rito Adonhiramita do SGCAB). `sessoes.grau` estava fixo em
-- ENUM('aprendiz','companheiro','mestre'), incompatível com essa faixa.
-- `irmaos.grau` (mesmo enum) passa a representar apenas o grau craft de
-- origem do irmão (fora deste sistema) — não participa mais da lógica de
-- elegibilidade de sessão, que passa a comparar irmao_orgs.grau_atual
-- (grau atual do irmão NO CORPO da sessão) contra sessoes.grau.
--
-- org_id fica nullable só para não quebrar linhas antigas (sessões
-- criadas antes desta migração, sem corpo definido) — toda sessão nova
-- exige corpo (aplicado na camada de aplicação, não como NOT NULL aqui).
-- =========================================
ALTER TABLE sessoes ADD COLUMN org_id CHAR(36) NULL;
ALTER TABLE sessoes
  ADD CONSTRAINT fk_sessoes_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE SET NULL;
CREATE INDEX idx_sessoes_org ON sessoes (org_id);

ALTER TABLE sessoes ADD COLUMN grau_num INT NULL;
UPDATE sessoes
SET grau_num = CASE grau
  WHEN 'aprendiz' THEN 1
  WHEN 'companheiro' THEN 2
  WHEN 'mestre' THEN 3
END;
ALTER TABLE sessoes MODIFY COLUMN grau_num INT NOT NULL;
ALTER TABLE sessoes DROP COLUMN grau;
ALTER TABLE sessoes CHANGE COLUMN grau_num grau INT NOT NULL;
