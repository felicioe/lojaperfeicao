-- =============================================================================
-- Migração 0105: onboarding da loja convidada (issue #340)
--
-- Antes desta migração, criar uma Loja nova (saas-lojas.ts, issue #339) só
-- gravava a linha em `lojas` — nenhum plano de contas, cargo ou parâmetro
-- nascia junto. Sem eles a Loja é inutilizável: toda baixa de fatura falha
-- com o SIGNAL de "papel contábil não configurado" (#354), e Gestões não
-- tem cargo nenhum pra vincular. Esta migração cria `seed_loja_padrao`,
-- chamada por `salvarLoja` no momento da criação (issue #340).
--
-- Também: unifica razão social/CNPJ em `lojas.razao_social`/`cnpj` (decisão
-- do usuário) em vez de duplicados em `configuracoes_lgpd`; adiciona
-- `potencias.logo_url` (a "logo do SGCAB" do cabeçalho institucional é, no
-- modelo de dados, o logo da Potência da Loja, não de um Org); e marca as
-- Lojas já existentes como "onboarding concluído" para não forçar o
-- assistente de primeira configuração em quem já está em produção.
-- =============================================================================

-- Backfill: Lojas cujo razao_social/cnpj ainda está vazio herdam o que já
-- estava em configuracoes_lgpd (a fonte usada até aqui pela Política de
-- Privacidade) antes de as colunas duplicadas serem removidas de lá.
UPDATE lojas l
JOIN configuracoes_lgpd c ON c.loja_id = l.id
SET l.razao_social = COALESCE(NULLIF(l.razao_social, ''), c.nome_entidade),
    l.cnpj = COALESCE(NULLIF(l.cnpj, ''), c.cnpj)
WHERE c.nome_entidade IS NOT NULL OR c.cnpj IS NOT NULL;

ALTER TABLE configuracoes_lgpd
  DROP COLUMN nome_entidade,
  DROP COLUMN cnpj;

ALTER TABLE potencias
  ADD COLUMN logo_url VARCHAR(255) NULL AFTER site;

ALTER TABLE lojas
  ADD COLUMN onboarding_concluido TINYINT(1) NOT NULL DEFAULT 0;

-- Lojas de antes desta migração já estão em uso — não fazem sentido cair no
-- assistente de primeira configuração na próxima vez que o admin logar.
UPDATE lojas SET onboarding_concluido = TRUE;

DELIMITER $$

-- ---------------------------------------------------------------------------
-- seed_loja_padrao — chamada uma vez, ao criar a Loja (saas-lojas.ts).
-- Plano de contas mínimo com os 8 papéis que os parâmetros contábeis (#354)
-- exigem, parâmetros financeiros com os DEFAULTs de coluna, e o catálogo de
-- 10 cargos institucionais (mesmo catálogo semeado globalmente pela 0030,
-- antes da Loja existir como conceito).
-- ---------------------------------------------------------------------------
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

  -- Analíticas — inclui as 8 usadas pelos parâmetros contábeis (#354).
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

  -- DEFAULTs de coluna (multa 2%, juros 0,033%/dia) já são valores razoáveis.
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
