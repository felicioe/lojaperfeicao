-- =========================================
-- PEÇAS DE ARQUITETURA — biblioteca de trabalhos/textos apresentados em
-- sessão. Vinculada ao irmão autor (obrigatório) e, opcionalmente, à
-- sessão em que foi apresentada. O arquivo em si não fica em BLOB: segue
-- o mesmo padrão de upload já usado para foto de irmão/logo de corpo
-- (grava em disco sob public/uploads, guarda só a URL aqui).
-- =========================================
CREATE TABLE IF NOT EXISTS pecas_arquitetura (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  autor_id CHAR(36) NOT NULL,
  sessao_id CHAR(36) NULL,
  titulo VARCHAR(255) NOT NULL,
  tema VARCHAR(255) NULL,
  resumo TEXT NULL,
  arquivo_url VARCHAR(500) NULL,
  arquivo_nome_original VARCHAR(255) NULL,
  arquivo_mime VARCHAR(100) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pecas_arquitetura_autor FOREIGN KEY (autor_id) REFERENCES irmaos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pecas_arquitetura_sessao FOREIGN KEY (sessao_id) REFERENCES sessoes(id) ON DELETE SET NULL
) ENGINE = InnoDB;
CREATE INDEX idx_pecas_arquitetura_autor ON pecas_arquitetura (autor_id);
CREATE INDEX idx_pecas_arquitetura_sessao ON pecas_arquitetura (sessao_id);
