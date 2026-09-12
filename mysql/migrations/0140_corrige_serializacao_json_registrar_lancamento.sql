-- =============================================================================
-- Migração 0140: corrige serialização de valor decimal em
-- registrar_lancamento_contabil que quebrava o balanceamento débito/crédito
--
-- CONTEXTO. Achado ao investigar "Lançamento contábil desbalanceado" na
-- primeira baixa via Conciliação Bancária a de fato passar pelo caminho de
-- rateio da migração 0135 (nunca tinha sido exercitado em produção antes
-- disso — os gaps de conta_parametro/conta_parametro_opcional/
-- parametros_contabeis, ver 0136-0138, sempre travavam antes de chegar
-- aqui).
--
-- A 0135 introduziu um passo de expansão: cada item do chamador é
-- reconstruído num novo array `v_itens_efetivo` (pra suportar rateio
-- virando várias linhas), e só então validado e somado. Um item "direto"
-- (conta comum, não-placeholder) é reconstruído assim:
--
--   SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
--   ...
--   JSON_OBJECT('conta_id', v_conta_id, 'tipo', v_tipo, 'valor', v_valor, ...)
--
-- Nesta versão do MariaDB (11.8.9), passar uma variável SQL DECIMAL(14,2)
-- como argumento de JSON_OBJECT() serializa como STRING JSON ("115.00",
-- entre aspas) em vez de NÚMERO (115.00). Já os itens que passam pelo
-- rateio (_rateio_split_lancamento/contas_resultado_rateio) constroem o
-- valor com CAST(...AS DECIMAL(14,2)) direto dentro do JSON_OBJECT/
-- JSON_ARRAY da própria função — isso sim vira número de verdade.
--
-- Resultado: numa baixa com um item direto (débito, a conta bancária) e um
-- item de rateio (crédito, resolvido pelo parâmetro contábil), o débito
-- ficava gravado como string dentro do JSON. Na volta, o segundo laço lê o
-- valor de volta com `JSON_EXTRACT` (sem JSON_UNQUOTE) e atribui a uma
-- variável DECIMAL — para uma string JSON, isso inclui as aspas no texto
-- convertido ("115.00" com aspas), que não é numérico e vira 0. A soma do
-- lado do débito ficava 0,00 e a checagem de saldo sempre disparava
-- "Lançamento contábil desbalanceado", mesmo com valores corretos.
--
-- CORREÇÃO. Extrai o valor com `JSON_UNQUOTE(JSON_EXTRACT(...))` antes do
-- CAST para DECIMAL nos dois pontos de leitura (montagem de
-- v_itens_efetivo a partir de p_itens, e leitura de v_itens_efetivo para
-- validar/somar/inserir) — JSON_UNQUOTE é seguro tanto para string quanto
-- para número (não altera a representação textual de um número), então
-- cobre os dois formatos possíveis sem risco de regressão. Nenhuma outra
-- mudança de comportamento.
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
  DECLARE v_parametro_receber CHAR(36);
  DECLARE v_parametro_pagar CHAR(36);
  DECLARE v_natureza VARCHAR(20);
  DECLARE v_conta_resultado CHAR(36);
  DECLARE v_baixa BOOLEAN;
  DECLARE v_rateio_manual BOOLEAN;
  DECLARE v_split JSON;
  DECLARE v_split_n INT;
  DECLARE v_j INT;
  DECLARE v_itens_efetivo JSON DEFAULT (JSON_ARRAY());
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
  SET v_parametro_receber = conta_parametro_opcional('contas_a_receber');
  SET v_parametro_pagar = conta_parametro_opcional('fornecedores');

  SET v_baixa = p_origem_tipo IN (
    'recibo_baixa', 'recibo_baixa_parcial', 'conta_pagar_baixa',
    'conciliacao_baixa', 'conciliacao_estorno', 'parcelamento'
  );
  SET v_rateio_manual = p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'conciliacao_baixa');

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Um lançamento contábil precisa de débito e crédito';
  END IF;

  WHILE v_i < v_n DO
    SET v_conta_id = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id'))), 'null');
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    -- Fix 0140: JSON_UNQUOTE antes do CAST — cobre tanto valor gravado como
    -- número quanto (por reserialização, ver comentário no topo) como
    -- string JSON.
    SET v_valor = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'))) AS DECIMAL(14,2));
    SET v_desc = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].descricao')));

    IF v_baixa AND (v_conta_id IS NULL OR v_conta_id = v_parametro_receber OR v_conta_id = v_parametro_pagar) THEN
      IF v_rateio_manual THEN
        IF p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial') THEN
          CALL contas_resultado_rateio(p_origem_id, v_split);
        ELSE
          SET v_split = _rateio_split_lancamento(p_origem_id, v_valor);
        END IF;
      ELSE
        IF v_conta_resultado IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
            'Não há conta contábil de resultado para esta baixa. Cadastre no plano de contas a conta de receita/despesa da fatura, ou configure o parâmetro contábil "resultado_receita_padrao"/"resultado_despesa_padrao".';
        END IF;
        SET v_split = JSON_ARRAY(JSON_OBJECT('conta_id', v_conta_resultado, 'valor', CAST(v_valor AS DECIMAL(14,2))));
      END IF;
      SET v_split_n = JSON_LENGTH(v_split);
      SET v_j = 0;
      WHILE v_j < v_split_n DO
        SET v_itens_efetivo = JSON_ARRAY_APPEND(v_itens_efetivo, '$', JSON_OBJECT(
          'conta_id', JSON_UNQUOTE(JSON_EXTRACT(v_split, CONCAT('$[', v_j, '].conta_id'))),
          'tipo', v_tipo,
          'valor', CAST(JSON_UNQUOTE(JSON_EXTRACT(v_split, CONCAT('$[', v_j, '].valor'))) AS DECIMAL(14,2)),
          'descricao', v_desc
        ));
        SET v_j = v_j + 1;
      END WHILE;
    ELSEIF v_conta_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
        'Lançamento contábil com linha sem conta: informe a conta contábil de cada débito e crédito.';
    ELSE
      SET v_itens_efetivo = JSON_ARRAY_APPEND(v_itens_efetivo, '$', JSON_OBJECT(
        'conta_id', v_conta_id, 'tipo', v_tipo, 'valor', v_valor, 'descricao', v_desc
      ));
    END IF;
    SET v_i = v_i + 1;
  END WHILE;

  -- A partir daqui v_itens_efetivo já tem toda conta resolvida (nenhum
  -- placeholder, nenhum id nulo) — os dois laços abaixo só validam e
  -- inserem, sem repetir substituição nenhuma.
  SET v_n = JSON_LENGTH(v_itens_efetivo);
  SET v_i = 0;
  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].tipo')));
    -- Fix 0140: idem — JSON_UNQUOTE antes do CAST (ver comentário no topo).
    SET v_valor = CAST(JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].valor'))) AS DECIMAL(14,2));
    SET v_analitica = NULL;
    SELECT analitica INTO v_analitica FROM plano_contas
     WHERE id = v_conta_id AND loja_id = @current_loja_id;
    -- v_analitica NULL agora significa das duas uma: conta inexistente, ou
    -- conta de OUTRA Loja. As duas são o mesmo erro do ponto de vista de
    -- quem chamou, e as duas têm que parar aqui.
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
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].tipo')));
    -- Fix 0140: idem — JSON_UNQUOTE antes do CAST (ver comentário no topo).
    SET v_valor = CAST(JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].valor'))) AS DECIMAL(14,2));
    SET v_desc = JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].descricao')));
    INSERT INTO lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao, loja_id)
    VALUES (p_lancamento_id, v_conta_id, v_tipo, v_valor, v_desc, @current_loja_id);
    SET v_i = v_i + 1;
  END WHILE;
  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
