-- =============================================================================
-- Migração 0135: rateio entre contas de receita passa a funcionar de verdade
-- (achado da auditoria geral do lote administracao-fechamento-periodo /
-- tesouraria-contas / tesouraria-contas-pagar / tesouraria-faturas)
--
-- CONTEXTO. As telas "Gerar mensalidades" e "Emissão individual" (faturas)
-- têm um construtor de rateio completo (RateioBuilder em
-- tesouraria/faturas/index.tsx): escolher N contas de receita, definir
-- percentual de cada uma, validar que a soma dá 100%, e a tela final ainda
-- mostra "Fatura criada e provisão contábil lançada". Só que esse rateio
-- nunca chegou a ter efeito nenhum:
--
--   * criar_fatura_avulsa e gerar_mensalidades sempre chamaram
--     _postar_provisao_fatura(..., p_rateio) pra aplicar o rateio na
--     PROVISÃO contábil (débito "Contas a Receber", crédito dividido pelas
--     contas do rateio) — desenho original de quando o sistema era regime
--     de competência.
--   * A migração 0070 (regime de caixa) eliminou provisão de fatura por
--     completo: toda receita/despesa passou a ser reconhecida só na baixa.
--     A 0086 tornou _postar_provisao_fatura um no-op de verdade (BEGIN
--     END), justamente pra parar de exigir uma conta "Contas a Receber"
--     que não existe mais.
--   * De lá pra cá, o rateio nunca foi persistido em lugar nenhum — era só
--     serializado, mandado pro banco, e descartado ali. E a baixa (que é
--     onde a receita É reconhecida hoje) sempre creditou uma única conta
--     por fatura (conta_resultado_caixa), sem noção nenhuma de rateio.
--
-- CORREÇÃO. Rateio passa a ser aplicado no momento em que ele importa no
-- regime de caixa: a baixa, não a emissão.
--
--   1. fatura_rateio_itens: nova tabela — o rateio configurado na emissão
--      passa a ser persistido por lançamento (antes não existia em lugar
--      nenhum).
--   2. _rateio_split_lancamento: divide o valor efetivamente creditado de
--      UM lançamento pelas contas do rateio (mesmo algoritmo de
--      arredondamento do _postar_provisao_fatura original: todas as linhas
--      menos a última usam ROUND(valor*percentual/100,2), a última absorve
--      o resto — evita sobra/falta de centavos por arredondamento). Sem
--      rateio configurado, devolve uma única linha com a conta do próprio
--      lançamento (plano_conta_id) — comportamento idêntico ao de hoje.
--   3. contas_resultado_rateio: agrega esse split quando UM recibo baixa
--      VÁRIAS faturas de uma vez (baixar_faturas/baixar_pagamento_parcial
--      podem juntar faturas de competências diferentes, cada uma com seu
--      próprio rateio, num único recibo) — decisão do usuário: cada fatura
--      aplica o próprio rateio sobre o que lhe corresponde, não uma
--      conta única pro recibo inteiro.
--   4. registrar_lancamento_contabil: o "ponto único de entrada do razão"
--      ganha um passo de expansão ANTES dos dois laços que já existiam
--      (validar, inserir) — troca cada placeholder patrimonial
--      (contas_a_receber/fornecedores, ou nenhuma conta informada) por UMA
--      OU MAIS linhas já com conta final resolvida, sempre somando o mesmo
--      valor do item original (o saldo débito=crédito nunca muda). Os dois
--      laços originais passam a rodar sobre essa lista já expandida, sem
--      repetir lógica de substituição.
--
-- ESCOPO DELIBERADAMENTE LIMITADO A RECEITA. Rateio só se aplica a
-- 'recibo_baixa', 'recibo_baixa_parcial' e 'conciliacao_baixa' — as três
-- origens em que uma fatura de ENTRADA é creditada diretamente na baixa.
-- Ficam de fora, continuando com a conta única de sempre
-- (conta_resultado_caixa, inalterada):
--   * conta_pagar_baixa — é despesa; rateio nunca existiu desse lado.
--   * conciliacao_estorno — reverte uma baixa já registrada copiando as
--     contas que ELA já tinha (não recebe placeholder nenhum: por isso o
--     item já chega com a conta final, nunca com 1.1.02/2.1.01) — reverte
--     rateio automaticamente, sem precisar de nenhuma mudança aqui.
--   * parcelamento — a parcela é um lançamento novo, sem rateio próprio
--     (criar_parcelamento não herda o rateio da fatura original); manter o
--     fallback legado de conta_resultado_caixa pra parcelas antigas.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fatura_rateio_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  lancamento_id CHAR(36) NOT NULL,
  conta_id CHAR(36) NOT NULL,
  percentual DECIMAL(6,2) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_fatura_rateio_percentual CHECK (percentual > 0),
  CONSTRAINT fk_fatura_rateio_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_fatura_rateio_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_fatura_rateio_conta FOREIGN KEY (conta_id) REFERENCES plano_contas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_fatura_rateio_lancamento ON fatura_rateio_itens (lancamento_id);
