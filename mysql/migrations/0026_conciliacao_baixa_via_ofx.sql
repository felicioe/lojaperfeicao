-- =========================================
-- CONCILIAÇÃO — vincular uma linha do extrato OFX a uma fatura/conta a
-- pagar ainda EM ABERTO deve dar baixa nela de verdade (marcar pago,
-- gravar conta/data/forma de pagamento e postar a contrapartida contábil
-- que fecha a provisão), não só marcar a linha do OFX como conciliada.
-- Antes só existia conciliar_ofx_existente, que assume o lançamento do
-- sistema já está pago (é só um "confere que bate com essa linha do
-- extrato") — inútil pro caso real de uso: conciliar as mensalidades em
-- aberto do mês contra os PIX recebidos no extrato.
--
-- A contrapartida contábil segue exatamente o padrão de baixar_faturas/
-- baixar_conta_pagar: só fecha a conta de controle (Contas a Receber
-- 1.1.02 pra entrada, Contas a Pagar 2.1.01 pra saída) contra o banco —
-- a receita/despesa já foi reconhecida na provisão e não é tocada de
-- novo aqui. (Uma tentativa anterior espelhava TODAS as linhas da
-- provisão, o que duplicava a linha de receita/despesa e desbalanceava
-- o lançamento — corrigido pra só fechar a conta de controle, como o
-- resto do sistema já faz.) Lançamento manual (criarLancamentoManual)
-- nunca tem provisão — por design não gera partida dobrada — então pra
-- esses só a baixa em si (pago/conta/data) acontece, sem tentar postar
-- contabilidade.
-- =========================================
DROP PROCEDURE IF EXISTS conciliar_ofx_baixando_lancamento;
DELIMITER $$
CREATE PROCEDURE conciliar_ofx_baixando_lancamento(
  IN p_ofx_id CHAR(36),
  IN p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_ofx_conta_financeira_id CHAR(36);
  DECLARE v_ofx_data DATE;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_lanc_tipo VARCHAR(20);
  DECLARE v_lanc_valor DECIMAL(14,2);
  DECLARE v_lanc_pago BOOLEAN;
  DECLARE v_lanc_desc VARCHAR(500);
  DECLARE v_tem_provisao BOOLEAN;
  DECLARE v_receber_id CHAR(36);
  DECLARE v_pagar_id CHAR(36);
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

  SELECT conta_financeira_id, data INTO v_ofx_conta_financeira_id, v_ofx_data
  FROM ofx_lancamentos WHERE id = p_ofx_id AND NOT conciliado;
  IF v_ofx_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT tipo, valor, pago, descricao INTO v_lanc_tipo, v_lanc_valor, v_lanc_pago, v_lanc_desc
  FROM lancamentos WHERE id = p_lancamento_id;
  IF v_lanc_tipo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento não encontrado';
  END IF;
  IF v_lanc_pago THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento já está pago';
  END IF;
  IF v_lanc_tipo NOT IN ('entrada', 'saida') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Só é possível baixar entradas ou saídas por aqui';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = v_ofx_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  UPDATE lancamentos
  SET pago = TRUE, data_pagamento = v_ofx_data, conta_id = v_ofx_conta_financeira_id,
      forma_pagamento = COALESCE(forma_pagamento, 'Conciliação OFX')
  WHERE id = p_lancamento_id;

  SELECT EXISTS(
    SELECT 1 FROM lancamentos_contabeis
    WHERE origem_id = p_lancamento_id AND origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao')
  ) INTO v_tem_provisao;

  IF v_tem_provisao THEN
    IF v_lanc_tipo = 'entrada' THEN
      SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';
      CALL registrar_lancamento_contabil(
        v_ofx_data, mes_competencia(v_ofx_data), CONCAT('Baixa via conciliação: ', v_lanc_desc),
        JSON_ARRAY(
          JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2))),
          JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2)))
        ),
        'conciliacao_baixa', p_lancamento_id, @lanc_contabil_id
      );
    ELSE
      SELECT id INTO v_pagar_id FROM plano_contas WHERE codigo = '2.1.01';
      CALL registrar_lancamento_contabil(
        v_ofx_data, mes_competencia(v_ofx_data), CONCAT('Baixa via conciliação: ', v_lanc_desc),
        JSON_ARRAY(
          JSON_OBJECT('conta_id', v_pagar_id, 'tipo', 'debito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2))),
          JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2)))
        ),
        'conciliacao_baixa', p_lancamento_id, @lanc_contabil_id
      );
    END IF;
  END IF;

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id WHERE id = p_ofx_id;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
