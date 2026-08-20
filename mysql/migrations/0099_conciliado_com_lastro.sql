-- =============================================================================
-- Migração 0099: linha do extrato conciliada só com lastro (issue #356)
--
-- SINTOMA. O painel de fechamento da conciliação mostrava "0 itens pendentes"
-- e "100% conciliado" ao lado de "Diferença banco × sistema: −R$ 6.383,66".
--
-- AUDITORIA (conta corrente, 05/01 a 18/08/2026). O extrato está íntegro: 211
-- linhas, e `saldo_inicial + créditos − débitos` bate no centavo com o saldo do
-- banco. O sistema, porém, registrou 187 eventos, TODOS positivos: das 174
-- linhas de conciliação, nenhuma é de saída. O banco teve R$ 16.040,29 de
-- débitos que o sistema desconhece, e R$ 9.656,63 de créditos que também não
-- viraram lançamento. A diferença fecha exata:
--
--     saídas não registradas    + 16.040,29
--     entradas não registradas  −  9.656,63
--                               = R$ 6.383,66
--
-- Das 34 linhas de débito, 33 estão com `conciliado = TRUE` e os DOIS ponteiros
-- (`lancamento_id`, `conciliacao_id`) nulos.
--
-- CAUSA. Duas peças que só fazem estrago juntas.
--
--   1. `ofx_lancamentos.conciliado` é um booleano gravado ANTES do trabalho:
--      `conciliar_ofx_lote` insere a conciliação, marca as linhas, e só então
--      roda o laço que cria os vínculos. Laço vazio, flag em pé.
--
--   2. As chaves estrangeiras soltam o ponteiro e deixam a flag para trás:
--
--        fk_ofx_lancamento   lancamento_id  -> lancamentos  ON DELETE SET NULL
--        fk_ofx_conciliacao  conciliacao_id -> conciliacoes ON DELETE SET NULL
--
--      Apagar o lançamento (pela tela de Movimento Financeiro, por exemplo)
--      anula o ponteiro — e ninguém baixa a flag. A linha do extrato fica
--      marcada como conciliada apontando para o nada.
--
-- Nenhum caminho do código sobe a flag sem gravar um ponteiro junto, então (2)
-- é o único jeito de o estado observado existir. E o defeito se esconde
-- sozinho: `NOT conciliado` tira a linha da lista de pendentes, a guarda
-- `AND NOT conciliado` recusa reconciliá-la ("já está conciliada"), e o painel
-- soma `valorConciliado` pela mesma flag e fecha em 100%.
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--
--   1. SANEAMENTO — baixa a flag onde não há lastro. As 33 saídas voltam para
--      a fila de pendentes. Isso não apaga nem inventa lançamento nenhum: só
--      para de afirmar que existe conciliação onde não existe.
--   2. GATILHOS — antes de apagar um lançamento ou uma conciliação, baixa a
--      flag das linhas do extrato que apontavam para eles. É o que fecha o
--      buraco em (2), para ele não abrir de novo amanhã.
--   3. REDE DE SEGURANÇA — `conciliar_ofx_lote` passa a contar os vínculos que
--      criou e a recusar a transação inteira se não criou nenhum, cobrindo (1).
--
-- O que NÃO está aqui, de propósito: `criar_lancamentos_de_ofx_rateado` não
-- ganhou a mesma contagem porque ele já valida a lista de itens antes de
-- marcar qualquer coisa (`v_qtd_validos <> v_qtd_itens` aborta), então o laço
-- vazio não é alcançável por lá.
--
-- AVISO. Depois desta migração o painel vai deixar de dizer 100% e vai expor
-- os itens pendentes e a diferença. Não é regressão — é o trabalho de
-- tesouraria que nunca foi feito aparecendo pela primeira vez. A issue #357
-- (lançamento em lote a partir do extrato) é o caminho para zerar isso.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SANEAMENTO
-- ---------------------------------------------------------------------------
-- Sem escopo de loja de propósito: é correção de integridade sobre um estado
-- que não deveria existir em Loja nenhuma, e roda uma vez só, na migração.
UPDATE ofx_lancamentos o
   SET o.conciliado = FALSE
 WHERE o.conciliado = TRUE
   AND o.lancamento_id IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM conciliacao_lancamentos cl
       JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id
      WHERE cl.conciliacao_id = o.conciliacao_id
        AND cl.loja_id = o.loja_id
        AND c.status = 'ativa'
   );

