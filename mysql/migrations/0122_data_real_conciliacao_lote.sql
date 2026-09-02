-- =============================================================================
-- conciliar_ofx_lote: a baixa de cada fatura passa a ser datada pela data
-- real do crédito/débito bancário que a completou, não pela data em que o
-- lote foi processado (achado do usuário: um lote que fecha vários meses
-- atrasados de uma vez com Pix de meses diferentes datava tudo pelo dia do
-- processamento, escondendo em que mês o dinheiro realmente entrou — ex.:
-- Alexandre Krieger, 7 mensalidades de meses diferentes todas datadas
-- 04/08 quando os Pix reais foram de janeiro a agosto).
--
-- A data real de cada fatura é calculada por soma acumulada (mesma lógica
-- de "dívida mais antiga primeiro" que o sistema já usa pra decidir qual
-- fatura fecha, agora também rastreando qual Pix do lote a completou):
-- ordena as linhas de OFX do lote por data e as faturas da alocação por
-- vencimento, e atribui a cada fatura a data da linha de OFX cujo
-- intervalo acumulado a completa. Funciona mesmo quando a quantidade de
-- linhas de OFX não bate com a quantidade de faturas (uma linha pode
-- completar várias faturas pequenas, ou uma fatura grande pode precisar de
-- várias linhas) — não depende de pareamento 1:1.
--
-- `conciliacoes.data_conciliacao` continua sendo a data de processamento
-- do lote (é um dado de auditoria de quando a operação foi feita, não de
-- quando o dinheiro entrou) — só a data de cada baixa individual
-- (`lancamentos_contabeis.data` e `lancamentos.data_pagamento`) muda.
--
-- Aplicado retroativamente nos dados já existentes via SQL avulso (fora de
-- migração, na recuperação de 2026-09-02); esta migração só garante que
-- lotes novos, a partir de agora, já nasçam com a data certa.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS conciliar_ofx_lote$$
CREATE PROCEDURE conciliar_ofx_lote(
  IN p_ofx_ids JSON,
  IN p_alocacao JSON,
  OUT p_conciliacao_id CHAR(36)
)
BEGIN
  DECLARE v_soma_ofx DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_alocacao DECIMAL(14,2) DEFAULT 0;
  DECLARE v_qtd_ofx INT;
  DECLARE v_qtd_ofx_validas INT;
  DECLARE v_qtd_alocacao INT;
  DECLARE v_qtd_distintos INT;
  DECLARE v_qtd_validos INT;
  DECLARE v_n_contas INT;
  DECLARE v_conta_financeira_id CHAR(36);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_data_conciliacao DATE;
  DECLARE v_data_real_fatura DATE;
  DECLARE v_receber_id CHAR(36);
  DECLARE v_pagar_id CHAR(36);
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_valor_fatura DECIMAL(14,2);
  DECLARE v_valor_pago_atual DECIMAL(14,2);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_novo_valor_pago DECIMAL(14,2);
  DECLARE v_fecha BOOLEAN;
  DECLARE v_desc VARCHAR(500);
  DECLARE v_lanc_contabil_id_novo CHAR(36);
  DECLARE v_vinculos INT DEFAULT 0;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT jt.lancamento_id, jt.valor, l.tipo, l.valor, l.valor_pago, l.descricao
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
  IF p_ofx_ids IS NULL OR JSON_LENGTH(p_ofx_ids) = 0 OR p_alocacao IS NULL OR JSON_LENGTH(p_alocacao) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos um item de cada lado';
  END IF;
  SET v_qtd_ofx = JSON_LENGTH(p_ofx_ids);
  SELECT COUNT(*), COUNT(DISTINCT lancamento_id) INTO v_qtd_alocacao, v_qtd_distintos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt;
  IF v_qtd_distintos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A mesma fatura não pode aparecer duas vezes na alocação';
  END IF;

  SELECT id FROM lancamentos
  WHERE loja_id = @current_loja_id
    AND id IN (SELECT lancamento_id FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt)
  FOR UPDATE;
  SELECT id FROM ofx_lancamentos
   WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id FOR UPDATE;

  SELECT COUNT(*), COUNT(DISTINCT conta_financeira_id), COALESCE(SUM(valor), 0), MAX(data)
    INTO v_qtd_ofx_validas, v_n_contas, v_soma_ofx, v_data_conciliacao
  FROM ofx_lancamentos
  WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id)) AND NOT conciliado AND loja_id = @current_loja_id;
  IF v_qtd_ofx_validas <> v_qtd_ofx THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma linha do extrato não foi encontrada, não é desta loja, ou já está conciliada';
  END IF;
  IF v_n_contas <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'As linhas do extrato selecionadas devem ser da mesma conta bancária';
  END IF;
  SELECT conta_financeira_id INTO v_conta_financeira_id
  FROM ofx_lancamentos
  WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id LIMIT 1;

  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id
  WHERE l.pago = FALSE AND l.tipo IN ('entrada', 'saida') AND jt.valor > 0 AND jt.valor <= (l.valor - l.valor_pago);
  IF v_qtd_validos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Algum lançamento selecionado já está pago, não é desta loja, não é uma entrada/saída em aberto, ou o valor aplicado é inválido';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = v_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN l.tipo = 'entrada' THEN jt.valor ELSE -jt.valor END), 0) INTO v_soma_alocacao
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id;

  IF v_soma_ofx <> v_soma_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O total do extrato selecionado não bate com o total alocado nos lançamentos selecionados';
  END IF;

  SET p_conciliacao_id = UUID();
  INSERT INTO conciliacoes (id, conta_financeira_id, data_conciliacao, valor_total, criado_por, loja_id)
  VALUES (p_conciliacao_id, v_conta_financeira_id, v_data_conciliacao, ABS(v_soma_ofx), @current_usuario_id, @current_loja_id);

  UPDATE ofx_lancamentos SET conciliado = TRUE, conciliacao_id = p_conciliacao_id
  WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id;

  SET v_receber_id = conta_parametro_opcional('contas_a_receber');
  SET v_pagar_id = conta_parametro_opcional('fornecedores');

  -- Data real de cada fatura da alocação: soma acumulada das linhas de OFX
  -- do lote (ordenadas por data) casada com a soma acumulada das faturas
  -- (ordenadas por vencimento) — a fatura leva a data da linha de OFX cujo
  -- intervalo acumulado a completa. Ver comentário no topo da migração.
  DROP TEMPORARY TABLE IF EXISTS _conciliar_ofx_lote_datas;
  CREATE TEMPORARY TABLE _conciliar_ofx_lote_datas (
    lancamento_id CHAR(36) PRIMARY KEY,
    data_real DATE NOT NULL
  );
  INSERT INTO _conciliar_ofx_lote_datas (lancamento_id, data_real)
  WITH ofx_seq AS (
    SELECT o.id, o.data,
           SUM(o.valor) OVER (ORDER BY o.data, o.id) AS cum_end,
           SUM(o.valor) OVER (ORDER BY o.data, o.id) - o.valor AS cum_start
    FROM ofx_lancamentos o
    WHERE JSON_CONTAINS(p_ofx_ids, JSON_QUOTE(o.id)) AND o.loja_id = @current_loja_id
  ),
  fatura_seq AS (
    SELECT jt.lancamento_id, jt.valor,
           SUM(jt.valor) OVER (ORDER BY COALESCE(l.data_vencimento, l.data), l.id) AS cum_end,
           SUM(jt.valor) OVER (ORDER BY COALESCE(l.data_vencimento, l.data), l.id) - jt.valor AS cum_start
    FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
        lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
        valor DECIMAL(14,2) PATH '$.valor'
      )) jt
    JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id
  )
  SELECT f.lancamento_id, o.data
  FROM fatura_seq f
  JOIN ofx_seq o ON f.cum_end > o.cum_start AND f.cum_end <= o.cum_end;

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  loop_lanc: LOOP
    FETCH cur INTO v_id, v_valor_aplicado, v_tipo, v_valor_fatura, v_valor_pago_atual, v_desc;
    IF v_done THEN LEAVE loop_lanc; END IF;

    SELECT data_real INTO v_data_real_fatura FROM _conciliar_ofx_lote_datas WHERE lancamento_id = v_id;

    SET v_novo_valor_pago = v_valor_pago_atual + v_valor_aplicado;
    SET v_fecha = (v_novo_valor_pago >= v_valor_fatura);

    UPDATE lancamentos
    SET valor_pago = v_novo_valor_pago,
        pago = v_fecha,
        data_pagamento = IF(v_fecha, v_data_real_fatura, data_pagamento),
        conta_id = IF(v_fecha, v_conta_financeira_id, conta_id),
        forma_pagamento = IF(v_fecha, COALESCE(forma_pagamento, 'Conciliação OFX'), forma_pagamento),
        conciliacao_id = IF(v_fecha, p_conciliacao_id, conciliacao_id)
    WHERE id = v_id AND loja_id = @current_loja_id;

    SET v_lanc_contabil_id_novo = NULL;
    IF v_tipo = 'entrada' THEN
        CALL registrar_lancamento_contabil(
          v_data_real_fatura, mes_competencia(v_data_real_fatura), CONCAT('Baixa via conciliação: ', v_desc),
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2)))
          ),
          'conciliacao_baixa', v_id, @lanc_contabil_id
        );
    ELSE
        CALL registrar_lancamento_contabil(
          v_data_real_fatura, mes_competencia(v_data_real_fatura), CONCAT('Baixa via conciliação: ', v_desc),
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_pagar_id, 'tipo', 'debito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2)))
          ),
          'conciliacao_baixa', v_id, @lanc_contabil_id
        );
    END IF;
    SET v_lanc_contabil_id_novo = @lanc_contabil_id;

    INSERT INTO conciliacao_lancamentos
      (conciliacao_id, lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id, loja_id)
    VALUES
      (p_conciliacao_id, v_id, v_valor_aplicado, v_fecha, v_lanc_contabil_id_novo, @current_loja_id);
    SET v_vinculos = v_vinculos + 1;
  END LOOP;
  CLOSE cur;
  DROP TEMPORARY TABLE IF EXISTS _conciliar_ofx_lote_datas;

  -- Rede de segurança: a flag `conciliado` das linhas do extrato já subiu lá
  -- em cima, antes deste laço. Se o laço não gerou vínculo nenhum, o COMMIT
  -- deixaria linha marcada como conciliada sem nada por trás — o defeito que
  -- a #356 documentou. Aqui isso vira erro, e a transação inteira volta.
  IF v_vinculos = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
      'Nenhuma fatura foi baixada nesta conciliação — nada foi gravado. Confira a seleção e tente de novo.';
  END IF;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
