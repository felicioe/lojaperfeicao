-- =============================================================================
-- Migração 0134: criar_conta_pagar valida terceiro_id da loja atual (achado
-- da auditoria geral — mesma classe já corrigida em editarContaPagar e em
-- criarReciboAvulso)
--
-- CONTEXTO. criar_conta_pagar (0104_parametros_contabeis.sql) já valida
-- p_plano_conta_id contra @current_loja_id, mas nunca validou p_terceiro_id —
-- um id de terceiro de outra loja era gravado direto em
-- lancamentos.terceiro_id sem nenhuma checagem, tanto na procedure quanto na
-- camada TypeScript (tesouraria-contas-pagar.ts: criarContaPagar), ao
-- contrário de editarContaPagar, que já confere terceiro_id nesta loja antes
-- de gravar.
-- =============================================================================

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
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;
  -- A conta de despesa vem do formulário: sem conferir a loja, dava pra
  -- provisionar a despesa contra o plano de contas do vizinho.
  IF NOT EXISTS (
    SELECT 1 FROM plano_contas WHERE id = p_plano_conta_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta contábil não encontrada nesta loja';
  END IF;
  -- Mesma checagem: terceiro_id também vem do formulário, sem constraint de
  -- loja na FK (fk_lancamentos_terceiro só exige que o id exista em
  -- terceiros, não que seja da mesma loja).
  IF p_terceiro_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM terceiros WHERE id = p_terceiro_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Terceiro não encontrado nesta loja';
  END IF;

  SET v_conta_pagar_id = conta_parametro('fornecedores');

  SET v_competencia = COALESCE(p_competencia_mes, mes_competencia(p_data));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
    terceiro_id, pago, competencia_mes, observacoes, criado_por, loja_id
  ) VALUES (
    p_lancamento_id, p_data, p_data_vencimento, p_descricao, p_valor, 'saida', p_plano_conta_id,
    p_terceiro_id, FALSE, v_competencia, p_observacoes, @current_usuario_id, @current_loja_id
  );

  CALL registrar_lancamento_contabil(
    p_data, v_competencia, CONCAT('Provisão: ', p_descricao),
    JSON_ARRAY(
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'debito', 'valor', CAST(p_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'credito', 'valor', CAST(p_valor AS DECIMAL(14,2)))
    ),
    'conta_pagar_provisao', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$
DELIMITER ;
