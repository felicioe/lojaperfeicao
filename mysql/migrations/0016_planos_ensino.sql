-- =========================================
-- PLANOS DE ENSINO — issue #22.
--
-- Referência no legado PHP: `planosEnsino` (dados de referência do plano
-- de estudo por grau, base para o calendário anual pré-definido). Puro
-- cadastro de referência — sem vínculo com sessões/eventos gerados (esses
-- só herdam o grau detectado na importação, não uma FK para o plano).
-- =========================================
CREATE TABLE IF NOT EXISTS planos_ensino (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  grau ENUM('aprendiz', 'companheiro', 'mestre') NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  titulo VARCHAR(255) NOT NULL,
  conteudo TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;
CREATE INDEX idx_planos_ensino_grau ON planos_ensino (grau, ordem);
