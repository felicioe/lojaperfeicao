-- Corrige o estado financeiro ao desfazer uma baixa OFX e repara o lote
-- comprovado de mensalidades 12/2025. Preserva baixa e estorno contábeis.
DELIMITER $$

DROP PROCEDURE IF EXISTS desfazer_lancamento_ofx$$
CREATE PROCEDURE desfazer_lancamento_ofx(IN p_ofx_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_lancamento_id CHAR(36);
  DECLARE v_conciliacao_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_itens JSON;
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
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT lancamento_id, conciliacao_id, data INTO v_lancamento_id, v_conciliacao_id, v_data
  FROM ofx_lancamentos
  WHERE id = p_ofx_id AND conciliado = TRUE AND loja_id = @current_loja_id;
  IF v_lancamento_id IS NULL AND v_conciliacao_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha do extrato não encontrada ou não está conciliada';
  END IF;
  IF v_conciliacao_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta linha faz parte de um evento de conciliação em lote — use desfazer_conciliacao';
  END IF;
  IF periodo_esta_fechado(v_data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, lancamento_id = NULL
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;

  SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
  WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lancamento_id AND loja_id = @current_loja_id
  LIMIT 1;

  IF v_lanc_contabil_id IS NOT NULL THEN
    SET v_itens = (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'conta_id', conta_id,
          'tipo', IF(tipo = 'debito', 'credito', 'debito'),
          'valor', valor,
          'descricao', descricao
        )
      )
      FROM lancamentos_contabeis_itens
      WHERE lancamento_id = v_lanc_contabil_id AND loja_id = @current_loja_id
    );
    CALL registrar_lancamento_contabil(
      v_data, mes_competencia(v_data), 'Estorno de lançamento criado via conciliação (desfeito)',
      v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
    );
    DELETE FROM lancamentos WHERE id = v_lancamento_id AND loja_id = @current_loja_id;
  ELSE
    SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
    WHERE origem_tipo = 'conciliacao_baixa' AND origem_id = v_lancamento_id AND loja_id = @current_loja_id
    LIMIT 1;

    IF v_lanc_contabil_id IS NOT NULL THEN
      SET v_itens = (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'conta_id', conta_id,
            'tipo', IF(tipo = 'debito', 'credito', 'debito'),
            'valor', valor,
            'descricao', descricao
          )
        )
        FROM lancamentos_contabeis_itens
        WHERE lancamento_id = v_lanc_contabil_id AND loja_id = @current_loja_id
      );
      CALL registrar_lancamento_contabil(
        v_data, mes_competencia(v_data), 'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
      );
    END IF;

    UPDATE lancamentos
    SET pago = FALSE,
        valor_pago = CASE WHEN valor_pago >= valor THEN 0 ELSE valor_pago END,
        data_pagamento = NULL, conta_id = NULL,
        forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
    WHERE id = v_lancamento_id AND loja_id = @current_loja_id;
  END IF;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS conciliar_ofx_baixando_lancamento$$