CREATE INDEX idx_fatura_rateio_loja ON fatura_rateio_itens (loja_id);

DELIMITER $$

DROP FUNCTION IF EXISTS _rateio_split_lancamento$$
CREATE FUNCTION _rateio_split_lancamento(p_lancamento_id CHAR(36), p_valor DECIMAL(14,2))
RETURNS JSON
READS SQL DATA
BEGIN
  DECLARE v_n INT;
  DECLARE v_itens JSON DEFAULT JSON_ARRAY();
  DECLARE v_conta_padrao CHAR(36);
  DECLARE v_tipo_lanc VARCHAR(20);
  DECLARE v_acumulado DECIMAL(14,2) DEFAULT 0;
  DECLARE v_valor_linha DECIMAL(14,2);
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_percentual DECIMAL(6,2);

  SELECT COUNT(*) INTO v_n FROM fatura_rateio_itens WHERE lancamento_id = p_lancamento_id;

  -- Sem rateio configurado: uma única linha com a própria conta do
  -- lançamento — mesmo resultado de sempre. plano_conta_id só fica NULL em
  -- casos legados; cai no mesmo parâmetro padrão que conta_resultado_caixa
  -- já usa, escolhido pela natureza do PRÓPRIO lançamento — 'conciliacao_baixa'
  -- (a única origem "manual" além de recibo_baixa/_parcial que passa por
  -- aqui) atende entrada E saída, e rateio só existe do lado receita, então
  -- uma saída sem plano_conta_id não pode cair no parâmetro de receita.
  IF v_n = 0 THEN
    SELECT plano_conta_id, tipo INTO v_conta_padrao, v_tipo_lanc FROM lancamentos WHERE id = p_lancamento_id;
    -- IF/THEN/ELSE (não a função escalar IF(cond, a, b)) de propósito: só
    -- assim é garantido que apenas o parâmetro certo é resolvido — conta_
    -- parametro() sinaliza erro se o papel não estiver configurado, e essa
    -- garantia depende de nunca avaliar o ramo que não se aplica.
    IF v_conta_padrao IS NULL THEN
      IF v_tipo_lanc = 'saida' THEN
        SET v_conta_padrao = conta_parametro('resultado_despesa_padrao');
      ELSE
        SET v_conta_padrao = conta_parametro('resultado_receita_padrao');
      END IF;
    END IF;
    RETURN JSON_ARRAY(JSON_OBJECT('conta_id', v_conta_padrao, 'valor', CAST(p_valor AS DECIMAL(14,2))));
  END IF;

  WHILE v_i < v_n DO
    SELECT conta_id, percentual INTO v_conta_id, v_percentual
    FROM fatura_rateio_itens
    WHERE lancamento_id = p_lancamento_id
    ORDER BY criado_em, id
    LIMIT 1 OFFSET v_i;

    -- Todas as linhas menos a última usam o percentual arredondado; a
    -- última absorve o que sobrar da soma — evita que arredondamento em
    -- cada linha deixe a soma um centavo a mais ou a menos que p_valor
    -- (mesmo algoritmo do _postar_provisao_fatura original, pré-0086).
    IF v_i = v_n - 1 THEN
      SET v_valor_linha = p_valor - v_acumulado;
    ELSE
      SET v_valor_linha = ROUND(p_valor * v_percentual / 100, 2);
      SET v_acumulado = v_acumulado + v_valor_linha;
    END IF;

    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_conta_id, 'valor', CAST(v_valor_linha AS DECIMAL(14,2))));
    SET v_i = v_i + 1;
  END WHILE;

  RETURN v_itens;
END$$

DROP PROCEDURE IF EXISTS contas_resultado_rateio$$
CREATE PROCEDURE contas_resultado_rateio(
  IN p_origem_id CHAR(36),
  OUT p_itens JSON
)
BEGIN
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lancamento_id CHAR(36);
  DECLARE v_valor_lanc DECIMAL(14,2);
  DECLARE cur CURSOR FOR
    SELECT lancamento_id, valor_original FROM recibo_itens
    WHERE recibo_id = p_origem_id ORDER BY id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  SET p_itens = JSON_ARRAY();
  OPEN cur;
  loop_ri: LOOP
    FETCH cur INTO v_lancamento_id, v_valor_lanc;
    IF v_done THEN LEAVE loop_ri; END IF;
    -- Cada fatura do recibo aplica o próprio rateio sobre valor_original
    -- (o que ela contribuiu pro total do recibo) — não uma conta única pro
    -- recibo inteiro. JSON_MERGE_PRESERVE entre dois arrays concatena.
    SET p_itens = JSON_MERGE_PRESERVE(p_itens, _rateio_split_lancamento(v_lancamento_id, v_valor_lanc));
  END LOOP;
  CLOSE cur;
