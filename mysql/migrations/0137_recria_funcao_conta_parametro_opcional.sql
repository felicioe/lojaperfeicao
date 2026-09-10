-- =============================================================================
-- Migração 0137: recria a função conta_parametro_opcional (segunda parte do
-- gap descoberto ao testar o rateio ao vivo — ver 0136)
--
-- CONTEXTO. A migração 0136 recriou conta_parametro, que internamente chama
-- conta_parametro_opcional (SET v_conta_id = conta_parametro_opcional(p_papel);
-- ver 0104). Depois de aplicar a 0136, criarFaturaAvulsa voltou a falhar —
-- desta vez com "FUNCTION u630316951_ado.conta_parametro_opcional does not
-- exist", capturado direto do corpo da resposta HTTP (o transporte retorna
-- 200 mesmo quando a RPC falha, então o status HTTP sozinho não denunciava
-- o erro). Ou seja: as duas funções da 0104 nunca existiram de verdade em
-- produção, não só uma — o primeiro fix só revelou o gap seguinte, um nível
-- mais fundo na cadeia de chamadas.
--
-- CORREÇÃO. Recria conta_parametro_opcional exatamente como definida na
-- 0104, sem nenhuma mudança de comportamento.
-- =============================================================================

DELIMITER $$

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

DELIMITER ;
