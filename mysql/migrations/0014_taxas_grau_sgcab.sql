-- =========================================
-- TAXAS POR GRAU (SGCAB) — issue #21.
--
-- Referência no legado PHP: catálogo `taxasGrau` (ano, grau, nomeGrau,
-- sgcab, ritual, diploma, taxaPropria, corpo, ativo) e controle por irmão
-- `mdl-sgcab` (irmão, ano, grau, tipo, valor, vencimento, status,
-- comprovante). `gerarLinhasTaxasPorCorpo()` gera as linhas de cobrança a
-- partir da lista de graus do corpo (aqui: orgs_graus/irmao_orgs.grau_atual,
-- já existentes desde 0002_cadastros.sql).
--
-- Importante (preservado do legado): estas taxas são deliberadamente
-- "extracontábeis" — normalmente repassadas a um órgão federativo externo,
-- não é receita da loja. Por isso NÃO geram lancamentos/faturas — ficam
-- isoladas neste módulo próprio, à parte do fluxo de tesouraria/contabilidade.
-- =========================================

-- Catálogo de valores por ano/grau/corpo (com "ativo" para desativar sem
-- apagar histórico de cobranças já geradas a partir dele).
CREATE TABLE IF NOT EXISTS taxas_grau (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  org_id CHAR(36) NOT NULL,
  ano INT NOT NULL,
  grau INT NOT NULL,
  sgcab DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ritual DECIMAL(12, 2) NOT NULL DEFAULT 0,
  diploma DECIMAL(12, 2) NOT NULL DEFAULT 0,
  taxa_propria DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY taxas_grau_org_ano_grau_uniq (org_id, ano, grau),
  CONSTRAINT fk_taxas_grau_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT chk_taxas_grau_grau CHECK (grau > 0)
) ENGINE = InnoDB;
CREATE INDEX idx_taxas_grau_org_ano ON taxas_grau (org_id, ano);

-- Controle de cobrança por irmão, uma linha por (irmão, ano, grau, tipo).
CREATE TABLE IF NOT EXISTS sgcab_cobrancas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  ano INT NOT NULL,
  grau INT NOT NULL,
  tipo ENUM('sgcab', 'ritual', 'diploma', 'taxa_propria') NOT NULL,
  valor DECIMAL(12, 2) NOT NULL,
  vencimento DATE,
  status ENUM('pendente', 'pago', 'cancelado') NOT NULL DEFAULT 'pendente',
  comprovante_url VARCHAR(500),
  data_pagamento DATE,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY sgcab_cobrancas_irmao_ano_grau_tipo_uniq (irmao_id, ano, grau, tipo),
  CONSTRAINT fk_sgcab_cobrancas_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE,
  CONSTRAINT fk_sgcab_cobrancas_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_sgcab_cobrancas_irmao ON sgcab_cobrancas (irmao_id);
CREATE INDEX idx_sgcab_cobrancas_org_ano ON sgcab_cobrancas (org_id, ano);
CREATE INDEX idx_sgcab_cobrancas_status ON sgcab_cobrancas (status);

-- =========================================
-- RPC: gerar_cobrancas_sgcab — equivalente a gerarLinhasTaxasPorCorpo() do
-- legado. Para cada irmão do corpo com grau_atual (irmao_orgs) preenchido,
-- gera uma cobrança pendente por tipo de taxa com valor > 0 no catálogo
-- daquele corpo/ano/grau. INSERT IGNORE respeita a chave única, então
-- rodar de novo não duplica cobranças já existentes (só preenche lacunas
-- novas, ex.: irmão que acabou de ser elevado ao grau).
-- =========================================
DROP PROCEDURE IF EXISTS gerar_cobrancas_sgcab;
DELIMITER $$
CREATE PROCEDURE gerar_cobrancas_sgcab(
  IN p_org_id CHAR(36),
  IN p_ano INT,
  OUT p_total_gerado INT
)
BEGIN
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_antes INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  SELECT COUNT(*) INTO v_antes FROM sgcab_cobrancas WHERE org_id = p_org_id AND ano = p_ano;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'sgcab', tg.sgcab, 'pendente'
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual
  WHERE io.org_id = p_org_id AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.sgcab > 0;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'ritual', tg.ritual, 'pendente'
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual
  WHERE io.org_id = p_org_id AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.ritual > 0;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'diploma', tg.diploma, 'pendente'
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual
  WHERE io.org_id = p_org_id AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.diploma > 0;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'taxa_propria', tg.taxa_propria, 'pendente'
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual
  WHERE io.org_id = p_org_id AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.taxa_propria > 0;

  SELECT COUNT(*) - v_antes INTO p_total_gerado FROM sgcab_cobrancas WHERE org_id = p_org_id AND ano = p_ano;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
