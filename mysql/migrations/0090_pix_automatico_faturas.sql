-- =============================================================================
-- Migração 0090: PIX automático em novas faturas
--
-- Problema: Faturas criadas via gerar_mensalidades() e criar_fatura_avulsa()
-- não preenchiam forma_cobranca e pix_chave_id. Resultado: QR code não
-- aparecia nas faturas geradas automaticamente (só em faturas editadas
-- manualmente depois).
--
-- Solução: Atualizar ambas as procedures para inserir forma_cobranca='pix'
-- e pix_chave_id=(chave PIX principal de conta ativa) automaticamente.
-- Faturas já emitidas sem PIX continuam sem, mas novas faturas saem
-- com PIX pronto pra usar.
-- =============================================================================

-- ============ Atualizar gerar_mensalidades ============
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
  DECLARE v_pix_chave_id CHAR(36);
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

  -- Busca a chave PIX principal de uma conta ativa
  SELECT id INTO v_pix_chave_id
  FROM contas_financeiras_pix pix
  JOIN contas_financeiras cf ON cf.id = pix.conta_financeira_id
  WHERE cf.ativo = TRUE
  ORDER BY pix.principal DESC, pix.criado_em ASC
  LIMIT 1;

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
        irmao_id, pago, is_mensalidade, competencia_mes, criado_por,
        forma_cobranca, pix_chave_id
      ) VALUES (
        v_lanc_id, CURRENT_DATE, v_venc, v_desc, COALESCE(v_valor_historico, v_valor_mensalidade), 'entrada', v_plano,
        v_id, FALSE, TRUE, v_comp, @current_usuario_id,
        'pix', v_pix_chave_id
      );

      CALL _postar_provisao_fatura(v_lanc_id, COALESCE(v_valor_historico, v_valor_mensalidade), CURRENT_DATE, v_comp, v_desc, p_rateio);

      SET p_total = p_total + 1;
    END IF;
  END LOOP;
  CLOSE cur;
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- ============ Atualizar criar_fatura_avulsa ============
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
  DECLARE v_pix_chave_id CHAR(36);
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

  -- Busca a chave PIX principal de uma conta ativa
  SELECT id INTO v_pix_chave_id
  FROM contas_financeiras_pix pix
  JOIN contas_financeiras cf ON cf.id = pix.conta_financeira_id
  WHERE cf.ativo = TRUE
  ORDER BY pix.principal DESC, pix.criado_em ASC
  LIMIT 1;

  SET v_comp = mes_competencia(p_competencia_mes);
  SET v_desc = COALESCE(p_descricao, CONCAT('Fatura ', DATE_FORMAT(p_competencia_mes, '%m/%Y')));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, irmao_id, plano_conta_id,
    pago, is_mensalidade, competencia_mes, criado_por,
    forma_cobranca, pix_chave_id
  ) VALUES (
    p_lancamento_id, LAST_DAY(v_comp), p_data_vencimento, v_desc, p_valor, 'entrada', p_irmao_id,
    (SELECT id FROM plano_contas WHERE codigo = '4.1.01'),
    FALSE, TRUE, v_comp, @current_usuario_id,
    'pix', v_pix_chave_id
  );

  CALL _postar_provisao_fatura(p_lancamento_id, p_valor, LAST_DAY(v_comp), v_comp, v_desc, p_rateio);
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
