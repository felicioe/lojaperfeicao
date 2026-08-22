-- =============================================================================
-- Migração 0104: parâmetros contábeis por Loja (papel → conta do plano)
-- (issue #354)
--
-- SINTOMA. As rotinas do banco descobrem conta contábil por código fixo
-- escrito no SQL: '1.1.02' (Contas a Receber), '2.1.01' (Fornecedores),
-- '4.1.01' (Mensalidades), '4.1.06' (Multas e Juros), '5.1.06' (Descontos),
-- '4.9.01'/'5.9.01' (genéricas de resultado) e '3.1.01' (Superávit/Déficit
-- Acumulado). Isso já quebrou em produção uma vez (migração 0098): a 1.1.02
-- foi renomeada/desativada quando o sistema passou a operar em regime de
-- caixa, o SELECT parou de achar linha, e conciliar ou baixar fatura passou
-- a falhar com "Conta contábil de caixa inválida". Num sistema multi-Loja,
-- código fixo no SQL é uma bomba-relógio por Loja: cada Loja renumera o
-- plano de contas do jeito que quiser, e qualquer renumeração reencontra o
-- mesmo problema em outro código.
--
-- O QUE ESTA MIGRAÇÃO FAZ.
--
--   1. Cria `parametros_contabeis` (loja_id, papel, plano_conta_id) — um
--      papel contábil por linha, por Loja.
--   2. Semeia a partir do plano de contas atual de cada Loja, casando pelo
--      código de hoje, para que instalações já em produção não precisem
--      configurar nada pra continuar funcionando (quando o código ainda
--      existir — '1.1.02' normalmente não existe mais, ver nota abaixo).
--   3. Cria `conta_parametro(papel)` (recusa com mensagem específica quando
--      o papel não está configurado) e `conta_parametro_opcional(papel)`
--      (devolve NULL — usada só onde o chamador já trata a ausência, como
--      sentinela de substituição pelo regime de caixa).
--   4. Reescreve as rotinas que hoje fazem `WHERE codigo = '...'` para
--      chamar `conta_parametro`/`conta_parametro_opcional` em vez disso.
--
-- NOTA SOBRE '1.1.02'. Migração 0071 renomeou a linha de '1.1.02' para
-- '1.1.91' (inativa) — desde então `WHERE codigo = '1.1.02'` nunca acha
-- nada. O papel `contas_a_receber` semeia tentando as duas, nessa ordem de
-- preferência, e funciona igual quando nenhuma existir: as rotinas que o
-- usam em regime de caixa (baixa de fatura/OFX) já toleram a ausência —
-- é exatamente o sinal de "substitua pela conta de resultado da própria
-- fatura", não um erro.
--
-- PRECEDÊNCIA (decisão da issue). Quando o lançamento já tem sua própria
-- `plano_conta_id` (ex.: a fatura foi emitida contra uma conta de receita
-- específica), essa conta continua tendo precedência — o parâmetro só
-- entra em jogo como resolução padrão quando não há nada mais específico.
-- Isso já é o comportamento de `registrar_lancamento_contabil` hoje (só
-- troca a conta quando a origem é uma baixa E a conta client-supplied é a
-- sentinela/está ausente) e não muda nesta migração.
-- =============================================================================

CREATE TABLE IF NOT EXISTS parametros_contabeis (
  loja_id CHAR(36) NOT NULL,
  papel VARCHAR(40) NOT NULL,
  plano_conta_id CHAR(36) NOT NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (loja_id, papel),
  CONSTRAINT fk_parametros_contabeis_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_parametros_contabeis_conta FOREIGN KEY (plano_conta_id) REFERENCES plano_contas(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Seed — casa pelo código de hoje, papel a papel, por Loja. Idempotente
-- (replay seguro): cada papel só é inserido se ainda não existir a linha.
-- ---------------------------------------------------------------------------

-- 'contas_a_receber' tenta '1.1.02' primeiro (instalação que nunca rodou a
-- 0071) e só then '1.1.91' (o caso comum hoje — legado, inativa).
INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'contas_a_receber', id FROM plano_contas WHERE codigo = '1.1.02';
INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT pc.loja_id, 'contas_a_receber', pc.id FROM plano_contas pc
 WHERE pc.codigo = '1.1.91'
   AND NOT EXISTS (
     SELECT 1 FROM parametros_contabeis p
      WHERE p.loja_id = pc.loja_id AND p.papel = 'contas_a_receber'
   );

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'fornecedores', id FROM plano_contas WHERE codigo = '2.1.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'mensalidades', id FROM plano_contas WHERE codigo = '4.1.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'multas_juros', id FROM plano_contas WHERE codigo = '4.1.06';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'descontos_concedidos', id FROM plano_contas WHERE codigo = '5.1.06';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'resultado_receita_padrao', id FROM plano_contas WHERE codigo = '4.9.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'resultado_despesa_padrao', id FROM plano_contas WHERE codigo = '5.9.01';

INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
SELECT loja_id, 'resultado_acumulado', id FROM plano_contas WHERE codigo = '3.1.01';

DELIMITER $$

-- ---------------------------------------------------------------------------
-- Funções de resolução
-- ---------------------------------------------------------------------------

-- Devolve NULL quando o papel não está configurado — só para onde o
-- chamador já trata isso (sentinela de substituição pelo regime de caixa,
-- ou papel opcional por natureza).
DROP FUNCTION IF EXISTS conta_parametro_opcional$$
CREATE FUNCTION conta_parametro_opcional(p_papel VARCHAR(40))
RETURNS CHAR(36)
  READS SQL DATA
BEGIN
  DECLARE v_conta_id CHAR(36);
  SELECT plano_conta_id INTO v_conta_id
    FROM parametros_contabeis
   WHERE loja_id = @current_loja_id AND papel = p_papel
   LIMIT 1;
  RETURN v_conta_id;
END$$

-- Recusa com uma mensagem que diz exatamente qual papel falta e manda
-- configurar em Contabilidade > Parâmetros Contábeis — nunca uma mensagem
-- genérica de "conta não encontrada" mais adiante.
DROP FUNCTION IF EXISTS conta_parametro$$
CREATE FUNCTION conta_parametro(p_papel VARCHAR(40))
RETURNS CHAR(36)
  READS SQL DATA
BEGIN
  DECLARE v_conta_id CHAR(36);
  DECLARE v_msg VARCHAR(255);
  SET v_conta_id = conta_parametro_opcional(p_papel);
  IF v_conta_id IS NULL THEN
    -- SIGNAL ... SET MESSAGE_TEXT não aceita uma expressão de função
    -- (CONCAT) direto nesta versão do MariaDB — "Undeclared variable:
    -- CONCAT". Precisa montar a mensagem numa variável antes.
    SET v_msg = CONCAT(
      'Parâmetro contábil "', p_papel, '" não configurado. ',
      'Configure em Contabilidade > Parâmetros Contábeis.'
    );
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
  RETURN v_conta_id;
END$$

-- ---------------------------------------------------------------------------
-- Resolve a conta de resultado do regime de caixa. Fallback de último
-- recurso ('resultado_receita_padrao'/'resultado_despesa_padrao') agora
-- passa pelo papel em vez do código '4.9.01'/'5.9.01' fixo.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS conta_resultado_caixa$$
CREATE FUNCTION conta_resultado_caixa(
  p_origem_tipo VARCHAR(50),
  p_origem_id CHAR(36),
  p_natureza VARCHAR(20)
) RETURNS CHAR(36)
  READS SQL DATA
BEGIN
  DECLARE v_conta_id CHAR(36);

  IF p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial') THEN
    SELECT l.plano_conta_id INTO v_conta_id
    FROM recibo_itens ri
    JOIN lancamentos l ON l.id = ri.lancamento_id AND l.loja_id = ri.loja_id
    WHERE ri.recibo_id = p_origem_id AND ri.loja_id = @current_loja_id
      AND l.plano_conta_id IS NOT NULL
    ORDER BY ri.id LIMIT 1;
  ELSE
    SELECT l.plano_conta_id INTO v_conta_id
    FROM lancamentos l
    WHERE l.id = p_origem_id AND l.loja_id = @current_loja_id
    LIMIT 1;
  END IF;

  IF v_conta_id IS NULL THEN
    SELECT original.plano_conta_id INTO v_conta_id
    FROM lancamentos parcela
    JOIN lancamentos original ON original.parcelamento_id = parcela.parcelamento_id
      AND original.loja_id = parcela.loja_id
      AND original.plano_conta_id IS NOT NULL
    WHERE parcela.id = p_origem_id AND parcela.loja_id = @current_loja_id
    ORDER BY original.data, original.id LIMIT 1;
  END IF;

  IF v_conta_id IS NULL AND p_natureza = 'entrada' THEN
    SET v_conta_id = conta_parametro('resultado_receita_padrao');
  ELSEIF v_conta_id IS NULL AND p_natureza = 'saida' THEN
    SET v_conta_id = conta_parametro('resultado_despesa_padrao');
  END IF;
  RETURN v_conta_id;
END$$

-- ---------------------------------------------------------------------------
-- registrar_lancamento_contabil: a sentinela de "conta patrimonial do
-- regime de competência" passa a comparar contra os parâmetros
-- 'contas_a_receber'/'fornecedores' (lidos uma vez, por id) em vez de
-- buscar de novo o código de cada conta a cada linha do lançamento.
-- ---------------------------------------------------------------------------
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
    -- Regime de caixa. Dois caminhos chegam no mesmo lugar: a conta ainda é
    -- o parâmetro patrimonial (contas_a_receber/fornecedores — substitui),
    -- ou não veio nenhuma (v_conta_id NULL — substitui igual). Um id não
    -- nulo que não bate com nada nesta loja não entra aqui: cai na validação
    -- abaixo, que é onde o id de outra Loja tem que morrer.
    IF v_baixa AND (v_conta_id IS NULL OR v_conta_id = v_parametro_receber OR v_conta_id = v_parametro_pagar) THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    IF v_conta_id IS NULL AND v_baixa THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT =
        'Não há conta contábil de resultado para esta baixa. Cadastre no plano de contas a conta de receita/despesa da fatura, ou configure o parâmetro contábil "resultado_receita_padrao"/"resultado_despesa_padrao".';
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
    IF v_baixa AND (v_conta_id IS NULL OR v_conta_id = v_parametro_receber OR v_conta_id = v_parametro_pagar) THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    INSERT INTO lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao, loja_id)
    VALUES (p_lancamento_id, v_conta_id, v_tipo, v_valor, v_desc, @current_loja_id);
    SET v_i = v_i + 1;
  END WHILE;
  IF v_own_tx THEN COMMIT; END IF;
END$$

-- ---------------------------------------------------------------------------
-- criar_conta_pagar: 'fornecedores' agora é estrito (igual ao SIGNAL manual
-- que já existia — comportamento preservado, mensagem mais específica).
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS criar_conta_pagar$$
CREATE PROCEDURE criar_conta_pagar(
  IN p_descricao VARCHAR(500),
  IN p_valor DECIMAL(14,2),
  IN p_plano_conta_id CHAR(36),
  IN p_data DATE,
  IN p_data_vencimento DATE,
  IN p_competencia_mes DATE,
  IN p_terceiro_id CHAR(36),
  IN p_observacoes TEXT,
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_conta_pagar_id CHAR(36);
  DECLARE v_competencia DATE;
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
  -- A conta de despesa vem do formulário: sem conferir a loja, dava pra
  -- provisionar a despesa contra o plano de contas do vizinho.
  IF NOT EXISTS (
    SELECT 1 FROM plano_contas WHERE id = p_plano_conta_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta contábil não encontrada nesta loja';
  END IF;

  SET v_conta_pagar_id = conta_parametro('fornecedores');

  SET v_competencia = COALESCE(p_competencia_mes, mes_competencia(p_data));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
    terceiro_id, pago, competencia_mes, observacoes, criado_por, loja_id
  ) VALUES (
    p_lancamento_id, p_data, p_data_vencimento, p_descricao, p_valor, 'saida', p_plano_conta_id,
    p_terceiro_id, FALSE, v_competencia, p_observacoes, @current_usuario_id, @current_loja_id
  );

  CALL registrar_lancamento_contabil(
    p_data, v_competencia, CONCAT('Provisão: ', p_descricao),
    JSON_ARRAY(
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'debito', 'valor', CAST(p_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'credito', 'valor', CAST(p_valor AS DECIMAL(14,2)))
    ),
    'conta_pagar_provisao', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$

-- ---------------------------------------------------------------------------
-- criar_fatura_avulsa: 'mensalidades' agora é estrito. Antes tolerava
-- silenciosamente a ausência (a fatura nascia com plano_conta_id NULL);
-- gerar_mensalidades, que cria o mesmo tipo de fatura, sempre recusou
-- nesse caso — este ajuste deixa os dois caminhos consistentes.
-- ---------------------------------------------------------------------------
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

  CALL _postar_provisao_fatura(p_lancamento_id, p_valor, LAST_DAY(v_comp), v_comp, v_desc, p_rateio);
  IF v_own_tx THEN COMMIT; END IF;
END$$

-- ---------------------------------------------------------------------------
-- baixar_conta_pagar: 'fornecedores' opcional (placeholder-sentinela do
-- regime de caixa — o registrar_lancamento_contabil já substitui quando
-- ausente).
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS baixar_conta_pagar$$
CREATE PROCEDURE baixar_conta_pagar(
  IN p_lancamento_id CHAR(36),
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE
)
BEGIN
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao VARCHAR(500);
  DECLARE v_pago BOOLEAN;
  DECLARE v_valor_pago DECIMAL(14,2);
  DECLARE v_conta_pagar_id CHAR(36);
  DECLARE v_plano_conta_banco CHAR(36);
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

  SELECT valor, descricao, pago, valor_pago INTO v_valor, v_descricao, v_pago, v_valor_pago
  FROM lancamentos
  WHERE id = p_lancamento_id AND tipo = 'saida' AND loja_id = @current_loja_id
  FOR UPDATE;
  IF v_valor IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta a pagar não encontrada';
  END IF;
  IF v_pago THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conta a pagar já foi baixada';
  END IF;
  IF v_valor_pago > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conta a pagar já tem pagamento parcial registrado';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = p_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não é desta loja ou não tem conta do plano de contas vinculada';
  END IF;

  SET v_conta_pagar_id = conta_parametro_opcional('fornecedores');

  UPDATE lancamentos
  SET pago = TRUE, valor_pago = v_valor, data_pagamento = p_data_pagamento,
      conta_id = p_conta_financeira_id, forma_pagamento = p_forma_pagamento
  WHERE id = p_lancamento_id AND loja_id = @current_loja_id;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento), CONCAT('Baixa: ', v_descricao),
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'debito', 'valor', CAST(v_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor AS DECIMAL(14,2)))
    ),
    'conta_pagar_baixa', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$

-- ---------------------------------------------------------------------------
-- gerar_mensalidades: 'mensalidades' estrito (comportamento preservado,
-- mensagem mais específica).
-- ---------------------------------------------------------------------------
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

      CALL _postar_provisao_fatura(v_lanc_id, COALESCE(v_valor_historico, v_valor_mensalidade), CURRENT_DATE, v_comp, v_desc, p_rateio);

      SET p_total = p_total + 1;
    END IF;
  END LOOP;
  CLOSE cur;
  IF v_own_tx THEN COMMIT; END IF;
END$$

-- ---------------------------------------------------------------------------
-- baixar_faturas: 'contas_a_receber' opcional (sentinela); 'multas_juros' e
-- 'descontos_concedidos' estritos, mas só exigidos quando o valor
-- correspondente é realmente cobrado (não força configurar o que a Loja
-- nunca usa).
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS baixar_faturas$$
CREATE PROCEDURE baixar_faturas(
  IN p_lancamento_ids JSON,
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE,
  IN p_desconto DECIMAL(14,2),
  IN p_observacoes TEXT,
  IN p_juros_adicional DECIMAL(14,2),
  IN p_valor_extra DECIMAL(14,2),
  IN p_plano_conta_extra_id CHAR(36),
  OUT p_recibo_id CHAR(36)
)
BEGIN
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_n_irmaos INT;
  DECLARE v_n_selecionadas INT;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_receber_id CHAR(36);
  DECLARE v_soma_original DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_multa DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_juros DECIMAL(14,2) DEFAULT 0;
  DECLARE v_juros_adicional DECIMAL(14,2) DEFAULT COALESCE(p_juros_adicional, 0);
  DECLARE v_valor_extra DECIMAL(14,2) DEFAULT COALESCE(p_valor_extra, 0);
  DECLARE v_total DECIMAL(14,2);
  DECLARE v_itens JSON;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_vencimento DATE;
  DECLARE v_multa DECIMAL(14,2);
  DECLARE v_juros DECIMAL(14,2);
  DECLARE v_dias INT;
  DECLARE v_calc_total DECIMAL(14,2);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT id, valor, data_vencimento FROM lancamentos
     WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id;
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
  IF p_lancamento_ids IS NULL OR JSON_LENGTH(p_lancamento_ids) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos uma fatura';
  END IF;
  IF v_valor_extra > 0 AND p_plano_conta_extra_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione a conta de receita do valor extra';
  END IF;

  SELECT id FROM lancamentos
   WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id
   FOR UPDATE;

  -- Um id que não é desta Loja simplesmente não casa acima. Comparar a
  -- contagem com o tamanho do JSON transforma esse silêncio em erro: melhor
  -- recusar a baixa inteira do que baixar só parte do que a tela mostrou.
  SELECT COUNT(*) INTO v_n_selecionadas FROM lancamentos
   WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id;
  IF v_n_selecionadas <> JSON_LENGTH(p_lancamento_ids) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura selecionada não pertence a esta loja';
  END IF;

  SELECT COUNT(DISTINCT irmao_id) INTO v_n_irmaos FROM lancamentos
   WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id;
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO v_irmao_id FROM lancamentos
   WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id LIMIT 1;

  IF EXISTS (
    SELECT 1 FROM lancamentos
     WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id
       AND (tipo <> 'entrada' OR pago OR valor_pago > 0)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura selecionada já está paga, já tem pagamento parcial registrado, ou não é uma fatura em aberto';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = p_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não é desta loja ou não tem conta do plano de contas vinculada';
  END IF;
  IF v_valor_extra > 0 AND NOT EXISTS (
    SELECT 1 FROM plano_contas WHERE id = p_plano_conta_extra_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta de receita do valor extra não encontrada nesta loja';
  END IF;

  SET v_receber_id = conta_parametro_opcional('contas_a_receber');

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  calc_loop: LOOP
    FETCH cur INTO v_id, v_valor, v_vencimento;
    IF v_done THEN LEAVE calc_loop; END IF;
    CALL calcular_multa_juros(v_valor, v_vencimento, p_data_pagamento, v_multa, v_juros, v_dias, v_calc_total);
    SET v_soma_original = v_soma_original + v_valor;
    SET v_soma_multa = v_soma_multa + v_multa;
    SET v_soma_juros = v_soma_juros + v_juros;
  END LOOP;
  CLOSE cur;
  SET v_soma_juros = v_soma_juros + v_juros_adicional;

  SET v_total = v_soma_original + v_soma_multa + v_soma_juros + v_valor_extra - COALESCE(p_desconto, 0);
  IF v_total < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Desconto maior que o valor total da baixa';
  END IF;

  SET p_recibo_id = UUID();
  INSERT INTO recibos (
    id, irmao_id, data, valor_original, valor_multa, valor_juros, desconto,
    valor_extra, plano_conta_extra_id, valor_total, forma_pagamento, conta_financeira_id,
    observacoes, criado_por, loja_id
  ) VALUES (
    p_recibo_id, v_irmao_id, p_data_pagamento, v_soma_original, v_soma_multa, v_soma_juros, COALESCE(p_desconto, 0),
    v_valor_extra, p_plano_conta_extra_id, v_total, p_forma_pagamento, p_conta_financeira_id,
    p_observacoes, @current_usuario_id, @current_loja_id
  );

  SET v_done = FALSE;
  OPEN cur;
  itens_loop: LOOP
    FETCH cur INTO v_id, v_valor, v_vencimento;
    IF v_done THEN LEAVE itens_loop; END IF;
    CALL calcular_multa_juros(v_valor, v_vencimento, p_data_pagamento, v_multa, v_juros, v_dias, v_calc_total);

    INSERT INTO recibo_itens (recibo_id, lancamento_id, valor_original, valor_multa, valor_juros, loja_id)
    VALUES (p_recibo_id, v_id, v_valor, v_multa, v_juros, @current_loja_id);

    UPDATE lancamentos
    SET pago = TRUE, valor_pago = v_valor, data_pagamento = p_data_pagamento, conta_id = p_conta_financeira_id,
        forma_pagamento = p_forma_pagamento, recibo_id = p_recibo_id
    WHERE id = v_id AND loja_id = @current_loja_id;
  END LOOP;
  CLOSE cur;

  SET v_itens = JSON_ARRAY(JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_total AS DECIMAL(14,2))));
  IF COALESCE(p_desconto, 0) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', conta_parametro('descontos_concedidos'), 'tipo', 'debito', 'valor', CAST(p_desconto AS DECIMAL(14,2))));
  END IF;
  SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_soma_original AS DECIMAL(14,2))));
  IF (v_soma_multa + v_soma_juros) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', conta_parametro('multas_juros'), 'tipo', 'credito', 'valor', CAST(v_soma_multa + v_soma_juros AS DECIMAL(14,2))));
  END IF;
  IF v_valor_extra > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', p_plano_conta_extra_id, 'tipo', 'credito', 'valor', CAST(v_valor_extra AS DECIMAL(14,2))));
  END IF;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento),
    'Recibo (baixa de fatura)', v_itens, 'recibo_baixa', p_recibo_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$