DELIMITER $$

-- ---------------------------------------------------------------------------
-- 2. GATILHOS
-- ---------------------------------------------------------------------------
-- BEFORE DELETE, não AFTER: a ação SET NULL da chave estrangeira roda depois
-- do delete, então aqui o ponteiro ainda existe e dá para achar a linha.
DROP TRIGGER IF EXISTS trg_lancamento_delete_solta_ofx$$
CREATE TRIGGER trg_lancamento_delete_solta_ofx
BEFORE DELETE ON lancamentos
FOR EACH ROW
BEGIN
  UPDATE ofx_lancamentos
     SET conciliado = FALSE
   WHERE lancamento_id = OLD.id AND loja_id = OLD.loja_id;
END$$

-- Apagar a conciliação leva junto os `conciliacao_lancamentos` (CASCADE) e
-- anula `ofx_lancamentos.conciliacao_id` (SET NULL) — some o lastro inteiro.
DROP TRIGGER IF EXISTS trg_conciliacao_delete_solta_ofx$$
CREATE TRIGGER trg_conciliacao_delete_solta_ofx
BEFORE DELETE ON conciliacoes
FOR EACH ROW
BEGIN
  UPDATE ofx_lancamentos
     SET conciliado = FALSE
   WHERE conciliacao_id = OLD.id AND loja_id = OLD.loja_id;
END$$

-- ---------------------------------------------------------------------------
-- 3. REDE DE SEGURANÇA EM conciliar_ofx_lote
-- ---------------------------------------------------------------------------
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

  SELECT id INTO v_receber_id FROM plano_contas
   WHERE codigo = '1.1.02' AND loja_id = @current_loja_id;
  SELECT id INTO v_pagar_id FROM plano_contas
   WHERE codigo = '2.1.01' AND loja_id = @current_loja_id;

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  loop_lanc: LOOP
    FETCH cur INTO v_id, v_valor_aplicado, v_tipo, v_valor_fatura, v_valor_pago_atual, v_desc;
    IF v_done THEN LEAVE loop_lanc; END IF;

    SET v_novo_valor_pago = v_valor_pago_atual + v_valor_aplicado;
    SET v_fecha = (v_novo_valor_pago >= v_valor_fatura);

    UPDATE lancamentos
    SET valor_pago = v_novo_valor_pago,
        pago = v_fecha,
        data_pagamento = IF(v_fecha, v_data_conciliacao, data_pagamento),
        conta_id = IF(v_fecha, v_conta_financeira_id, conta_id),
        forma_pagamento = IF(v_fecha, COALESCE(forma_pagamento, 'Conciliação OFX'), forma_pagamento),
        conciliacao_id = IF(v_fecha, p_conciliacao_id, conciliacao_id)
    WHERE id = v_id AND loja_id = @current_loja_id;

    SET v_lanc_contabil_id_novo = NULL;
    IF v_tipo = 'entrada' THEN
        CALL registrar_lancamento_contabil(
          v_data_conciliacao, mes_competencia(v_data_conciliacao), CONCAT('Baixa via conciliação: ', v_desc),
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_valor_aplicado AS DECIMAL(14,2)))
          ),
          'conciliacao_baixa', v_id, @lanc_contabil_id
        );
    ELSE
        CALL registrar_lancamento_contabil(
          v_data_conciliacao, mes_competencia(v_data_conciliacao), CONCAT('Baixa via conciliação: ', v_desc),
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
