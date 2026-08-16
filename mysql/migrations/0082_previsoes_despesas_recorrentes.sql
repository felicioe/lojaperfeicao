-- Despesas recorrentes como previsoes financeiras mensais em regime de caixa.
-- As parcelas futuras alimentam contas a pagar e fluxo de caixa, mas somente
-- o pagamento confirmado gera contabilizacao.

SET @sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'lancamentos'
      AND column_name = 'valor_previsto'
  ),
  'SELECT 1',
  'ALTER TABLE lancamentos ADD COLUMN valor_previsto DECIMAL(14,2) NULL AFTER valor'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'lancamentos'
      AND column_name = 'valor_efetivo_confirmado'
  ),
  'SELECT 1',
  'ALTER TABLE lancamentos ADD COLUMN valor_efetivo_confirmado BOOLEAN NOT NULL DEFAULT TRUE AFTER valor_previsto'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Parcelas recorrentes antigas ja baixadas sao efetivas. As ainda abertas
-- permanecem como previsao ate confirmacao expressa do valor.
UPDATE lancamentos
SET valor_previsto = valor,
    valor_efetivo_confirmado = pago
WHERE recorrente_id IS NOT NULL
  AND valor_previsto IS NULL;

DROP PROCEDURE IF EXISTS gerar_previsoes_recorrentes;
DELIMITER $$
CREATE PROCEDURE gerar_previsoes_recorrentes(IN p_ate DATE, OUT p_total INT)
BEGIN
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_descricao VARCHAR(500);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_plano_conta_id CHAR(36);
  DECLARE v_terceiro_id CHAR(36);
  DECLARE v_dia INT;
  DECLARE v_inicio DATE;
  DECLARE v_fim DATE;
  DECLARE v_observacoes TEXT;
  DECLARE v_competencia DATE;
  DECLARE v_limite DATE;
  DECLARE v_vencimento DATE;
  DECLARE cur CURSOR FOR
    SELECT id, descricao, valor, plano_conta_id, terceiro_id,
           dia_vencimento, data_inicio, data_fim, observacoes
    FROM despesas_recorrentes
    WHERE ativo = TRUE;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  SET p_total = 0;
  SET p_ate = COALESCE(p_ate, DATE_ADD(CURRENT_DATE, INTERVAL 11 MONTH));

  OPEN cur;
  recorrencias: LOOP
    FETCH cur INTO v_id, v_descricao, v_valor, v_plano_conta_id,
      v_terceiro_id, v_dia, v_inicio, v_fim, v_observacoes;
    IF v_done THEN LEAVE recorrencias; END IF;

    SET v_competencia = GREATEST(
      DATE_FORMAT(v_inicio, '%Y-%m-01'),
      DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
    );
    SET v_limite = LEAST(
      DATE_FORMAT(p_ate, '%Y-%m-01'),
      COALESCE(DATE_FORMAT(v_fim, '%Y-%m-01'), DATE_FORMAT(p_ate, '%Y-%m-01'))
    );
    IF DATE_ADD(v_competencia, INTERVAL (v_dia - 1) DAY) < v_inicio THEN
      SET v_competencia = DATE_ADD(v_competencia, INTERVAL 1 MONTH);
    END IF;

    -- Atualiza os dados das parcelas futuras. O valor efetivo ja confirmado
    -- e preservado; o novo valor do modelo passa a ser apenas a previsao.
    UPDATE lancamentos l
    SET l.descricao = v_descricao,
        l.valor = IF(l.valor_efetivo_confirmado, l.valor, v_valor),
        l.valor_previsto = v_valor,
        l.plano_conta_id = v_plano_conta_id,
        l.terceiro_id = v_terceiro_id,
        l.data_vencimento = DATE_ADD(l.competencia_mes, INTERVAL (v_dia - 1) DAY),
        l.observacoes = v_observacoes
    WHERE l.recorrente_id = v_id
      AND l.pago = FALSE
      AND l.competencia_mes >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01');

    WHILE v_competencia <= v_limite DO
      SET v_vencimento = DATE_ADD(v_competencia, INTERVAL (v_dia - 1) DAY);
      IF v_fim IS NULL OR v_vencimento <= v_fim THEN
        INSERT IGNORE INTO lancamentos (
          data, data_vencimento, descricao, valor, valor_previsto,
          valor_efetivo_confirmado, tipo, plano_conta_id, terceiro_id,
          recorrente_id, pago, competencia_mes, observacoes
        ) VALUES (
          v_competencia, v_vencimento, v_descricao, v_valor, v_valor,
          FALSE, 'saida', v_plano_conta_id, v_terceiro_id,
          v_id, FALSE, v_competencia, v_observacoes
        );
        SET p_total = p_total + ROW_COUNT();
      END IF;
      SET v_competencia = DATE_ADD(v_competencia, INTERVAL 1 MONTH);
    END WHILE;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

-- Compatibilidade com o botao e integracoes anteriores.
DROP PROCEDURE IF EXISTS efetivar_recorrentes_vencidas;
DELIMITER $$
CREATE PROCEDURE efetivar_recorrentes_vencidas(OUT p_total INT)
BEGIN
  CALL gerar_previsoes_recorrentes(DATE_ADD(CURRENT_DATE, INTERVAL 11 MONTH), p_total);
END$$
DELIMITER ;

CALL gerar_previsoes_recorrentes(DATE_ADD(CURRENT_DATE, INTERVAL 11 MONTH), @previsoes_criadas);
SELECT @previsoes_criadas AS previsoes_criadas;
