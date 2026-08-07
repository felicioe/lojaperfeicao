-- =========================================
-- EMISSÃO DE MENSALIDADES/FATURAS = último dia da competência, não a data
-- em que o lote foi rodado no sistema. Antes, gerar_mensalidades e
-- criar_fatura_avulsa gravavam `lancamentos.data` (coluna exibida como
-- "Emissão" em Movimento Financeiro/Visão Geral) como CURRENT_DATE — ao
-- gerar hoje a "Mensalidade 06/2026", a emissão aparecia como a data de
-- hoje em vez de 30/06/2026. LAST_DAY(v_comp) resolve isso (v_comp já é o
-- primeiro dia da competência via mes_competencia()).
--
-- A data da provisão contábil (_postar_provisao_fatura, usada em
-- Balancete/DRE) também passa a ser LAST_DAY(v_comp) pelo mesmo motivo —
-- regime de competência de verdade: a receita é reconhecida no mês a que
-- se refere, não no dia em que alguém rodou o lote/gerou a fatura no
-- sistema. Isso vale tanto pra mensalidades em lote quanto pra faturas
-- avulsas, já que ambas têm competência.
-- =========================================
DROP PROCEDURE IF EXISTS gerar_mensalidades;
DELIMITER $$
CREATE PROCEDURE gerar_mensalidades(
  IN p_competencia DATE,
  IN p_data_vencimento DATE,
  IN p_irmao_id CHAR(36),
  IN p_rateio JSON,
  OUT p_total INT
)
BEGIN
  DECLARE v_plano CHAR(36);
  DECLARE v_venc DATE;
  DECLARE v_comp DATE;
  DECLARE v_desc VARCHAR(500);
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_valor_mensalidade DECIMAL(12,2);
  DECLARE v_valor_historico DECIMAL(12,2);
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT id, valor_mensalidade FROM irmaos
    WHERE situacao IN ('ativo', 'quite', 'irregular') AND valor_mensalidade > 0
      AND (p_irmao_id IS NULL OR id = p_irmao_id);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT id INTO v_plano FROM plano_contas WHERE codigo = '4.1.01';
  IF v_plano IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Mensalidades" (4.1.01) não encontrada';
  END IF;
  SET v_comp = mes_competencia(p_competencia);
  SET v_venc = COALESCE(p_data_vencimento, DATE_ADD(LAST_DAY(v_comp), INTERVAL 7 DAY));
  SET v_desc = CONCAT('Mensalidade ', DATE_FORMAT(p_competencia, '%m/%Y'));
  SET p_total = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id, v_valor_mensalidade;
    IF v_done THEN LEAVE read_loop; END IF;

    IF NOT EXISTS (SELECT 1 FROM lancamentos WHERE is_mensalidade AND irmao_id = v_id AND competencia_mes = v_comp) THEN
      SET v_valor_historico = NULL;
      BEGIN
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_valor_historico = NULL;
        SELECT valor INTO v_valor_historico
        FROM tabela_valores
        WHERE tipo = 'mensalidade' AND org_id IS NULL AND vigencia_inicio <= v_comp
        ORDER BY vigencia_inicio DESC
        LIMIT 1;
      END;

      SET v_lanc_id = UUID();
      INSERT INTO lancamentos (
        id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
        irmao_id, pago, is_mensalidade, competencia_mes, criado_por
      ) VALUES (
        v_lanc_id, LAST_DAY(v_comp), v_venc, v_desc, COALESCE(v_valor_historico, v_valor_mensalidade), 'entrada', v_plano,
        v_id, FALSE, TRUE, v_comp, @current_usuario_id
      );

      CALL _postar_provisao_fatura(v_lanc_id, COALESCE(v_valor_historico, v_valor_mensalidade), LAST_DAY(v_comp), v_comp, v_desc, p_rateio);

      SET p_total = p_total + 1;
    END IF;
  END LOOP;
  CLOSE cur;
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS criar_fatura_avulsa;
DELIMITER $$
CREATE PROCEDURE criar_fatura_avulsa(
  IN p_irmao_id CHAR(36),
  IN p_valor DECIMAL(14,2),
  IN p_competencia_mes DATE,
  IN p_data_vencimento DATE,
  IN p_descricao VARCHAR(500),
  IN p_rateio JSON,
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_desc VARCHAR(500);
  DECLARE v_comp DATE;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;
  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;

  SET v_comp = mes_competencia(p_competencia_mes);
  SET v_desc = COALESCE(p_descricao, CONCAT('Fatura ', DATE_FORMAT(p_competencia_mes, '%m/%Y')));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, irmao_id, plano_conta_id,
    pago, is_mensalidade, competencia_mes, criado_por
  ) VALUES (
    p_lancamento_id, LAST_DAY(v_comp), p_data_vencimento, v_desc, p_valor, 'entrada', p_irmao_id,
    (SELECT id FROM plano_contas WHERE codigo = '4.1.01'),
    FALSE, TRUE, v_comp, @current_usuario_id
  );

  CALL _postar_provisao_fatura(p_lancamento_id, p_valor, LAST_DAY(v_comp), v_comp, v_desc, p_rateio);
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
