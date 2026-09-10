-- =============================================================================
-- Migração 0136: recria a função conta_parametro (achado ao testar o rateio
-- ao vivo, issue-menos: gap de produção)
--
-- CONTEXTO. Ao testar criarFaturaAvulsa em produção, o banco retornou
-- "FUNCTION u630316951_ado.conta_parametro does not exist". conta_parametro
-- e conta_parametro_opcional foram criadas juntas na migração 0104, uma logo
-- depois da outra (mesmo bloco DELIMITER). conta_parametro_opcional
-- claramente existe e funciona em produção (é chamada por
-- registrar_lancamento_contabil em toda baixa bem-sucedida já registrada no
-- Diário Contábil). Por algum motivo — aplicação parcial da 0104, ou falha
-- silenciosa nesse CREATE FUNCTION específico —, só conta_parametro (a
-- variante que sinaliza erro quando o papel não está configurado, usada por
-- criar_fatura_avulsa/gerar_mensalidades/criar_conta_pagar/salvar_conta para
-- resolver a conta de receita/despesa padrão) nunca chegou a existir de
-- verdade em produção. Isso bloqueava a emissão de QUALQUER fatura nova
-- avulsa ou mensalidade em lote, não só as com rateio.
--
-- CORREÇÃO. Recria conta_parametro exatamente como definida na 0104 — sem
-- nenhuma mudança de comportamento, só fechando o gap entre migração e banco.
-- =============================================================================

DELIMITER $$

DROP FUNCTION IF EXISTS conta_parametro$$
CREATE FUNCTION conta_parametro(p_papel VARCHAR(40))
RETURNS CHAR(36)
  READS SQL DATA
BEGIN
  DECLARE v_conta_id CHAR(36);
  DECLARE v_msg VARCHAR(255);
  SET v_conta_id = conta_parametro_opcional(p_papel);
  IF v_conta_id IS NULL THEN
    SET v_msg = CONCAT(
      'Parâmetro contábil "', p_papel, '" não configurado. ',
      'Configure em Contabilidade > Parâmetros Contábeis.'
    );
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;
  RETURN v_conta_id;
END$$

DELIMITER ;
