-- =========================================
-- PEÇAS DE ARQUITETURA — grau obrigatório (#222). Linhas existentes
-- herdam o grau da sessão vinculada quando houver; sem sessão, cai no
-- menor grau (1) — o autor/admin corrige manualmente depois se precisar
-- de algo mais restrito.
-- =========================================
ALTER TABLE pecas_arquitetura ADD COLUMN grau INT NULL;

UPDATE pecas_arquitetura pa
JOIN sessoes s ON s.id = pa.sessao_id
SET pa.grau = s.grau
WHERE pa.sessao_id IS NOT NULL;

UPDATE pecas_arquitetura SET grau = 1 WHERE grau IS NULL;

ALTER TABLE pecas_arquitetura MODIFY COLUMN grau INT NOT NULL;
CREATE INDEX idx_pecas_arquitetura_grau ON pecas_arquitetura (grau);
