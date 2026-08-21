-- =============================================================================
-- Migração 0103: lançamento em lote a partir do extrato (issue #357)
--
-- CONTEXTO. A #356 corrigiu a leitura: uma linha do extrato só conta como
-- conciliada quando existe prova disso. Isso trouxe de volta pra fila de
-- pendentes um passivo real — em produção, 34 saídas e uma dezena de créditos
-- que passaram pelo banco e nunca viraram lançamento no sistema. Pelo fluxo
-- existente isso é uma linha de cada vez (`criar_lancamento_de_ofx`,
-- `conciliar_ofx_rateio`). Esta migração acrescenta o inverso: várias linhas
-- do extrato, uma classificação em cada, resolvidas de uma vez só.
--
-- FORMATO DO LOTE. `p_itens` é um array JSON, um objeto por linha do extrato:
--   { "ofx_id": "...",
--     "plano_conta_id": "..." | null,   -- receita/despesa
--     "conta_destino_id": "..." | null, -- OU transferência entre contas
--     "categoria": "..." | null,        -- só usado com plano_conta_id + entrada
--     "irmao_id": "..." | null,
--     "terceiro_id": "..." | null,
--     "descricao": "..." | null }
-- Cada item tem EXATAMENTE UM de `plano_conta_id` / `conta_destino_id`
-- preenchido — é a mesma bifurcação que já existe em duas rotinas separadas
-- (`criar_lancamento_de_ofx` e `criar_transferencia`); aqui elas são
-- reaproveitadas linha a linha, dentro de uma única transação.
--
-- TUDO OU NADA. Cada item é validado no MOMENTO em que é processado — se
-- qualquer linha for de outra Loja, já estiver conciliada (pela definição por
-- prova da #356, não pela flag), tiver conta contábil de outra Loja, tiver as
-- duas opções (ou nenhuma) preenchidas, o SIGNAL estoura, o EXIT HANDLER
-- reverte a transação inteira, e NADA do lote é gravado — do mesmo jeito que
-- `conciliar_ofx_lote` e `baixar_faturas` já se comportam.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS lancar_lote_de_ofx$$
CREATE PROCEDURE lancar_lote_de_ofx(
  IN p_itens JSON,
  OUT p_criados INT
)
BEGIN
  DECLARE v_n INT;
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_qtd_distintos INT;
  DECLARE v_qtd_validos INT;

  DECLARE v_ofx_id CHAR(36);
  DECLARE v_plano_conta_id CHAR(36);
  DECLARE v_conta_destino_id CHAR(36);
  DECLARE v_categoria VARCHAR(20);
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_terceiro_id CHAR(36);
  DECLARE v_descricao_item VARCHAR(500);

  DECLARE v_conta_financeira_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao_ofx VARCHAR(500);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_valor_abs DECIMAL(14,2);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_itens_contabeis JSON;
  DECLARE v_lancamento_id CHAR(36);
  DECLARE v_plano_destino CHAR(36);
  DECLARE v_lanc_contabil_id_novo CHAR(36);

  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  SET p_criados = 0;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos uma linha do extrato';
  END IF;

  -- A mesma linha do extrato não pode entrar duas vezes no mesmo lote — ela
  -- só suporta um lançamento.
  SELECT COUNT(*), COUNT(DISTINCT ofx_id) INTO v_n, v_qtd_distintos
  FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
    ofx_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.ofx_id'
  )) jt;
  IF v_qtd_distintos <> v_n THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A mesma linha do extrato não pode aparecer duas vezes no lote';
  END IF;

  -- Trava as linhas do extrato envolvidas e confere, ANTES de gravar
  -- qualquer coisa, que todas são desta loja e estão pendentes de verdade —
  -- pela definição por prova da #356 (lancamento_id, ou vínculo de
  -- conciliação ativa), não pela flag `conciliado`, que é exatamente a coluna
  -- que a #356 provou não dar pra confiar.
  SELECT id FROM ofx_lancamentos
   WHERE JSON_CONTAINS(
           (SELECT JSON_ARRAYAGG(jt.ofx_id) FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
             ofx_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.ofx_id'
           )) jt),
           JSON_QUOTE(id)
         )
     AND loja_id = @current_loja_id
   FOR UPDATE;

  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
      ofx_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.ofx_id'
    )) jt
  JOIN ofx_lancamentos o ON o.id = jt.ofx_id AND o.loja_id = @current_loja_id
  WHERE o.lancamento_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes c ON c.id = cl.conciliacao_id AND c.loja_id = cl.loja_id
       WHERE cl.conciliacao_id = o.conciliacao_id AND cl.loja_id = o.loja_id
         AND c.status = 'ativa'
    );
  IF v_qtd_validos <> v_n THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma linha do extrato não foi encontrada, não é desta loja, ou já está conciliada';
  END IF;

  WHILE v_i < v_n DO
    SET v_ofx_id           = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].ofx_id')));
    SET v_plano_conta_id   = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].plano_conta_id'))), 'null');
    SET v_conta_destino_id = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_destino_id'))), 'null');
    SET v_categoria        = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].categoria'))), 'null');
    SET v_irmao_id         = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].irmao_id'))), 'null');
    SET v_terceiro_id      = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].terceiro_id'))), 'null');
    SET v_descricao_item   = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].descricao'))), 'null');

    IF (v_plano_conta_id IS NULL) = (v_conta_destino_id IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cada linha precisa de exatamente uma classificação: conta contábil OU conta de destino da transferência';
    END IF;

    SELECT conta_financeira_id, data, valor, descricao
      INTO v_conta_financeira_id, v_data, v_valor, v_descricao_ofx
    FROM ofx_lancamentos
    WHERE id = v_ofx_id AND loja_id = @current_loja_id;

    SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
     WHERE id = v_conta_financeira_id AND loja_id = @current_loja_id;
    IF v_plano_conta_banco IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
    END IF;

    SET v_valor_abs = ABS(v_valor);
    SET v_tipo = CASE WHEN v_valor >= 0 THEN 'entrada' ELSE 'saida' END;
    SET v_desc = COALESCE(v_descricao_item, v_descricao_ofx, 'Lançamento importado do extrato');
    SET v_lancamento_id = UUID();

    IF v_plano_conta_id IS NOT NULL THEN
      -- Receita ou despesa — mesmo corpo de `criar_lancamento_de_ofx`,
      -- inlined pra rodar dentro da MESMA transação do lote (uma rotina não
      -- pode ROLLBACK a transação da outra, e queremos tudo-ou-nada).
      IF NOT EXISTS (
        SELECT 1 FROM plano_contas WHERE id = v_plano_conta_id AND loja_id = @current_loja_id AND analitica = TRUE
      ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta contábil não encontrada nesta loja, ou não é analítica';
      END IF;

      INSERT INTO lancamentos (
        id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
        irmao_id, terceiro_id, categoria_recebimento, pago, criado_por, loja_id
      ) VALUES (
        v_lancamento_id, v_data, v_data, v_desc, v_valor_abs, v_valor_abs, v_tipo, v_conta_financeira_id, v_plano_conta_id,
        v_irmao_id, v_terceiro_id, CASE WHEN v_tipo = 'entrada' THEN v_categoria ELSE NULL END, TRUE,
        @current_usuario_id, @current_loja_id
      );

      IF v_tipo = 'entrada' THEN
        SET v_itens_contabeis = JSON_ARRAY(
          JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
          JSON_OBJECT('conta_id', v_plano_conta_id, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
        );
      ELSE
        SET v_itens_contabeis = JSON_ARRAY(
          JSON_OBJECT('conta_id', v_plano_conta_id, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
          JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
        );
      END IF;

      CALL registrar_lancamento_contabil(
        v_data, mes_competencia(v_data), v_desc, v_itens_contabeis,
        'ofx_importado', v_lancamento_id, v_lanc_contabil_id_novo
      );
    ELSE
      -- Transferência entre contas financeiras da própria Loja — mesmo corpo
      -- de `criar_transferencia`: débito na conta contábil de destino,
      -- crédito na de origem, sem tocar receita ou despesa. `v_conta_destino_id`
      -- aqui é só "a outra conta envolvida" escolhida na tela — QUEM é origem
      -- e QUEM é destino depende do sinal da linha do OFX, não da ordem dos
      -- parâmetros: numa saída, o dinheiro saiu desta conta (esta é a origem);
      -- numa entrada, o dinheiro veio da outra conta (a outra é a origem).
      IF v_conta_destino_id = v_conta_financeira_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A outra conta da transferência precisa ser diferente da conta deste extrato';
      END IF;
      SELECT plano_conta_id INTO v_plano_destino FROM contas_financeiras
       WHERE id = v_conta_destino_id AND loja_id = @current_loja_id;
      IF v_plano_destino IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A outra conta da transferência não foi encontrada nesta loja, ou não tem conta do plano de contas vinculada';
      END IF;

      IF v_tipo = 'saida' THEN
        INSERT INTO lancamentos (
          id, data, data_pagamento, descricao, valor, tipo, conta_id, conta_destino_id, pago, criado_por, loja_id
        ) VALUES (
          v_lancamento_id, v_data, v_data, v_desc, v_valor_abs, 'transferencia',
          v_conta_financeira_id, v_conta_destino_id, TRUE, @current_usuario_id, @current_loja_id
        );
        CALL registrar_lancamento_contabil(
          v_data, mes_competencia(v_data), v_desc,
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_plano_destino, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
          ),
          'transferencia', v_lancamento_id, v_lanc_contabil_id_novo
        );
      ELSE
        INSERT INTO lancamentos (
          id, data, data_pagamento, descricao, valor, tipo, conta_id, conta_destino_id, pago, criado_por, loja_id
        ) VALUES (
          v_lancamento_id, v_data, v_data, v_desc, v_valor_abs, 'transferencia',
          v_conta_destino_id, v_conta_financeira_id, TRUE, @current_usuario_id, @current_loja_id
        );
        CALL registrar_lancamento_contabil(
          v_data, mes_competencia(v_data), v_desc,
          JSON_ARRAY(
            JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
            JSON_OBJECT('conta_id', v_plano_destino, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
          ),
          'transferencia', v_lancamento_id, v_lanc_contabil_id_novo
        );
      END IF;
    END IF;

    UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = v_lancamento_id
     WHERE id = v_ofx_id AND loja_id = @current_loja_id;

    SET p_criados = p_criados + 1;
    SET v_i = v_i + 1;
  END WHILE;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
