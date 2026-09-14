-- =========================================
-- Defesa em profundidade: loja_id explícito nas rotinas internas de rateio
-- (issue #602 da reavaliação SaaS/multi-loja).
--
-- _rateio_split_lancamento e contas_resultado_rateio (migração 0135) são
-- chamadas só de dentro de registrar_lancamento_contabil, que já garante
-- que p_lancamento_id/p_origem_id pertence a @current_loja_id antes de
-- chegar aqui — então hoje não há exploração possível. Mas as três queries
-- internas abaixo não tinham essa garantia por conta própria: se um
-- caminho de chamada novo for adicionado no futuro, ou um bug em outro
-- lugar passar um id de outra loja, elas leriam silenciosamente
-- fatura_rateio_itens/lancamentos/recibo_itens de outra loja. Redefine as
-- duas rotinas idênticas, só acrescentando `AND loja_id = @current_loja_id`
-- nas três SELECTs — mesma filosofia de "a escrita/leitura verifica a
-- permissão sozinha" já seguida no resto do banco.
-- =========================================

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

  SELECT COUNT(*) INTO v_n FROM fatura_rateio_itens
   WHERE lancamento_id = p_lancamento_id AND loja_id = @current_loja_id;

  -- Sem rateio configurado: uma única linha com a própria conta do
  -- lançamento — mesmo resultado de sempre. plano_conta_id só fica NULL em
  -- casos legados; cai no mesmo parâmetro padrão que conta_resultado_caixa
  -- já usa, escolhido pela natureza do PRÓPRIO lançamento — 'conciliacao_baixa'
  -- (a única origem "manual" além de recibo_baixa/_parcial que passa por
  -- aqui) atende entrada E saída, e rateio só existe do lado receita, então
  -- uma saída sem plano_conta_id não pode cair no parâmetro de receita.
  IF v_n = 0 THEN
    SELECT plano_conta_id, tipo INTO v_conta_padrao, v_tipo_lanc
    FROM lancamentos WHERE id = p_lancamento_id AND loja_id = @current_loja_id;
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
    WHERE lancamento_id = p_lancamento_id AND loja_id = @current_loja_id
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
    WHERE recibo_id = p_origem_id AND loja_id = @current_loja_id ORDER BY id;
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

DELIMITER ;