CREATE PROCEDURE conciliar_ofx_baixando_lancamento(
  IN p_ofx_id CHAR(36),
  IN p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_ofx_conta_financeira_id CHAR(36);
  DECLARE v_ofx_data DATE;
  DECLARE v_ofx_valor DECIMAL(14,2);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_lanc_tipo VARCHAR(20);
  DECLARE v_lanc_valor DECIMAL(14,2);
  DECLARE v_lanc_valor_pago DECIMAL(14,2);
  DECLARE v_lanc_pago BOOLEAN;
  DECLARE v_lanc_desc VARCHAR(500);
  DECLARE v_tem_provisao BOOLEAN;
  DECLARE v_receber_id CHAR(36);
  DECLARE v_pagar_id CHAR(36);
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

  SELECT conta_financeira_id, data, valor
    INTO v_ofx_conta_financeira_id, v_ofx_data, v_ofx_valor
  FROM ofx_lancamentos
  WHERE id = p_ofx_id AND NOT conciliado AND loja_id = @current_loja_id;
  IF v_ofx_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT tipo, valor, valor_pago, pago, descricao
    INTO v_lanc_tipo, v_lanc_valor, v_lanc_valor_pago, v_lanc_pago, v_lanc_desc
  FROM lancamentos WHERE id = p_lancamento_id AND loja_id = @current_loja_id;
  IF v_lanc_tipo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento não encontrado';
  END IF;
  IF v_lanc_pago THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento já está pago';
  END IF;
  IF v_lanc_valor_pago > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento já possui pagamento parcial; use a conciliação com alocação';
  END IF;
  IF v_lanc_tipo NOT IN ('entrada', 'saida') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Só é possível baixar entradas ou saídas por aqui';
  END IF;
  IF ABS(v_ofx_valor) <> v_lanc_valor THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O valor do OFX precisa ser igual ao valor integral do lançamento';
  END IF;
  IF (v_lanc_tipo = 'entrada' AND v_ofx_valor < 0)
     OR (v_lanc_tipo = 'saida' AND v_ofx_valor > 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A natureza da linha OFX não corresponde ao tipo do lançamento';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = v_ofx_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  UPDATE lancamentos
  SET pago = TRUE, valor_pago = valor, data_pagamento = v_ofx_data,
      conta_id = v_ofx_conta_financeira_id,
      forma_pagamento = COALESCE(forma_pagamento, 'Conciliação OFX')
  WHERE id = p_lancamento_id AND loja_id = @current_loja_id;

  SELECT EXISTS(
    SELECT 1 FROM lancamentos_contabeis
    WHERE origem_id = p_lancamento_id AND loja_id = @current_loja_id
      AND origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao')
  ) INTO v_tem_provisao;

  IF v_tem_provisao THEN
    IF v_lanc_tipo = 'entrada' THEN
      SELECT id INTO v_receber_id FROM plano_contas
       WHERE codigo = '1.1.02' AND loja_id = @current_loja_id;
      CALL registrar_lancamento_contabil(
        v_ofx_data, mes_competencia(v_ofx_data), CONCAT('Baixa via conciliação: ', v_lanc_desc),
        JSON_ARRAY(
          JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2))),
          JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2)))
        ),
        'conciliacao_baixa', p_lancamento_id, @lanc_contabil_id
      );
    ELSE
      SELECT id INTO v_pagar_id FROM plano_contas
       WHERE codigo = '2.1.01' AND loja_id = @current_loja_id;
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

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$

