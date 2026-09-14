-- =========================================
-- Versionamento de orçamento (issue #582 da auditoria de orçamento/fluxo
-- de caixa). Hoje só existe UM orçamento por loja/ano (UNIQUE(loja_id,
-- ano)) e reabrir um orçamento aprovado (reabrir_orcamento, 0096) permite
-- editar os valores por cima, sem guardar o que tinha sido aprovado
-- originalmente — não dá pra comparar "orçado original" x "orçado
-- revisado" x "realizado".
--
-- Cada aprovação tira um snapshot (orcamento_versoes/orcamento_versoes_
-- itens) dos itens vigentes na hora — tanto competência (orcamento_itens)
-- quanto caixa (orcamento_caixa_itens, 0148) — sob o número de versão
-- corrente de `orcamentos.versao`. Reabrir incrementa essa versão, então
-- a próxima aprovação tira um snapshot novo sem sobrescrever o anterior.
-- =========================================
ALTER TABLE orcamentos ADD COLUMN versao INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS orcamento_versoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  orcamento_id CHAR(36) NOT NULL,
  versao INT NOT NULL,
  aprovado_por CHAR(36),
  aprovado_em DATETIME NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY orcamento_versoes_uniq (orcamento_id, versao),
  CONSTRAINT fk_orcamento_versoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_orcamento_versoes_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_orcamento_versoes_orcamento ON orcamento_versoes (orcamento_id);

CREATE TABLE IF NOT EXISTS orcamento_versoes_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  orcamento_versao_id CHAR(36) NOT NULL,
  regime ENUM('competencia', 'caixa') NOT NULL,
  conta_id CHAR(36) NOT NULL,
  mes TINYINT NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  CONSTRAINT chk_orcamento_versoes_itens_mes CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT fk_orcamento_versoes_itens_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_orcamento_versoes_itens_versao FOREIGN KEY (orcamento_versao_id) REFERENCES orcamento_versoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_orcamento_versoes_itens_conta FOREIGN KEY (conta_id) REFERENCES plano_contas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_orcamento_versoes_itens_versao ON orcamento_versoes_itens (orcamento_versao_id);

-- Espelha aprovar_orcamento (0096), acrescentando o snapshot antes de
-- marcar como aprovado.
DROP PROCEDURE IF EXISTS aprovar_orcamento;
DELIMITER $$
CREATE PROCEDURE aprovar_orcamento(IN p_orcamento_id CHAR(36))
BEGIN
  DECLARE v_versao INT;
  DECLARE v_versao_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin aprova o orçamento';
  END IF;

  SELECT versao INTO v_versao FROM orcamentos
   WHERE id = p_orcamento_id AND status = 'rascunho' AND loja_id = @current_loja_id;
  IF v_versao IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou já aprovado';
  END IF;

  SET v_versao_id = UUID();
  INSERT INTO orcamento_versoes (id, loja_id, orcamento_id, versao, aprovado_por, aprovado_em)
  VALUES (v_versao_id, @current_loja_id, p_orcamento_id, v_versao, @current_usuario_id, NOW());

  INSERT INTO orcamento_versoes_itens (loja_id, orcamento_versao_id, regime, conta_id, mes, valor)
  SELECT @current_loja_id, v_versao_id, 'competencia', conta_id, mes, valor
  FROM orcamento_itens WHERE orcamento_id = p_orcamento_id AND loja_id = @current_loja_id AND valor <> 0;

  INSERT INTO orcamento_versoes_itens (loja_id, orcamento_versao_id, regime, conta_id, mes, valor)
  SELECT @current_loja_id, v_versao_id, 'caixa', conta_id, mes, valor
  FROM orcamento_caixa_itens WHERE orcamento_id = p_orcamento_id AND loja_id = @current_loja_id AND valor <> 0;

  UPDATE orcamentos SET status = 'aprovado', aprovado_por = @current_usuario_id, aprovado_em = NOW()
  WHERE id = p_orcamento_id AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$
DELIMITER ;

-- Espelha reabrir_orcamento (0096), incrementando a versão — a próxima
-- aprovação tira um snapshot novo, sem sobrescrever o anterior.
DROP PROCEDURE IF EXISTS reabrir_orcamento;
DELIMITER $$
CREATE PROCEDURE reabrir_orcamento(IN p_orcamento_id CHAR(36))
BEGIN
  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o orçamento';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM orcamentos
     WHERE id = p_orcamento_id AND status = 'aprovado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou não está aprovado';
  END IF;

  UPDATE orcamentos
     SET status = 'rascunho', aprovado_por = NULL, aprovado_em = NULL, versao = versao + 1
   WHERE id = p_orcamento_id AND loja_id = @current_loja_id;
END$$
DELIMITER ;
