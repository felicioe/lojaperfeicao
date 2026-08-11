-- =========================================
-- CONFIGURAÇÕES LGPD — dados da entidade exibidos na Política de
-- Privacidade (nome, CNPJ, e-mail do DPO/encarregado), hoje hardcoded
-- como placeholders "[...]" em PoliticaPrivacidadeConteudo. Singleton
-- (mesmo padrão de parametros_financeiros, 0003_contabil_tesouraria.sql).
-- =========================================
CREATE TABLE IF NOT EXISTS configuracoes_lgpd (
  id TINYINT NOT NULL DEFAULT 1 PRIMARY KEY,
  nome_entidade VARCHAR(255),
  cnpj VARCHAR(20),
  email_dpo VARCHAR(255),
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_configuracoes_lgpd_singleton CHECK (id = 1)
) ENGINE=InnoDB;
INSERT IGNORE INTO configuracoes_lgpd (id) VALUES (1);
