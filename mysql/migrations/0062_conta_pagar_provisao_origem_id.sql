-- =========================================
-- Revisão da metodologia contábil (motor de partida dobrada):
-- criar_conta_pagar (0003) grava a provisão contábil ('conta_pagar_provisao')
-- com origem_id = NULL, em vez do id do lançamento operacional recém-criado
-- — diferente da procedure irmã efetivar_recorrentes_vencidas, que usa o
-- mesmo origem_tipo e passa o id corretamente. Sem o vínculo, estornar um
-- lançamento em aberto (estornarLancamento, em
-- src/lib/backend/tesouraria-lancamentos.ts) não encontra a provisão pra
-- apagar junto — o lançamento operacional some, mas a contrapartida
-- contábil (débito despesa / crédito Contas a Pagar) fica órfã pra sempre,
-- inflando despesas e Contas a Pagar em qualquer balancete dali pra frente.
-- Redefine só a chamada de registrar_lancamento_contabil pra passar
-- p_lancamento_id como origem_id, igual o resto do sistema já faz.
-- =========================================
DROP PROCEDURE IF EXISTS criar_conta_pagar;
DELIMITER $$
CREATE PROCEDURE criar_conta_pagar(
  IN p_descricao VARCHAR(500),
  IN p_valor DECIMAL(14,2),
  IN p_plano_conta_id CHAR(36),
  IN p_data DATE,
  IN p_data_vencimento DATE,
  IN p_competencia_mes DATE,
  IN p_terceiro_id CHAR(36),
  IN p_observacoes TEXT,
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_conta_pagar_id CHAR(36);
  DECLARE v_competencia DATE;
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

  SELECT id INTO v_conta_pagar_id FROM plano_contas WHERE codigo = '2.1.01';
  IF v_conta_pagar_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Contas a Pagar" (2.1.01) não encontrada';
  END IF;

  SET v_competencia = COALESCE(p_competencia_mes, mes_competencia(p_data));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
    terceiro_id, pago, competencia_mes, observacoes, criado_por
  ) VALUES (
    p_lancamento_id, p_data, p_data_vencimento, p_descricao, p_valor, 'saida', p_plano_conta_id,
    p_terceiro_id, FALSE, v_competencia, p_observacoes, @current_usuario_id
  );

  CALL registrar_lancamento_contabil(
    p_data, v_competencia, CONCAT('Provisão: ', p_descricao),
    JSON_ARRAY(
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'debito', 'valor', CAST(p_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'credito', 'valor', CAST(p_valor AS DECIMAL(14,2)))
    ),
    'conta_pagar_provisao', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