-- Repara exclusivamente as 13 mensalidades 12/2025 cuja baixa OFX já foi
-- estornada contabilmente, mas que conservaram valor_pago = valor.
DROP PROCEDURE IF EXISTS aplicar_correcao_0101$$
CREATE PROCEDURE aplicar_correcao_0101()
BEGIN
  DECLARE v_validos INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;

  SELECT COUNT(*) INTO v_validos
  FROM lancamentos l
  WHERE l.id IN (
      'c9ec9cf4-9288-11f1-83e7-26dde4dfafcf',
      'c9ebbf89-9288-11f1-83e7-26dde4dfafcf',
      'c9eb9dd6-9288-11f1-83e7-26dde4dfafcf',
      'c9ee0be4-9288-11f1-83e7-26dde4dfafcf',
      'c9ec27c6-9288-11f1-83e7-26dde4dfafcf',
      'c9ed134e-9288-11f1-83e7-26dde4dfafcf',
      'c9edf7b7-9288-11f1-83e7-26dde4dfafcf',
      'c9ee2841-9288-11f1-83e7-26dde4dfafcf',
      'c9ecfe1a-9288-11f1-83e7-26dde4dfafcf',
      'c9ec4e71-9288-11f1-83e7-26dde4dfafcf',
      'c9ece989-9288-11f1-83e7-26dde4dfafcf',
      'c9ec3ad8-9288-11f1-83e7-26dde4dfafcf',
      'c9ec897c-9288-11f1-83e7-26dde4dfafcf'
    )
    AND l.is_mensalidade = TRUE
    AND l.competencia_mes = '2025-12-01'
    AND l.valor = 70.00
    AND l.valor_pago = 70.00
    AND l.pago = FALSE
    AND l.data_pagamento IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM recibo_itens ri
       WHERE ri.loja_id = l.loja_id AND ri.lancamento_id = l.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_lancamentos cl
       WHERE cl.loja_id = l.loja_id AND cl.lancamento_id = l.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM ofx_lancamentos o
       WHERE o.loja_id = l.loja_id AND o.lancamento_id = l.id
    )
    AND 1 = (
      SELECT COUNT(*) FROM lancamentos_contabeis lc
       WHERE lc.loja_id = l.loja_id AND lc.origem_id = l.id
         AND lc.origem_tipo = 'conciliacao_baixa'
    )
    AND 1 = (
      SELECT COUNT(*) FROM lancamentos_contabeis lc
       WHERE lc.loja_id = l.loja_id AND lc.origem_id = l.id
         AND lc.origem_tipo = 'conciliacao_estorno'
    );

  IF v_validos <> 13 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Correção 0101 cancelada: os 13 registros não passaram em todas as validações';
  END IF;

  INSERT INTO auditoria
    (loja_id, usuario_id, acao, entidade_tipo, entidade_id, dados_antes, dados_depois)
  SELECT
    l.loja_id, NULL, 'corrigir_valor_pago_estorno', 'lancamentos', l.id,
    JSON_OBJECT('pago', l.pago, 'valor_pago', l.valor_pago),
    JSON_OBJECT('pago', FALSE, 'valor_pago', 0)
  FROM lancamentos l
  WHERE l.id IN (
      'c9ec9cf4-9288-11f1-83e7-26dde4dfafcf',
      'c9ebbf89-9288-11f1-83e7-26dde4dfafcf',
      'c9eb9dd6-9288-11f1-83e7-26dde4dfafcf',
      'c9ee0be4-9288-11f1-83e7-26dde4dfafcf',
      'c9ec27c6-9288-11f1-83e7-26dde4dfafcf',
      'c9ed134e-9288-11f1-83e7-26dde4dfafcf',
      'c9edf7b7-9288-11f1-83e7-26dde4dfafcf',
      'c9ee2841-9288-11f1-83e7-26dde4dfafcf',
      'c9ecfe1a-9288-11f1-83e7-26dde4dfafcf',
      'c9ec4e71-9288-11f1-83e7-26dde4dfafcf',
      'c9ece989-9288-11f1-83e7-26dde4dfafcf',
      'c9ec3ad8-9288-11f1-83e7-26dde4dfafcf',
      'c9ec897c-9288-11f1-83e7-26dde4dfafcf'
    );

  UPDATE lancamentos
  SET valor_pago = 0
  WHERE id IN (
      'c9ec9cf4-9288-11f1-83e7-26dde4dfafcf',
      'c9ebbf89-9288-11f1-83e7-26dde4dfafcf',
      'c9eb9dd6-9288-11f1-83e7-26dde4dfafcf',
      'c9ee0be4-9288-11f1-83e7-26dde4dfafcf',
      'c9ec27c6-9288-11f1-83e7-26dde4dfafcf',
      'c9ed134e-9288-11f1-83e7-26dde4dfafcf',
      'c9edf7b7-9288-11f1-83e7-26dde4dfafcf',
      'c9ee2841-9288-11f1-83e7-26dde4dfafcf',
      'c9ecfe1a-9288-11f1-83e7-26dde4dfafcf',
      'c9ec4e71-9288-11f1-83e7-26dde4dfafcf',
      'c9ece989-9288-11f1-83e7-26dde4dfafcf',
      'c9ec3ad8-9288-11f1-83e7-26dde4dfafcf',
      'c9ec897c-9288-11f1-83e7-26dde4dfafcf'
    );

  COMMIT;
END$$

CALL aplicar_correcao_0101()$$
DROP PROCEDURE IF EXISTS aplicar_correcao_0101$$

DELIMITER ;

SELECT
  COUNT(*) AS faturas_corrigidas,
  COALESCE(SUM(valor - valor_pago), 0) AS saldo_reaberto
FROM lancamentos
WHERE id IN (
  'c9ec9cf4-9288-11f1-83e7-26dde4dfafcf',
  'c9ebbf89-9288-11f1-83e7-26dde4dfafcf',
  'c9eb9dd6-9288-11f1-83e7-26dde4dfafcf',
  'c9ee0be4-9288-11f1-83e7-26dde4dfafcf',
  'c9ec27c6-9288-11f1-83e7-26dde4dfafcf',
  'c9ed134e-9288-11f1-83e7-26dde4dfafcf',
  'c9edf7b7-9288-11f1-83e7-26dde4dfafcf',
  'c9ee2841-9288-11f1-83e7-26dde4dfafcf',
  'c9ecfe1a-9288-11f1-83e7-26dde4dfafcf',
  'c9ec4e71-9288-11f1-83e7-26dde4dfafcf',
  'c9ece989-9288-11f1-83e7-26dde4dfafcf',
  'c9ec3ad8-9288-11f1-83e7-26dde4dfafcf',
  'c9ec897c-9288-11f1-83e7-26dde4dfafcf'
)
  AND pago = FALSE
  AND valor_pago = 0;
