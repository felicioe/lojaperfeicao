-- Achado #532 da auditoria completa (área "Código morto e dívida técnica"):
-- a fórmula de multa/juros vivia duplicada em dois lugares — a procedure
-- calcular_multa_juros (0096) e o SQL inline de relatorioInadimplenciaDetalhado
-- (src/lib/backend/relatorios.ts), com um comentário no código já avisando
-- "se a fórmula da procedure mudar, atualizar aqui também". Extrai a fórmula
-- pras duas funções abaixo, que passam a ser a única fonte de verdade —
-- calcular_multa_juros e o relatório de inadimplência consultam as duas.

DELIMITER $$

DROP FUNCTION IF EXISTS calcular_valor_multa$$
CREATE FUNCTION calcular_valor_multa(p_valor DECIMAL(14,2), p_dias_atraso INT)
RETURNS DECIMAL(14,2)
  READS SQL DATA
BEGIN
  DECLARE v_multa_ativa BOOLEAN DEFAULT FALSE;
  DECLARE v_multa_percentual DECIMAL(5,2) DEFAULT 0;
  IF p_dias_atraso <= 0 THEN RETURN 0; END IF;
  SELECT multa_ativa, multa_percentual INTO v_multa_ativa, v_multa_percentual
    FROM parametros_financeiros WHERE loja_id = @current_loja_id;
  IF NOT v_multa_ativa THEN RETURN 0; END IF;
  RETURN ROUND(p_valor * v_multa_percentual / 100, 2);
END$$

DROP FUNCTION IF EXISTS calcular_valor_juros$$
CREATE FUNCTION calcular_valor_juros(p_valor DECIMAL(14,2), p_dias_atraso INT)
RETURNS DECIMAL(14,2)
  READS SQL DATA
BEGIN
  DECLARE v_juros_ativo BOOLEAN DEFAULT FALSE;
  DECLARE v_juros_diario_percentual DECIMAL(6,4) DEFAULT 0;
  IF p_dias_atraso <= 0 THEN RETURN 0; END IF;
  SELECT juros_ativo, juros_diario_percentual INTO v_juros_ativo, v_juros_diario_percentual
    FROM parametros_financeiros WHERE loja_id = @current_loja_id;
  IF NOT v_juros_ativo THEN RETURN 0; END IF;
  RETURN ROUND(p_valor * v_juros_diario_percentual / 100 * p_dias_atraso, 2);
END$$

-- calcular_multa_juros passa a delegar às funções acima em vez de repetir a
-- fórmula — mesma assinatura e mesmo comportamento de antes (0096), só a
-- implementação interna muda.
DROP PROCEDURE IF EXISTS calcular_multa_juros$$
CREATE PROCEDURE calcular_multa_juros(
  IN p_valor DECIMAL(14,2),
  IN p_vencimento DATE,
  IN p_data_referencia DATE,
  OUT p_multa DECIMAL(14,2),
  OUT p_juros DECIMAL(14,2),
  OUT p_dias_atraso INT,
  OUT p_total DECIMAL(14,2)
)
BEGIN
  SET p_dias_atraso = GREATEST(0, DATEDIFF(p_data_referencia, p_vencimento));
  SET p_multa = calcular_valor_multa(p_valor, p_dias_atraso);
  SET p_juros = calcular_valor_juros(p_valor, p_dias_atraso);
  SET p_total = p_valor + p_multa + p_juros;
END$$

DELIMITER ;
