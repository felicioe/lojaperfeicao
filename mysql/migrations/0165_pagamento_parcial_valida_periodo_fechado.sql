-- =============================================================================
-- Migração 0165: baixar_pagamento_parcial valida período fechado (issue #734)
--
-- CONTEXTO. Achado da revisão do módulo financeiro/contábil solicitada pelo
-- usuário em 2026-10-05/06, logo depois das PRs #732/#733.
--
-- O trigger trg_lancamentos_bloqueia_periodo_fechado_update (0059) só checa
-- periodo_esta_fechado(NEW.data_pagamento) quando data_pagamento de fato
-- muda (OLD.data_pagamento IS NULL OR OLD.data_pagamento <> NEW.data_pagamento).
-- Em baixar_pagamento_parcial, quando o pagamento aplicado NÃO fecha a
-- fatura inteira (v_fecha = FALSE), o UPDATE em lancamentos mantém
-- data_pagamento = data_pagamento (IF(v_fecha, p_data_pagamento,
-- data_pagamento)) — então o trigger nunca dispara nesse caminho. A
-- procedure também nunca chamava periodo_esta_fechado diretamente, e logo
-- em seguida lançava o contábil (registrar_lancamento_contabil) com
-- p_data_pagamento incondicionalmente. Resultado: um pagamento parcial
-- comum com data retroativa dentro de um mês/exercício já fechado passava
-- sem bloqueio nenhum — ao contrário do mesmo pagamento se ele fechasse a
-- fatura inteira (aí sim bloqueado, porque data_pagamento muda).
--
-- CORREÇÃO. Checagem explícita de periodo_esta_fechado(p_data_pagamento) no
-- início da procedure, recusando a operação sempre que a data informada cair
-- num período fechado — igual ao padrão já usado em estornarLancamento e
-- nas demais procedures de baixa (baixar_faturas/baixar_conta_pagar). Não
-- depende mais de a baixa fechar ou não a fatura, porque o contábil é
-- sempre lançado com essa data.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS baixar_pagamento_parcial$$
CREATE PROCEDURE baixar_pagamento_parcial(
  IN p_alocacao JSON,
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE,
  IN p_observacoes TEXT,
  OUT p_recibo_id CHAR(36)
)
BEGIN
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_n_irmaos INT;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_receber_id CHAR(36);
  DECLARE v_total DECIMAL(14,2) DEFAULT 0;
  DECLARE v_qtd_alocacao INT;
  DECLARE v_qtd_distintos INT;
  DECLARE v_qtd_validos INT;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_valor_fatura DECIMAL(14,2);
  DECLARE v_valor_pago_atual DECIMAL(14,2);
  DECLARE v_novo_valor_pago DECIMAL(14,2);
  DECLARE v_fecha BOOLEAN;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT jt.lancamento_id, jt.valor, l.valor, l.valor_pago
    FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
    JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;

  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_alocacao IS NULL OR JSON_LENGTH(p_alocacao) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe ao menos uma fatura e o valor a aplicar';
  END IF;
  IF periodo_esta_fechado(p_data_pagamento) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este pagamento cai num período/exercício contábil já encerrado — reabra o fechamento antes de baixar.';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT lancamento_id) INTO v_qtd_alocacao, v_qtd_distintos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt;
  IF v_qtd_distintos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A mesma fatura não pode aparecer duas vezes na alocação';
  END IF;

  SELECT id FROM lancamentos
  WHERE loja_id = @current_loja_id
    AND id IN (SELECT lancamento_id FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt)
  FOR UPDATE;

  SELECT COUNT(DISTINCT l.irmao_id), MIN(l.irmao_id) INTO v_n_irmaos, v_irmao_id
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id;
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;

  -- Fatura de outra Loja não casa no JOIN e cai fora da contagem de válidos,
  -- então a alocação inteira é recusada — que é o comportamento certo.
  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id
  WHERE l.tipo = 'entrada' AND l.pago = FALSE AND jt.valor > 0 AND jt.valor <= (l.valor - l.valor_pago);
  IF v_qtd_validos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura já está paga, não é desta loja, não é uma fatura em aberto, ou o valor aplicado é inválido (deve ser maior que zero e não passar do saldo)';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = p_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não é desta loja ou não tem conta do plano de contas vinculada';
  END IF;

  SELECT COALESCE(SUM(jt.valor), 0) INTO v_total
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(valor DECIMAL(14,2) PATH '$.valor')) jt;

  SET v_receber_id = conta_parametro_opcional('contas_a_receber');

  SET p_recibo_id = UUID();
  INSERT INTO recibos (id, irmao_id, data, valor_original, valor_total, forma_pagamento, conta_financeira_id, observacoes, criado_por, loja_id)
  VALUES (p_recibo_id, v_irmao_id, p_data_pagamento, v_total, v_total, p_forma_pagamento, p_conta_financeira_id, p_observacoes, @current_usuario_id, @current_loja_id);

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  loop_alocacao: LOOP
    FETCH cur INTO v_lanc_id, v_valor_aplicado, v_valor_fatura, v_valor_pago_atual;
    IF v_done THEN LEAVE loop_alocacao; END IF;

    INSERT INTO recibo_itens (recibo_id, lancamento_id, valor_original, loja_id)
    VALUES (p_recibo_id, v_lanc_id, v_valor_aplicado, @current_loja_id);

    SET v_novo_valor_pago = v_valor_pago_atual + v_valor_aplicado;
    SET v_fecha = (v_novo_valor_pago >= v_valor_fatura);

    UPDATE lancamentos
    SET valor_pago = v_novo_valor_pago,
        pago = v_fecha,
        data_pagamento = IF(v_fecha, p_data_pagamento, data_pagamento),
        conta_id = IF(v_fecha, p_conta_financeira_id, conta_id),
        forma_pagamento = IF(v_fecha, p_forma_pagamento, forma_pagamento),
        recibo_id = IF(v_fecha, p_recibo_id, recibo_id)
    WHERE id = v_lanc_id AND loja_id = @current_loja_id;
  END LOOP;
  CLOSE cur;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento),
    'Recibo (pagamento parcial)',
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_total AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_total AS DECIMAL(14,2)))
    ),
    'recibo_baixa_parcial', p_recibo_id, @lanc_contabil_id
  );

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