-- ---------------------------------------------------------------------------
-- baixar_pagamento_parcial: 'contas_a_receber' opcional (sentinela).
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS baixar_pagamento_parcial$$
CREATE PROCEDURE baixar_pagamento_parcial(
  IN p_alocacao JSON,
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE,
  IN p_observacoes TEXT,
  OUT p_recibo_id CHAR(36)
)
BEGIN
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_n_irmaos INT;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_receber_id CHAR(36);
  DECLARE v_total DECIMAL(14,2) DEFAULT 0;
  DECLARE v_qtd_alocacao INT;
  DECLARE v_qtd_distintos INT;
  DECLARE v_qtd_validos INT;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_valor_fatura DECIMAL(14,2);
  DECLARE v_valor_pago_atual DECIMAL(14,2);
  DECLARE v_novo_valor_pago DECIMAL(14,2);
  DECLARE v_fecha BOOLEAN;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT jt.lancamento_id, jt.valor, l.valor, l.valor_pago
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
  IF p_alocacao IS NULL OR JSON_LENGTH(p_alocacao) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe ao menos uma fatura e o valor a aplicar';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT lancamento_id) INTO v_qtd_alocacao, v_qtd_distintos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt;
  IF v_qtd_distintos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A mesma fatura não pode aparecer duas vezes na alocação';
  END IF;

  SELECT id FROM lancamentos
  WHERE loja_id = @current_loja_id
    AND id IN (SELECT lancamento_id FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt)
  FOR UPDATE;

  SELECT COUNT(DISTINCT l.irmao_id), MIN(l.irmao_id) INTO v_n_irmaos, v_irmao_id
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id')) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id;
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;

  -- Fatura de outra Loja não casa no JOIN e cai fora da contagem de válidos,
  -- então a alocação inteira é recusada — que é o comportamento certo.
  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(
      lancamento_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.lancamento_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  JOIN lancamentos l ON l.id = jt.lancamento_id AND l.loja_id = @current_loja_id
  WHERE l.tipo = 'entrada' AND l.pago = FALSE AND jt.valor > 0 AND jt.valor <= (l.valor - l.valor_pago);
  IF v_qtd_validos <> v_qtd_alocacao THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura já está paga, não é desta loja, não é uma fatura em aberto, ou o valor aplicado é inválido (deve ser maior que zero e não passar do saldo)';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = p_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não é desta loja ou não tem conta do plano de contas vinculada';
  END IF;

  SELECT COALESCE(SUM(jt.valor), 0) INTO v_total
  FROM JSON_TABLE(p_alocacao, '$[*]' COLUMNS(valor DECIMAL(14,2) PATH '$.valor')) jt;

  SET v_receber_id = conta_parametro_opcional('contas_a_receber');

  SET p_recibo_id = UUID();
  INSERT INTO recibos (id, irmao_id, data, valor_original, valor_total, forma_pagamento, conta_financeira_id, observacoes, criado_por, loja_id)
  VALUES (p_recibo_id, v_irmao_id, p_data_pagamento, v_total, v_total, p_forma_pagamento, p_conta_financeira_id, p_observacoes, @current_usuario_id, @current_loja_id);

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  loop_alocacao: LOOP
    FETCH cur INTO v_lanc_id, v_valor_aplicado, v_valor_fatura, v_valor_pago_atual;
    IF v_done THEN LEAVE loop_alocacao; END IF;

    INSERT INTO recibo_itens (recibo_id, lancamento_id, valor_original, loja_id)
    VALUES (p_recibo_id, v_lanc_id, v_valor_aplicado, @current_loja_id);

    SET v_novo_valor_pago = v_valor_pago_atual + v_valor_aplicado;
    SET v_fecha = (v_novo_valor_pago >= v_valor_fatura);

    UPDATE lancamentos
    SET valor_pago = v_novo_valor_pago,
        pago = v_fecha,
        data_pagamento = IF(v_fecha, p_data_pagamento, data_pagamento),
        conta_id = IF(v_fecha, p_conta_financeira_id, conta_id),
        forma_pagamento = IF(v_fecha, p_forma_pagamento, forma_pagamento),
        recibo_id = IF(v_fecha, p_recibo_id, recibo_id)
    WHERE id = v_lanc_id AND loja_id = @current_loja_id;
  END LOOP;
  CLOSE cur;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento),
    'Recibo (pagamento parcial)',
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_total AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_total AS DECIMAL(14,2)))
    ),
    'recibo_baixa_parcial', p_recibo_id, @lanc_contabil_id
  );

  IF v_own_tx THEN COMMIT; END IF;
