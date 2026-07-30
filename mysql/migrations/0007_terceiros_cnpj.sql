-- =========================================
-- Issue #53 — suporte à consulta de CNPJ (antes uma Supabase Edge Function,
-- "consulta-cnpj"). As duas tabelas abaixo existiam só no schema do
-- Supabase (fora de qualquer migration deste repo MySQL, pois eram
-- exclusivas da função) e não têm equivalente em nenhuma migration
-- anterior — cache por CNPJ (30 dias) e rate-limit por usuário
-- (10 consultas / 5 minutos), mesma regra da função original.
-- =========================================

CREATE TABLE IF NOT EXISTS cnpj_consultas_cache (
  cnpj VARCHAR(14) NOT NULL PRIMARY KEY,
  dados JSON NOT NULL,
  consultado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cnpj_rate_limit (
  usuario_id CHAR(36) NOT NULL PRIMARY KEY,
  tentativas INT NOT NULL DEFAULT 1,
  janela_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cnpj_rate_limit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
