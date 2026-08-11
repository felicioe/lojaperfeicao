-- =========================================
-- Revisão de código pós-auditoria (achados #3 e #4 dessa segunda passada):
--
-- 1) desfazer_conciliacao (0054) apagava lançamentos fabricados DENTRO do
--    loop do cursor, na mesma tabela (conciliacao_lancamentos) que o
--    cursor estava lendo — comportamento não documentado como seguro pelo
--    MySQL/MariaDB para modificação da tabela-base durante FETCH. Ainda
--    que testado empiricamente sem problema, é código financeiro: não faz
--    sentido depender de comportamento não garantido. Reescreve pra só
--    decidir o que fazer dentro do loop e apagar em lote DEPOIS de fechar
--    o cursor.
--
-- 2) desfazer_lancamento_ofx (0060), no caso legado, zerava valor_pago
--    incondicionalmente. conciliar_ofx_baixando_lancamento nunca escreve
--    valor_pago (bug preexistente e apartado, fora do escopo aqui) — se um
--    lançamento já tinha pagamento parcial registrado por outro caminho
--    antes dessa baixa legada, desfazer zerava esse histórico em vez de
--    preservá-lo. Passa a não tocar valor_pago nesse caso (só reverte o
--    que essa baixa em si mudou: pago/data_pagamento/conta_id/forma).
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

    -- O lançamento fabricado (v_criado_pelo_evento) é apagado em lote
    -- DEPOIS de fechar o cursor (abaixo) — não mexe em `lancamentos` nem
    -- em `conciliacao_lancamentos` aqui dentro do loop pra não modificar a
    -- própria tabela que o cursor está lendo.
    IF NOT v_criado_pelo_evento THEN
      IF v_fechou_fatura THEN
        UPDATE lancamentos
        SET valor_pago = valor_pago - v_valor_aplicado,
            pago = FALSE, data_pagamento = NULL, conta_id = NULL, conciliacao_id = NULL,
            forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
        WHERE id = v_lanc_id;
      ELSE
        UPDATE lancamentos SET valor_pago = valor_pago - v_valor_aplicado WHERE id = v_lanc_id;
      END IF;
    END IF;
  END LOOP;
  CLOSE cur;

  -- Lançamentos que só existem por causa deste evento (rateio ou OFX
  -- avulso) — reabri-los deixaria fatura fantasma no nome do irmão. Apaga
  -- primeiro conciliacao_lancamentos (senão a FK de lancamento_id bloqueia
  -- apagar o lançamento), depois os lançamentos em si. Um lançamento
  -- fabricado só tem UMA linha de conciliacao_lancamentos na vida inteira
  -- (criados juntos, 1:1) — depois do primeiro DELETE, "nenhuma linha
  -- restante" identifica exatamente (e só) os que acabamos de processar,
  -- sem precisar reamarrar em p_conciliacao_id de novo.
  DELETE cl FROM conciliacao_lancamentos cl
  JOIN lancamentos_contabeis lc
    ON lc.origem_tipo = 'ofx_importado' AND lc.origem_id = cl.lancamento_id
  WHERE cl.conciliacao_id = p_conciliacao_id;

  DELETE l FROM lancamentos l
  JOIN lancamentos_contabeis lc
    ON lc.origem_tipo = 'ofx_importado' AND lc.origem_id = l.id
  WHERE NOT EXISTS (SELECT 1 FROM conciliacao_lancamentos cl2 WHERE cl2.lancamento_id = l.id);

  UPDATE conciliacoes
  SET status = 'desfeita', desfeita_por = @current_usuario_id, desfeita_em = NOW(), motivo_desfazimento = p_motivo
  WHERE id = p_conciliacao_id;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS desfazer_lancamento_ofx;
DELIMITER $$
CREATE PROCEDURE desfazer_lancamento_ofx(IN p_ofx_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_lancamento_id CHAR(36);
  DECLARE v_conciliacao_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_itens JSON;
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
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT lancamento_id, conciliacao_id, data INTO v_lancamento_id, v_conciliacao_id, v_data
  FROM ofx_lancamentos WHERE id = p_ofx_id AND conciliado = TRUE;
  IF v_lancamento_id IS NULL AND v_conciliacao_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha do extrato não encontrada ou não está conciliada';
  END IF;
  IF v_conciliacao_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta linha faz parte de um evento de conciliação em lote — use desfazer_conciliacao';
  END IF;
  IF periodo_esta_fechado(v_data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, lancamento_id = NULL WHERE id = p_ofx_id;

  SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
  WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lancamento_id
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
      FROM lancamentos_contabeis_itens WHERE lancamento_id = v_lanc_contabil_id
    );
    CALL registrar_lancamento_contabil(
      v_data, mes_competencia(v_data), 'Estorno de lançamento criado via conciliação (desfeito)',
      v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
    );
    DELETE FROM lancamentos WHERE id = v_lancamento_id;
  ELSE
    SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
    WHERE origem_tipo = 'conciliacao_baixa' AND origem_id = v_lancamento_id
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
        FROM lancamentos_contabeis_itens WHERE lancamento_id = v_lanc_contabil_id
      );
      CALL registrar_lancamento_contabil(
        v_data, mes_competencia(v_data), 'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
      );
    END IF;

    -- Não zera valor_pago: conciliar_ofx_baixando_lancamento nunca o
    -- escreve, então o valor que já estava ali (ex.: pagamento parcial
    -- anterior por outro caminho) é histórico legítimo, não algo que essa
    -- baixa criou — só reverte o que ela de fato mudou.
    UPDATE lancamentos
    SET pago = FALSE, data_pagamento = NULL, conta_id = NULL,
        forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
    WHERE id = v_lancamento_id;
  END IF;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