END$$

-- ---------------------------------------------------------------------------
-- fechar_exercicio: 'resultado_acumulado' estrito (comportamento
-- preservado, mensagem mais específica).
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS fechar_exercicio$$
CREATE PROCEDURE fechar_exercicio(
  IN p_exercicio INT, IN p_data_corte DATE, IN p_observacoes TEXT, OUT p_fechamento_id CHAR(36)
)
BEGIN
  DECLARE v_resultados_id CHAR(36);
  DECLARE v_itens JSON DEFAULT (JSON_ARRAY());
  DECLARE v_total_receita DECIMAL(14,2) DEFAULT 0;
  DECLARE v_total_despesa DECIMAL(14,2) DEFAULT 0;
  DECLARE v_resultado DECIMAL(14,2);
  DECLARE v_saldo DECIMAL(14,2);
  DECLARE v_lanc_id CHAR(36) DEFAULT NULL;
  DECLARE v_existing_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_tipo VARCHAR(30);
  DECLARE v_debito DECIMAL(14,2);
  DECLARE v_credito DECIMAL(14,2);
  DECLARE cur CURSOR FOR
    SELECT pc.id, pc.tipo,
      COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0)
    FROM plano_contas pc
    JOIN lancamentos_contabeis_itens i ON i.conta_id = pc.id AND i.loja_id = pc.loja_id
    JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id AND lc.loja_id = i.loja_id
    WHERE pc.loja_id = @current_loja_id
      AND pc.tipo IN ('receita', 'despesa') AND pc.analitica AND lc.data <= p_data_corte
    GROUP BY pc.id, pc.tipo;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;

  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin fecha o exercício';
  END IF;
  IF YEAR(p_data_corte) <> p_exercicio THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A data de corte não pertence ao exercício informado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM fechamentos_exercicio
     WHERE exercicio = p_exercicio AND status = 'fechado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este exercício já está fechado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM fechamentos_exercicio
     WHERE exercicio > p_exercicio AND status = 'fechado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um exercício mais recente já fechado — feche os exercícios em ordem cronológica';
  END IF;

  SET v_resultados_id = conta_parametro('resultado_acumulado');

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  calc_loop: LOOP
    FETCH cur INTO v_conta_id, v_tipo, v_debito, v_credito;
    IF v_done THEN LEAVE calc_loop; END IF;

    IF v_tipo = 'receita' THEN
      SET v_saldo = v_credito - v_debito;
      IF v_saldo > 0 THEN
        SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_conta_id, 'tipo', 'debito', 'valor', CAST(v_saldo AS DECIMAL(14,2))));
      ELSEIF v_saldo < 0 THEN
        SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_conta_id, 'tipo', 'credito', 'valor', CAST(-v_saldo AS DECIMAL(14,2))));
      END IF;
      SET v_total_receita = v_total_receita + v_saldo;
    ELSE
      SET v_saldo = v_debito - v_credito;
      IF v_saldo > 0 THEN
        SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_conta_id, 'tipo', 'credito', 'valor', CAST(v_saldo AS DECIMAL(14,2))));
      ELSEIF v_saldo < 0 THEN
        SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_conta_id, 'tipo', 'debito', 'valor', CAST(-v_saldo AS DECIMAL(14,2))));
      END IF;
      SET v_total_despesa = v_total_despesa + v_saldo;
    END IF;
  END LOOP;
  CLOSE cur;

  SET v_resultado = v_total_receita - v_total_despesa;

  IF JSON_LENGTH(v_itens) > 0 THEN
    IF v_resultado > 0 THEN
      SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_resultados_id, 'tipo', 'credito', 'valor', CAST(v_resultado AS DECIMAL(14,2))));
    ELSEIF v_resultado < 0 THEN
      SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_resultados_id, 'tipo', 'debito', 'valor', CAST(-v_resultado AS DECIMAL(14,2))));
    END IF;

    CALL registrar_lancamento_contabil(
      p_data_corte, mes_competencia(p_data_corte),
      CONCAT('Apuração de resultado e fechamento do exercício ', p_exercicio),
      v_itens, 'fechamento_exercicio', NULL, v_lanc_id
    );
  END IF;

  SELECT id INTO v_existing_id FROM fechamentos_exercicio
   WHERE exercicio = p_exercicio AND loja_id = @current_loja_id;
  IF v_existing_id IS NOT NULL THEN
    SET p_fechamento_id = v_existing_id;
    UPDATE fechamentos_exercicio SET
      data_corte = p_data_corte, status = 'fechado', lancamento_transporte_id = v_lanc_id,
      resultado_apurado = v_resultado, fechado_por = @current_usuario_id, fechado_em = NOW(),
      reaberto_por = NULL, reaberto_em = NULL, motivo_reabertura = NULL, observacoes = p_observacoes
    WHERE id = p_fechamento_id AND loja_id = @current_loja_id;
  ELSE
    SET p_fechamento_id = UUID();
    INSERT INTO fechamentos_exercicio
      (id, exercicio, data_corte, status, lancamento_transporte_id, resultado_apurado,
       fechado_por, fechado_em, observacoes, loja_id)
    VALUES
      (p_fechamento_id, p_exercicio, p_data_corte, 'fechado', v_lanc_id, v_resultado,
       @current_usuario_id, NOW(), p_observacoes, @current_loja_id);
  END IF;

  INSERT INTO fechamentos_exercicio_eventos
    (fechamento_id, acao, lancamento_id, realizado_por, motivo, loja_id)
  VALUES
    (p_fechamento_id, 'fechamento', v_lanc_id, @current_usuario_id, p_observacoes, @current_loja_id);
END$$

-- ---------------------------------------------------------------------------
-- conciliar_ofx_lote: 'contas_a_receber'/'fornecedores' opcionais
-- (sentinela do regime de caixa).
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

  SET v_receber_id = conta_parametro_opcional('contas_a_receber');
  SET v_pagar_id = conta_parametro_opcional('fornecedores');

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

-- ---------------------------------------------------------------------------
-- conciliar_ofx_baixando_lancamento: 'contas_a_receber'/'fornecedores'
-- opcionais (sentinela).
-- ---------------------------------------------------------------------------
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
      SET v_receber_id = conta_parametro_opcional('contas_a_receber');
      CALL registrar_lancamento_contabil(
        v_ofx_data, mes_competencia(v_ofx_data), CONCAT('Baixa via conciliação: ', v_lanc_desc),
        JSON_ARRAY(
          JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2))),
          JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2)))
        ),
        'conciliacao_baixa', p_lancamento_id, @lanc_contabil_id
      );
    ELSE
      SET v_pagar_id = conta_parametro_opcional('fornecedores');
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

DELIMITER ;
