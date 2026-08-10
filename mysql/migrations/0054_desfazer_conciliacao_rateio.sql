-- =========================================
-- CORRIGE desfazer_conciliacao — "faturas fantasma" ao desfazer um rateio
-- (achado #4 da auditoria financeira geral).
--
-- criar_lancamentos_de_ofx_rateado (0049) e criar_lancamento_de_ofx (0048)
-- CRIAM lançamentos novos (já pagos) a partir de uma linha do extrato —
-- eles não existiam antes. desfazer_conciliacao (0046/0048), porém,
-- sempre tratava todo item de conciliacao_lancamentos como se fosse uma
-- fatura PRÉ-EXISTENTE sendo baixada (conciliar_ofx_lote), reabrindo-a
-- como "em aberto" em vez de apagá-la — deixando uma dívida fictícia no
-- nome do irmão depois de desfazer um rateio.
--
-- O sinal que distingue os dois casos já existe: lançamentos criados por
-- importação de OFX (avulso ou rateado) têm um lancamentos_contabeis com
-- origem_tipo='ofx_importado' apontando pra eles (ver 0048 linha ~411 e
-- 0049 linha ~139); baixa de fatura pré-existente usa origem_tipo=
-- 'conciliacao_baixa' (0048). Mesmo sinal que desfazer_lancamento_ofx
-- (0053) já usa pro caso avulso — aqui é o mesmo tratamento pro caso em
-- lote/rateado, que passa por conciliacao_lancamentos.
-- =========================================
DROP PROCEDURE IF EXISTS desfazer_conciliacao;
DELIMITER $$
CREATE PROCEDURE desfazer_conciliacao(IN p_conciliacao_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_data_conciliacao DATE;
  DECLARE v_status VARCHAR(20);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_fechou_fatura BOOLEAN;
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_estorno_id CHAR(36);
  DECLARE v_itens JSON;
  DECLARE v_bloqueado INT;
  DECLARE v_criado_pelo_evento BOOLEAN;
  DECLARE cur CURSOR FOR
    SELECT lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id
    FROM conciliacao_lancamentos WHERE conciliacao_id = p_conciliacao_id;
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
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT data_conciliacao, status INTO v_data_conciliacao, v_status
  FROM conciliacoes WHERE id = p_conciliacao_id;
  IF v_data_conciliacao IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conciliação não encontrada';
  END IF;
  IF v_status <> 'ativa' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conciliação já foi desfeita';
  END IF;
  IF periodo_esta_fechado(v_data_conciliacao) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  -- Bloqueia se alguma fatura deste evento recebeu contribuição
  -- POSTERIOR de outro evento de conciliação ainda ativo OU de um
  -- pagamento parcial manual (baixar_pagamento_parcial, que só grava em
  -- recibo_itens/recibos — não aparece em conciliacao_lancamentos).
  SELECT COUNT(*) INTO v_bloqueado
  FROM conciliacao_lancamentos cl
  WHERE cl.conciliacao_id = p_conciliacao_id
  AND (
    EXISTS (
      SELECT 1 FROM conciliacao_lancamentos cl2
      JOIN conciliacoes c2 ON c2.id = cl2.conciliacao_id AND c2.status = 'ativa'
      WHERE cl2.lancamento_id = cl.lancamento_id AND cl2.criado_em > cl.criado_em
    )
    OR EXISTS (
      SELECT 1 FROM recibo_itens ri
      JOIN recibos r ON r.id = ri.recibo_id
      WHERE ri.lancamento_id = cl.lancamento_id AND r.criado_em > cl.criado_em
    )
  );
  IF v_bloqueado > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma ou mais faturas desta conciliação já receberam outro pagamento depois (conciliação ou baixa manual) — desfaça primeiro o pagamento mais recente dessas faturas';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, conciliacao_id = NULL
  WHERE conciliacao_id = p_conciliacao_id;

  OPEN cur;
  loop_cl: LOOP
    FETCH cur INTO v_lanc_id, v_valor_aplicado, v_fechou_fatura, v_lanc_contabil_id;
    IF v_done THEN LEAVE loop_cl; END IF;

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
        FROM lancamentos_contabeis_itens WHERE lancamento_id = v_lanc_contabil_id
      );
      CALL registrar_lancamento_contabil(
        v_data_conciliacao, mes_competencia(v_data_conciliacao),
        'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lanc_id, v_estorno_id
      );
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM lancamentos_contabeis
      WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lanc_id
    ) INTO v_criado_pelo_evento;

    IF v_criado_pelo_evento THEN
      -- O lançamento só existe por causa deste evento (rateio ou OFX
      -- avulso) — reabri-lo deixaria uma fatura fantasma no nome do
      -- irmão. Apaga a linha de conciliacao_lancamentos primeiro pra não
      -- violar a FK antes de apagar o próprio lançamento.
      DELETE FROM conciliacao_lancamentos
      WHERE conciliacao_id = p_conciliacao_id AND lancamento_id = v_lanc_id;
      DELETE FROM lancamentos WHERE id = v_lanc_id;
    ELSEIF v_fechou_fatura THEN
      UPDATE lancamentos
      SET valor_pago = valor_pago - v_valor_aplicado,
          pago = FALSE, data_pagamento = NULL, conta_id = NULL, conciliacao_id = NULL,
          forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
      WHERE id = v_lanc_id;
    ELSE
      UPDATE lancamentos SET valor_pago = valor_pago - v_valor_aplicado WHERE id = v_lanc_id;
    END IF;
  END LOOP;
  CLOSE cur;

  UPDATE conciliacoes
  SET status = 'desfeita', desfeita_por = @current_usuario_id, desfeita_em = NOW(), motivo_desfazimento = p_motivo
  WHERE id = p_conciliacao_id;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
