-- =========================================
-- Seed do catálogo de cargos institucionais (genéricos — org_id NULL),
-- pra Gestões poder vincular os ocupantes de cada corpo sem precisar
-- cadastrar cargo um a um pela UI. Cada INSERT é guardado por um
-- WHERE NOT EXISTS pra a migração poder ser reaplicada sem duplicar.
-- =========================================
INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Sapientíssimo', 1
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Sapientíssimo');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, '1º Vigilante', 2
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = '1º Vigilante');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, '2º Vigilante', 3
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = '2º Vigilante');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Orador', 4
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Orador');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Secretário', 5
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Secretário');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Tesoureiro', 6
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Tesoureiro');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Chanceler', 7
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Chanceler');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Mestre de Cerimônias', 8
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Mestre de Cerimônias');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Hospitaleiro', 9
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Hospitaleiro');

INSERT INTO cargos (org_id, nome, ordem)
SELECT NULL, 'Cobridor', 10
WHERE NOT EXISTS (SELECT 1 FROM cargos WHERE org_id IS NULL AND nome = 'Cobridor');