END$$

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
  -- Rateio entre contas de receita (achado da auditoria geral — ver
  -- migração 0135). Só nestas três origens uma fatura de entrada é
  -- creditada diretamente na baixa; conta_pagar_baixa/conciliacao_estorno/
  -- parcelamento continuam com conta_resultado (conta única), como sempre.
  SET v_rateio_manual = p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'conciliacao_baixa');

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Um lançamento contábil precisa de débito e crédito';
  END IF;

  -- Expande cada item do chamador numa lista final já com conta resolvida.
  -- Item comum passa direto; um placeholder patrimonial
  -- (contas_a_receber/fornecedores, ou nenhuma conta informada) vira uma
  -- linha só (conta_resultado, comportamento de sempre) ou várias linhas
  -- (rateio da fatura), sempre somando o mesmo valor do item original — o
  -- saldo débito=crédito do lançamento inteiro não muda.
  WHILE v_i < v_n DO
    SET v_conta_id = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id'))), 'null');
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
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
          'valor', JSON_EXTRACT(v_split, CONCAT('$[', v_j, '].valor')),
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
    SET v_valor = JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].valor'));
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
    SET v_valor = JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].valor'));
    SET v_desc = JSON_UNQUOTE(JSON_EXTRACT(v_itens_efetivo, CONCAT('$[', v_i, '].descricao')));
    INSERT INTO lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao, loja_id)
    VALUES (p_lancamento_id, v_conta_id, v_tipo, v_valor, v_desc, @current_loja_id);
    SET v_i = v_i + 1;
  END WHILE;
  IF v_own_tx THEN COMMIT; END IF;
END$$

-- Substitui _postar_provisao_fatura (no-op desde a 0086): valida o rateio
-- (contas de receita analíticas desta loja, percentuais somando 100%) e
-- persiste em fatura_rateio_itens — antes disso o rateio não era guardado
-- em lugar nenhum. Chamada por criar_fatura_avulsa e gerar_mensalidades.
DROP PROCEDURE IF EXISTS _postar_provisao_fatura$$

DROP PROCEDURE IF EXISTS _salvar_rateio_fatura$$
CREATE PROCEDURE _salvar_rateio_fatura(
  IN p_lancamento_id CHAR(36),
  IN p_rateio JSON
)
rotina: BEGIN
  DECLARE v_n INT;
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_percentual DECIMAL(6,2);
  DECLARE v_soma_pct DECIMAL(6,2) DEFAULT 0;
  DECLARE v_tipo VARCHAR(30);
  DECLARE v_analitica BOOLEAN;

  IF p_rateio IS NULL OR JSON_LENGTH(p_rateio) = 0 THEN
    LEAVE rotina;
  END IF;

  SET v_n = JSON_LENGTH(p_rateio);
  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_rateio, CONCAT('$[', v_i, '].conta_id')));
    SET v_percentual = JSON_EXTRACT(p_rateio, CONCAT('$[', v_i, '].percentual'));
    IF v_percentual IS NULL OR v_percentual <= 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Percentual do rateio deve ser maior que zero';
    END IF;
    SET v_tipo = NULL;
    SELECT tipo, analitica INTO v_tipo, v_analitica FROM plano_contas
     WHERE id = v_conta_id AND loja_id = @current_loja_id;
    IF v_tipo IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta do rateio não encontrada nesta loja';
    END IF;
    IF v_tipo <> 'receita' OR NOT v_analitica THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cada conta do rateio precisa ser uma conta de receita analítica';
    END IF;
    SET v_soma_pct = v_soma_pct + v_percentual;
    SET v_i = v_i + 1;
  END WHILE;
  IF ABS(v_soma_pct - 100) > 0.01 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O rateio precisa somar 100%';
  END IF;

  SET v_i = 0;
  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_rateio, CONCAT('$[', v_i, '].conta_id')));
    SET v_percentual = JSON_EXTRACT(p_rateio, CONCAT('$[', v_i, '].percentual'));
    INSERT INTO fatura_rateio_itens (loja_id, lancamento_id, conta_id, percentual)
    VALUES (@current_loja_id, p_lancamento_id, v_conta_id, v_percentual);
    SET v_i = v_i + 1;
  END WHILE;
END$$

