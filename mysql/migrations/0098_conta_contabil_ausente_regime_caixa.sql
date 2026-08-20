-- =============================================================================
-- Migração 0098: conta contábil ausente no regime de caixa
--
-- SINTOMA. Conciliar duas mensalidades contra uma linha do OFX falhava com
-- "Conta contábil de caixa inválida, não analítica ou de outra loja".
--
-- CAUSA. Os chamadores (`conciliar_ofx_lote`, `conciliar_ofx_baixando_
-- lancamento`, `baixar_faturas`, `criar_parcelamento`, `registrar_recibo`)
-- procuram a conta de Contas a Receber pelo código fixo '1.1.02' — e a de
-- fornecedores por '2.1.01' — e montam o item contábil com o id encontrado:
--
--     SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02' ...
--     JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', ...)
--
-- Desde a 0070 o sistema opera em REGIME DE CAIXA: a baixa não passa mais por
-- Contas a Receber, ela credita direto a conta de resultado da fatura. Quem
-- reorganizou o plano de contas removeu a 1.1.02 (virou '1.1.91 Contas a
-- Receber (legado — regime de competência)', inativa). Aí o SELECT não acha
-- nada, `v_receber_id` fica NULL, e `JSON_OBJECT('conta_id', NULL, ...)`
-- grava um *JSON null*. Do outro lado, dentro de `registrar_lancamento_
-- contabil`:
--
--     SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_itens, '$[0].conta_id'));
--
-- JSON_UNQUOTE de um JSON null devolve a STRING 'null' — não o NULL do SQL.
-- Então `v_conta_id` vale literalmente 'null', que não é id de conta nenhuma:
-- a busca do código não acha, `v_codigo` fica NULL, a substituição pela conta
-- de resultado (que só dispara quando o código lido é '1.1.02' ou '2.1.01')
-- nunca acontece, e a validação de "conta analítica" recusa — corretamente,
-- mas com uma mensagem que não ajuda ninguém.
--
-- POR QUE ISSO SÓ APARECEU AGORA. Antes da 0096 a rotina não recusava: ela
-- seguia em frente e gravava o item apontando pra 'null'. O efeito era pior
-- que o erro — a conciliação era criada, a tela dizia sucesso, e ficavam para
-- trás uma conciliação sem itens, as faturas não baixadas e a linha do OFX
-- marcada como conciliada. A 0096 fechou a validação e transformou uma
-- corrupção silenciosa num erro visível. Esta migração trata a causa.
--
-- O QUE MUDA (só `registrar_lancamento_contabil`):
--
--   1. `NULLIF(..., 'null')` normaliza o JSON null pro NULL do SQL, então
--      "o chamador não tinha essa conta" deixa de se disfarçar de id inválido;
--   2. a substituição pela conta de resultado de caixa passa a valer também
--      quando a conta veio ausente (NULL) — que é exatamente o caso do plano
--      de contas sem 1.1.02 — e não só quando o código lido é '1.1.02'/
--      '2.1.01'. Continua valendo apenas para as origens de baixa;
--   3. um id NÃO nulo que não existe nesta loja continua sendo recusado, do
--      mesmo jeito e pelo mesmo motivo: é o caso do id de outra Loja;
--   4. as mensagens de erro passam a dizer QUAL conta falta e o que fazer.
--
-- Nada de assinatura muda. É um DROP/CREATE PROCEDURE, seguro de reaplicar.
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS registrar_lancamento_contabil$$
CREATE PROCEDURE registrar_lancamento_contabil(
  IN p_data DATE,
  IN p_competencia DATE,
  IN p_descricao VARCHAR(500),
  IN p_itens JSON,
  IN p_origem_tipo VARCHAR(50),
  IN p_origem_id CHAR(36),
  OUT p_lancamento_id CHAR(36)
)
rotina: BEGIN
  DECLARE v_n INT;
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_analitica BOOLEAN;
  DECLARE v_codigo VARCHAR(20);
  DECLARE v_natureza VARCHAR(20);
  DECLARE v_conta_resultado CHAR(36);
  DECLARE v_baixa BOOLEAN;
  DECLARE v_soma_debito DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_credito DECIMAL(14,2) DEFAULT 0;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;

  SET p_lancamento_id = NULL;
  IF p_origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao') THEN
    LEAVE rotina;
  END IF;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;
  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF @current_usuario_id IS NOT NULL
     AND NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão para registrar lançamento contábil';
  END IF;

  SET v_natureza = (
    SELECT tipo FROM lancamentos
     WHERE id = p_origem_id AND loja_id = @current_loja_id LIMIT 1
  );
  IF p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'parcelamento') THEN
    SET v_natureza = 'entrada';
  END IF;
  SET v_conta_resultado = conta_resultado_caixa(p_origem_tipo, p_origem_id, v_natureza);

  -- Origens em que o regime de caixa manda trocar a conta patrimonial
  -- (Contas a Receber / Fornecedores) pela conta de resultado da própria
  -- fatura. Calculado uma vez, usado nos dois laços.
  SET v_baixa = p_origem_tipo IN (
    'recibo_baixa', 'recibo_baixa_parcial', 'conta_pagar_baixa',
    'conciliacao_baixa', 'conciliacao_estorno', 'parcelamento'
  );

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Um lançamento contábil precisa de débito e crédito';
  END IF;

  WHILE v_i < v_n DO
    -- NULLIF(..., 'null'): JSON_UNQUOTE de um JSON null devolve a string
    -- 'null'. Sem isso, "o chamador não achou essa conta no plano" chega aqui
    -- disfarçado de id inválido, e o diagnóstico se perde.
    SET v_conta_id = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id'))), 'null');
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
    SET v_codigo = (
      SELECT codigo FROM plano_contas
       WHERE id = v_conta_id AND loja_id = @current_loja_id LIMIT 1
    );
    -- Regime de caixa. Dois caminhos chegam no mesmo lugar: o plano AINDA tem
    -- a conta patrimonial (código '1.1.02'/'2.1.01' — substitui), ou o plano
    -- já NÃO tem (conta ausente, v_conta_id NULL — substitui igual). Um id não
    -- nulo que não bate com nada nesta loja não entra aqui: cai na validação
    -- abaixo, que é onde o id de outra Loja tem que morrer.
    IF v_baixa AND (v_conta_id IS NULL OR v_codigo IN ('1.1.02', '2.1.01')) THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    IF v_conta_id IS NULL AND v_baixa THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
        'Não há conta contábil de resultado para esta baixa. Cadastre no plano de contas a conta de receita/despesa da fatura, ou as contas genéricas 4.9.01 (Outras Receitas) e 5.9.01 (Outras Despesas).';
    ELSEIF v_conta_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
        'Lançamento contábil com linha sem conta: informe a conta contábil de cada débito e crédito.';
    END IF;
    SET v_analitica = NULL;
    SELECT analitica INTO v_analitica FROM plano_contas
     WHERE id = v_conta_id AND loja_id = @current_loja_id;
    -- v_analitica NULL agora significa das duas uma: conta inexistente, ou
    -- conta de OUTRA Loja. As duas são o mesmo erro do ponto de vista de quem
    -- chamou, e as duas têm que parar aqui.
    IF v_analitica IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta contábil não encontrada nesta loja';
    END IF;
    IF NOT v_analitica THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
        'Conta contábil sintética: o lançamento precisa de uma conta analítica (de último nível)';
    END IF;
    IF v_tipo = 'debito' THEN
      SET v_soma_debito = v_soma_debito + v_valor;
    ELSEIF v_tipo = 'credito' THEN
      SET v_soma_credito = v_soma_credito + v_valor;
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tipo de linha contábil inválido';
    END IF;
    SET v_i = v_i + 1;
  END WHILE;
  IF v_soma_debito <> v_soma_credito THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento contábil desbalanceado';
  END IF;

  SET p_lancamento_id = UUID();
  INSERT INTO lancamentos_contabeis
    (id, data, competencia, descricao, origem_tipo, origem_id, criado_por, loja_id)
  VALUES
    (p_lancamento_id, p_data, mes_competencia(p_data), p_descricao, p_origem_tipo, p_origem_id,
     @current_usuario_id, @current_loja_id);

  SET v_i = 0;
  WHILE v_i < v_n DO
    SET v_conta_id = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id'))), 'null');
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
    SET v_desc = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].descricao')));
    SET v_codigo = (
      SELECT codigo FROM plano_contas
       WHERE id = v_conta_id AND loja_id = @current_loja_id LIMIT 1
    );
    IF v_baixa AND (v_conta_id IS NULL OR v_codigo IN ('1.1.02', '2.1.01')) THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    INSERT INTO lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao, loja_id)
    VALUES (p_lancamento_id, v_conta_id, v_tipo, v_valor, v_desc, @current_loja_id);
    SET v_i = v_i + 1;
  END WHILE;
  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
