-- =========================================
-- Orçamento em base de caixa (issue #581 da auditoria de orçamento/fluxo
-- de caixa). O orçamento existente (orcamento_itens, 0005/0092) é
-- comparado só contra o regime de competência (lancamentos_contabeis) —
-- correto pro DRE Orçado, mas a tela de Fluxo de Caixa não tinha nenhuma
-- dimensão de "orçado": só comparava Realizado (caixa) com Projetado
-- (títulos em aberto), nunca com um valor de caixa planejado por mês.
--
-- Reaproveita o mesmo cabeçalho `orcamentos` (mesmo ano/status/fluxo de
-- aprovação) e o mesmo `plano_contas` usado no orçamento de competência,
-- só numa tabela de itens irmã — mesmo shape de orcamento_itens, mesma
-- procedure de escrita (definir_valor_orcamento_caixa espelha
-- definir_valor_orcamento), pra reaproveitar a UI e a lógica de
-- aprovação sem misturar os dois regimes na mesma linha.
-- =========================================
CREATE TABLE IF NOT EXISTS orcamento_caixa_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  orcamento_id CHAR(36) NOT NULL,
  conta_id CHAR(36) NOT NULL,
  mes TINYINT NOT NULL,
  valor DECIMAL(14,2) NOT NULL DEFAULT 0,
  UNIQUE KEY orcamento_caixa_itens_uniq (orcamento_id, conta_id, mes),
  CONSTRAINT chk_orcamento_caixa_itens_mes CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT chk_orcamento_caixa_itens_valor CHECK (valor >= 0),
  CONSTRAINT fk_orcamento_caixa_itens_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_orcamento_caixa_itens_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_orcamento_caixa_itens_conta FOREIGN KEY (conta_id) REFERENCES plano_contas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_orcamento_caixa_itens_loja ON orcamento_caixa_itens (loja_id);
CREATE INDEX idx_orcamento_caixa_itens_orcamento ON orcamento_caixa_itens (orcamento_id);
CREATE INDEX idx_orcamento_caixa_itens_conta ON orcamento_caixa_itens (conta_id);

-- Espelha definir_valor_orcamento (0096): mesma checagem de permissão,
-- status rascunho e conta analítica de receita/despesa da própria loja.
DROP PROCEDURE IF EXISTS definir_valor_orcamento_caixa;
DELIMITER $$
CREATE PROCEDURE definir_valor_orcamento_caixa(
  IN p_orcamento_id CHAR(36), IN p_conta_id CHAR(36), IN p_mes INT, IN p_valor DECIMAL(14,2)
)
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_analitica BOOLEAN;
  DECLARE v_tipo VARCHAR(30);

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT status INTO v_status FROM orcamentos
   WHERE id = p_orcamento_id AND loja_id = @current_loja_id;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado';
  END IF;
  IF v_status <> 'rascunho' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento aprovado não pode ser editado — reabra antes de editar';
  END IF;

  SELECT analitica, tipo INTO v_analitica, v_tipo FROM plano_contas
   WHERE id = p_conta_id AND loja_id = @current_loja_id;
  IF v_analitica IS NULL OR NOT v_analitica OR v_tipo NOT IN ('receita', 'despesa') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta inválida para orçamento — selecione uma conta analítica de receita ou despesa';
  END IF;

  INSERT INTO orcamento_caixa_itens (orcamento_id, conta_id, mes, valor, loja_id)
  VALUES (p_orcamento_id, p_conta_id, p_mes, p_valor, @current_loja_id)
  ON DUPLICATE KEY UPDATE valor = VALUES(valor);
END$$
DELIMITER ;