DROP PROCEDURE IF EXISTS criar_fatura_avulsa$$
CREATE PROCEDURE criar_fatura_avulsa(
  IN p_irmao_id CHAR(36),
  IN p_valor DECIMAL(14,2),
  IN p_competencia_mes DATE,
  IN p_data_vencimento DATE,
  IN p_descricao VARCHAR(500),
  IN p_rateio JSON,
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_desc VARCHAR(500);
  DECLARE v_comp DATE;
  DECLARE v_pix_chave_id CHAR(36);
  DECLARE v_conta_receita CHAR(36);
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
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;
  -- O irmão vem por id do formulário: sem esta checagem dava pra emitir
  -- fatura no nome do irmão de outra Loja.
  IF NOT EXISTS (SELECT 1 FROM irmaos WHERE id = p_irmao_id AND loja_id = @current_loja_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Irmão não encontrado nesta loja';
  END IF;

  SELECT pix.id INTO v_pix_chave_id
  FROM contas_financeiras_pix pix
  JOIN contas_financeiras cf ON cf.id = pix.conta_financeira_id AND cf.loja_id = pix.loja_id
  WHERE cf.ativo = TRUE AND pix.loja_id = @current_loja_id
  ORDER BY pix.principal DESC, pix.criado_em ASC
  LIMIT 1;

  SET v_conta_receita = conta_parametro('mensalidades');

  SET v_comp = mes_competencia(p_competencia_mes);
  SET v_desc = COALESCE(p_descricao, CONCAT('Fatura ', DATE_FORMAT(p_competencia_mes, '%m/%Y')));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, irmao_id, plano_conta_id,
    pago, is_mensalidade, competencia_mes, criado_por,
    forma_cobranca, pix_chave_id, loja_id
  ) VALUES (
    p_lancamento_id, LAST_DAY(v_comp), p_data_vencimento, v_desc, p_valor, 'entrada', p_irmao_id,
    v_conta_receita,
    FALSE, TRUE, v_comp, @current_usuario_id,
    'pix', v_pix_chave_id, @current_loja_id
  );

  CALL _salvar_rateio_fatura(p_lancamento_id, p_rateio);
  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS gerar_mensalidades$$
CREATE PROCEDURE gerar_mensalidades(
  IN p_competencia DATE,
  IN p_data_vencimento DATE,
  IN p_irmao_id CHAR(36),
  IN p_rateio JSON,
  OUT p_total INT
)
BEGIN
  DECLARE v_plano CHAR(36);
  DECLARE v_venc DATE;
  DECLARE v_comp DATE;
  DECLARE v_desc VARCHAR(500);
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_valor_mensalidade DECIMAL(12,2);
  DECLARE v_valor_historico DECIMAL(12,2);
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_pix_chave_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT id, valor_mensalidade FROM irmaos
    WHERE loja_id = @current_loja_id
      AND situacao IN ('ativo', 'quite', 'irregular') AND valor_mensalidade > 0
      AND (p_irmao_id IS NULL OR id = p_irmao_id);
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

  SET v_plano = conta_parametro('mensalidades');

  SELECT pix.id INTO v_pix_chave_id
  FROM contas_financeiras_pix pix
  JOIN contas_financeiras cf ON cf.id = pix.conta_financeira_id AND cf.loja_id = pix.loja_id
  WHERE cf.ativo = TRUE AND pix.loja_id = @current_loja_id
  ORDER BY pix.principal DESC, pix.criado_em ASC
  LIMIT 1;

  SET v_comp = mes_competencia(p_competencia);
  SET v_venc = COALESCE(p_data_vencimento, DATE_ADD(LAST_DAY(v_comp), INTERVAL 7 DAY));
  SET v_desc = CONCAT('Mensalidade ', DATE_FORMAT(p_competencia, '%m/%Y'));
  SET p_total = 0;

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id, v_valor_mensalidade;
    IF v_done THEN LEAVE read_loop; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM lancamentos
       WHERE is_mensalidade AND irmao_id = v_id AND competencia_mes = v_comp
         AND loja_id = @current_loja_id
    ) THEN
      SET v_valor_historico = NULL;
      BEGIN
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_valor_historico = NULL;
        SELECT valor INTO v_valor_historico
        FROM tabela_valores
        WHERE tipo = 'mensalidade' AND org_id IS NULL AND vigencia_inicio <= v_comp
          AND loja_id = @current_loja_id
        ORDER BY vigencia_inicio DESC
        LIMIT 1;
      END;

      SET v_lanc_id = UUID();
      INSERT INTO lancamentos (
        id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
        irmao_id, pago, is_mensalidade, competencia_mes, criado_por,
        forma_cobranca, pix_chave_id, loja_id
      ) VALUES (
        v_lanc_id, CURRENT_DATE, v_venc, v_desc, COALESCE(v_valor_historico, v_valor_mensalidade),
        'entrada', v_plano, v_id, FALSE, TRUE, v_comp, @current_usuario_id,
        'pix', v_pix_chave_id, @current_loja_id
      );

      CALL _salvar_rateio_fatura(v_lanc_id, p_rateio);

      SET p_total = p_total + 1;
    END IF;
  END LOOP;
  CLOSE cur;
  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
