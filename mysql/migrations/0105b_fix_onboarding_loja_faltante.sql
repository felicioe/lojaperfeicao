-- =============================================================================
-- Migração 0105b: aplica o restante da 0105 que faltou em produção
--
-- O diagnóstico confirmou que a migração 0105 (onboarding da loja convidada,
-- issue #340) NÃO rodou em produção — só a parte de `potencias.logo_url` já
-- foi corrigida separadamente pela 0118b. Isso deixa faltando:
--   - `lojas.onboarding_concluido` (usada por obterLojaAtual em TODA página
--     autenticada — sem a coluna, a query quebra com "Unknown column")
--   - a procedure `seed_loja_padrao` (chamada ao criar uma Loja nova em
--     saas-lojas.ts — sem ela, criar Loja falha)
--   - o backfill/limpeza de configuracoes_lgpd.nome_entidade/cnpj
--
-- Não repete `potencias.logo_url` (já existe, adicionada pela 0118b).
-- =============================================================================

UPDATE lojas l
JOIN configuracoes_lgpd c ON c.loja_id = l.id
SET l.razao_social = COALESCE(NULLIF(l.razao_social, ''), c.nome_entidade),
    l.cnpj = COALESCE(NULLIF(l.cnpj, ''), c.cnpj)
WHERE c.nome_entidade IS NOT NULL OR c.cnpj IS NOT NULL;

ALTER TABLE configuracoes_lgpd
  DROP COLUMN nome_entidade,
  DROP COLUMN cnpj;

ALTER TABLE lojas
  ADD COLUMN onboarding_concluido TINYINT(1) NOT NULL DEFAULT 0;

-- Lojas já em uso não devem cair no assistente de primeira configuração.
UPDATE lojas SET onboarding_concluido = TRUE;

DELIMITER $$

DROP PROCEDURE IF EXISTS seed_loja_padrao$$
CREATE PROCEDURE seed_loja_padrao(IN p_loja_id CHAR(36))
BEGIN
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id) VALUES
    (p_loja_id, '1', 'Ativo', 'ativo', FALSE, NULL),
    (p_loja_id, '2', 'Passivo', 'passivo', FALSE, NULL),
    (p_loja_id, '3', 'Patrimônio Líquido', 'patrimonio_liquido', FALSE, NULL),
    (p_loja_id, '4', 'Receitas', 'receita', FALSE, NULL),
    (p_loja_id, '5', 'Despesas', 'despesa', FALSE, NULL);

  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '1.1', 'Ativo Circulante', 'ativo', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '1.2', 'Ativo Não Circulante', 'ativo', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '2.1', 'Passivo Circulante', 'passivo', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '2';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '3.1', 'Patrimônio Social', 'patrimonio_liquido', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '3';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '4.1', 'Receitas Operacionais', 'receita', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '4.9', 'Outras Receitas', 'receita', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '5.1', 'Despesas Operacionais', 'despesa', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '5';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '5.9', 'Outras Despesas', 'despesa', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '5';

  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '1.1.1', 'Disponibilidades', 'ativo', FALSE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '1.1';

  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '1.1.1.01', 'Caixa', 'ativo', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '1.1.1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '1.1.02', 'Contas a Receber', 'ativo', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '1.1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '2.1.01', 'Fornecedores', 'passivo', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '2.1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '3.1.01', 'Superávit/Déficit Acumulado', 'patrimonio_liquido', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '3.1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '4.1.01', 'Mensalidades', 'receita', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4.1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '4.1.06', 'Multas e Juros Recebidos', 'receita', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4.1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '4.9.01', 'Outras Receitas', 'receita', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4.9';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '5.1.06', 'Descontos Concedidos', 'despesa', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '5.1';
  INSERT INTO plano_contas (loja_id, codigo, nome, tipo, analitica, parent_id)
  SELECT p_loja_id, '5.9.01', 'Outras Despesas', 'despesa', TRUE, id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '5.9';

  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'contas_a_receber', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '1.1.02';
  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'fornecedores', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '2.1.01';
  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'mensalidades', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4.1.01';
  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'multas_juros', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4.1.06';
  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'descontos_concedidos', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '5.1.06';
  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'resultado_receita_padrao', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '4.9.01';
  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'resultado_despesa_padrao', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '5.9.01';
  INSERT INTO parametros_contabeis (loja_id, papel, plano_conta_id)
  SELECT p_loja_id, 'resultado_acumulado', id FROM plano_contas WHERE loja_id = p_loja_id AND codigo = '3.1.01';

  INSERT INTO parametros_financeiros (loja_id) VALUES (p_loja_id);

  INSERT INTO cargos (loja_id, org_id, nome, ordem) VALUES
    (p_loja_id, NULL, 'Sapientíssimo', 1),
    (p_loja_id, NULL, '1º Vigilante', 2),
    (p_loja_id, NULL, '2º Vigilante', 3),
    (p_loja_id, NULL, 'Orador', 4),
    (p_loja_id, NULL, 'Secretário', 5),
    (p_loja_id, NULL, 'Tesoureiro', 6),
    (p_loja_id, NULL, 'Chanceler', 7),
    (p_loja_id, NULL, 'Mestre de Cerimônias', 8),
    (p_loja_id, NULL, 'Hospitaleiro', 9),
    (p_loja_id, NULL, 'Cobridor', 10);

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
