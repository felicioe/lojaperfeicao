-- =============================================================================
-- Migração 0139: conciliar_ofx_lote passa a resolver Contas a Receber /
-- Fornecedores pelo parâmetro contábil, não por código fixo
--
-- CONTEXTO. Achado ao investigar "Lançamento contábil desbalanceado" ao
-- vincular o recebimento OFX de Paulo Pickler Dacorégio à mensalidade dele.
-- `conciliar_ofx_lote` (migração 0122) resolve as contas patrimoniais assim:
--
--   SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02' ...
--   SELECT id INTO v_pagar_id  FROM plano_contas WHERE codigo = '2.1.01' ...
--
-- Isso é exatamente o padrão que a migração 0104 (issue #354) existia para
-- eliminar — todo o resto do sistema (criar_fatura_avulsa, baixar_faturas,
-- criar_conta_pagar, baixar_conta_pagar, baixar_pagamento_parcial) resolve
-- essas contas via conta_parametro_opcional('contas_a_receber'/'fornecedores'),
-- que lê de `parametros_contabeis` — e essa tabela pode apontar pra uma conta
-- diferente do código legado (nesta loja, '1.1.02' nem existe mais: foi
-- renomeado/inativado pela migração 0071, e o parâmetro está de fato
-- configurado para '1.1.91'). `conciliar_ofx_lote` nunca foi atualizado nesse
-- sentido — provavelmente foi reescrito a partir de uma versão anterior à
-- 0104 quando ganhou a lógica de "data real" na própria 0122.
--
-- Na prática, hoje v_receber_id/v_pagar_id ficam sempre NULL nesta loja, o
-- que ainda funciona por acidente (NULL casa com o placeholder que
-- registrar_lancamento_contabil substitui) — mas é frágil e diverge do
-- resto do sistema: se algum dia o parâmetro apontar pra uma conta diferente
-- da que porventura exista em '1.1.02'/'2.1.01', a baixa por conciliação
-- passaria a usar uma conta patrimonial diferente da usada por todas as
-- outras baixas (fatura avulsa, contas a pagar), quebrando a consistência
-- contábil entre os fluxos.
--
-- CORREÇÃO. Troca as duas buscas por código fixo pela leitura do parâmetro
-- contábil, com o mesmo fallback de nulidade que os outros fluxos já usam
-- (`conta_parametro_opcional` — devolve NULL sem erro quando o papel não
-- está configurado; a origem 'conciliacao_baixa' já tolera NULL, tratando
-- como conta de resultado da própria fatura). Nenhuma outra mudança de
-- comportamento na procedure.
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

  -- Antes: `WHERE codigo = '1.1.02'/'2.1.01'` — código fixo, divergente do
  -- resto do sistema e sempre NULL nesta loja (ver comentário no topo).
  SET v_receber_id = conta_parametro_opcional('contas_a_receber');
  SET v_pagar_id = conta_parametro_opcional('fornecedores');

  -- Data real de cada fatura da alocação: soma acumulada das linhas de OFX
  -- do lote (ordenadas por data) casada com a soma acumulada das faturas
  -- (ordenadas por vencimento) — a fatura leva a data da linha de OFX cujo
  -- intervalo acumulado a completa. Ver comentário no topo da migração 0122.
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
