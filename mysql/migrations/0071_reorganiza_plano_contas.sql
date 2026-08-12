-- ============================================================
-- REORGANIZAÇÃO DO PLANO DE CONTAS
--
-- Consolida os dois planos sobrepostos no banco sem apagar contas nem
-- alterar os UUIDs usados pelo histórico. Contas duplicadas e contas de
-- competência sem uso são preservadas como inativas.
-- ============================================================

START TRANSACTION;

-- Libera códigos canônicos ocupados por duplicatas sem movimentação.
UPDATE plano_contas SET codigo = '1.1.90', nome = 'Caixa e Bancos (legado)', ativo = FALSE
WHERE codigo = '1.1.01';
UPDATE plano_contas SET codigo = '1.1.91', nome = 'Contas a Receber (legado — regime de competência)', ativo = FALSE
WHERE codigo = '1.1.02';
UPDATE plano_contas SET codigo = '1.1.92', ativo = FALSE WHERE codigo = '1.1.2.01';
UPDATE plano_contas SET codigo = '1.1.93', ativo = FALSE WHERE codigo = '1.1.2.02';
UPDATE plano_contas SET codigo = '2.1.91', ativo = FALSE WHERE codigo = '2.1.1.01';
UPDATE plano_contas SET codigo = '2.1.92', ativo = FALSE WHERE codigo = '2.1.1.02';

UPDATE plano_contas SET codigo = '3.9.02', ativo = FALSE WHERE codigo = '3.1.1.02';
UPDATE plano_contas SET codigo = '4.9.91', nome = 'Mensalidades (duplicata inativa)', ativo = FALSE
WHERE codigo = '4.1.1.01';
UPDATE plano_contas SET codigo = '4.9.92', nome = 'Eventos e Festas (duplicata inativa)', ativo = FALSE
WHERE codigo = '4.1.1.04';
UPDATE plano_contas SET codigo = '4.9.93', ativo = FALSE WHERE codigo = '4.2.1.02';

UPDATE plano_contas SET codigo = '5.9.91', ativo = FALSE
WHERE codigo = '5.1.02' AND nome = 'Água/Luz/Internet';
UPDATE plano_contas SET codigo = '5.9.92', ativo = FALSE
WHERE codigo = '5.1.03' AND nome = 'Manutenção';
UPDATE plano_contas SET codigo = '5.9.95' WHERE codigo = '5.1.05' AND nome = 'Beneficência';
UPDATE plano_contas SET codigo = '5.9.93', nome = 'Aluguel (duplicata inativa)', ativo = FALSE
WHERE codigo = '5.1.1.01';
UPDATE plano_contas SET codigo = '5.9.94', nome = 'Material de Consumo (duplicata inativa)', ativo = FALSE
WHERE codigo = '5.1.1.04';

-- Grupos sintéticos ausentes e contas de segurança do regime de caixa.
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '1.1.1', 'Disponibilidades', 'ativo', TRUE, FALSE, id FROM plano_contas WHERE codigo = '1.1';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '1.1.1.01', 'Caixa', 'ativo', TRUE, TRUE, id FROM plano_contas WHERE codigo = '1.1.1';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '1.2', 'Ativo Não Circulante', 'ativo', TRUE, FALSE, id FROM plano_contas WHERE codigo = '1';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '1.2.1', 'Investimentos', 'ativo', TRUE, FALSE, id FROM plano_contas WHERE codigo = '1.2';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '3.1', 'Patrimônio Social', 'patrimonio_liquido', TRUE, FALSE, id FROM plano_contas WHERE codigo = '3';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '4.1', 'Receitas Operacionais', 'receita', TRUE, FALSE, id FROM plano_contas WHERE codigo = '4';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '4.2', 'Receitas Financeiras', 'receita', TRUE, FALSE, id FROM plano_contas WHERE codigo = '4';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '4.9', 'Outras Receitas', 'receita', TRUE, FALSE, id FROM plano_contas WHERE codigo = '4';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '4.9.01', 'Outras Receitas', 'receita', TRUE, TRUE, id FROM plano_contas WHERE codigo = '4.9';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '5.1', 'Despesas Operacionais', 'despesa', TRUE, FALSE, id FROM plano_contas WHERE codigo = '5';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '5.2', 'Despesas Administrativas', 'despesa', TRUE, FALSE, id FROM plano_contas WHERE codigo = '5';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '5.3', 'Despesas Financeiras', 'despesa', TRUE, FALSE, id FROM plano_contas WHERE codigo = '5';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '5.9', 'Outras Despesas', 'despesa', TRUE, FALSE, id FROM plano_contas WHERE codigo = '5';
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, ativo, analitica, parent_id)
SELECT '5.9.01', 'Outras Despesas', 'despesa', TRUE, TRUE, id FROM plano_contas WHERE codigo = '5.9';

SET @pc_1_2_1 = (SELECT id FROM plano_contas WHERE codigo = '1.2.1');
SET @pc_3_1 = (SELECT id FROM plano_contas WHERE codigo = '3.1');
SET @pc_4_1 = (SELECT id FROM plano_contas WHERE codigo = '4.1');
SET @pc_4_2 = (SELECT id FROM plano_contas WHERE codigo = '4.2');
SET @pc_5_1 = (SELECT id FROM plano_contas WHERE codigo = '5.1');
SET @pc_5_2 = (SELECT id FROM plano_contas WHERE codigo = '5.2');
SET @pc_5_3 = (SELECT id FROM plano_contas WHERE codigo = '5.3');

-- Disponibilidades e investimentos.
UPDATE contas_financeiras cf
JOIN plano_contas pc ON pc.codigo = '1.1.1.01'
SET cf.plano_conta_id = pc.id
WHERE cf.nome = 'Caixa Geral';
UPDATE plano_contas SET codigo = '1.2.1.01', parent_id = @pc_1_2_1
WHERE codigo = '1.1.1.25';

-- Patrimônio social: preserva a conta exigida pelo fechamento anual.
UPDATE plano_contas SET nome = 'Superávit/Déficit Acumulado', parent_id = @pc_3_1
WHERE codigo = '3.1.01';
UPDATE plano_contas SET codigo = '3.1.02', parent_id = @pc_3_1
WHERE codigo = '3.1.1.01';

-- Receitas: mantém os UUIDs das contas que já possuem lançamentos.
UPDATE plano_contas SET codigo = '4.1.04', parent_id = @pc_4_1
WHERE codigo = '4.1.1.02';
UPDATE plano_contas SET codigo = '4.1.05', parent_id = @pc_4_1
WHERE codigo = '4.1.1.03';
UPDATE plano_contas SET codigo = '4.1.07', parent_id = @pc_4_1
WHERE codigo = '4.1.1.05';
UPDATE plano_contas SET codigo = '4.2.01', parent_id = @pc_4_2
WHERE codigo = '4.2.1.01';
UPDATE plano_contas SET nome = 'Eventos e Festas' WHERE codigo = '4.1.03';

-- Despesas operacionais. Os códigos temporários acima evitam colisões.
UPDATE plano_contas SET codigo = '5.1.02', parent_id = @pc_5_1
WHERE codigo = '5.1.1.02';
UPDATE plano_contas SET codigo = '5.1.03', parent_id = @pc_5_1
WHERE codigo = '5.1.1.03';
UPDATE plano_contas SET nome = 'Material de Consumo e Expediente' WHERE codigo = '5.1.04';
UPDATE plano_contas SET codigo = '5.1.05', parent_id = @pc_5_1
WHERE codigo = '5.1.1.05';
UPDATE plano_contas SET codigo = '5.1.07', parent_id = @pc_5_1
WHERE codigo = '5.9.95';

-- Despesas administrativas e financeiras.
UPDATE plano_contas SET codigo = '5.2.01', parent_id = @pc_5_2 WHERE codigo = '5.2.1.01';
UPDATE plano_contas SET codigo = '5.2.02', parent_id = @pc_5_2 WHERE codigo = '5.2.1.02';
UPDATE plano_contas SET codigo = '5.2.03', parent_id = @pc_5_2 WHERE codigo = '5.2.1.03';
UPDATE plano_contas SET codigo = '5.2.04', parent_id = @pc_5_2 WHERE codigo = '5.2.1.04';
UPDATE plano_contas SET codigo = '5.3.01', parent_id = @pc_5_3 WHERE codigo = '5.3.1.01';
UPDATE plano_contas SET codigo = '5.3.02', parent_id = @pc_5_3 WHERE codigo = '5.3.1.02';
UPDATE plano_contas SET codigo = '5.3.03', parent_id = @pc_5_3 WHERE codigo = '5.3.1.03';

-- Contas transitórias ficam disponíveis somente para compatibilidade das
-- procedures antigas; não aparecem nos seletores de contas ativas.
UPDATE plano_contas SET ativo = FALSE WHERE codigo = '2.1.01';
UPDATE plano_contas SET ativo = FALSE WHERE codigo = '1.1.2';

-- Corrige todos os pais pelo código canônico.
UPDATE plano_contas SET parent_id = @pc_4_1 WHERE codigo IN ('4.1.01','4.1.02','4.1.03','4.1.04','4.1.05','4.1.06','4.1.07');
UPDATE plano_contas SET parent_id = @pc_4_2 WHERE codigo = '4.2.01';
UPDATE plano_contas SET parent_id = @pc_5_1 WHERE codigo IN ('5.1.01','5.1.02','5.1.03','5.1.04','5.1.05','5.1.06','5.1.07');
UPDATE plano_contas SET parent_id = @pc_5_2 WHERE codigo IN ('5.2.01','5.2.02','5.2.03','5.2.04');
UPDATE plano_contas SET parent_id = @pc_5_3 WHERE codigo IN ('5.3.01','5.3.02','5.3.03');
UPDATE plano_contas SET analitica = FALSE WHERE codigo IN ('1','1.1','1.1.1','1.1.2','1.2','1.2.1','2','2.1','3','3.1','4','4.1','4.2','4.9','5','5.1','5.2','5.3','5.9');

COMMIT;

-- Nunca classifica uma origem desconhecida como Mensalidade ou Aluguel.
DROP FUNCTION IF EXISTS conta_resultado_caixa;
DELIMITER $$
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
    FROM recibo_itens ri JOIN lancamentos l ON l.id = ri.lancamento_id
    WHERE ri.recibo_id = p_origem_id AND l.plano_conta_id IS NOT NULL
    ORDER BY ri.id LIMIT 1;
  ELSE
    SELECT l.plano_conta_id INTO v_conta_id FROM lancamentos l WHERE l.id = p_origem_id LIMIT 1;
  END IF;

  IF v_conta_id IS NULL THEN
    SELECT original.plano_conta_id INTO v_conta_id
    FROM lancamentos parcela
    JOIN lancamentos original ON original.parcelamento_id = parcela.parcelamento_id
      AND original.plano_conta_id IS NOT NULL
    WHERE parcela.id = p_origem_id ORDER BY original.data, original.id LIMIT 1;
  END IF;

  IF v_conta_id IS NULL AND p_natureza = 'entrada' THEN
    SELECT id INTO v_conta_id FROM plano_contas WHERE codigo = '4.9.01' LIMIT 1;
  ELSEIF v_conta_id IS NULL AND p_natureza = 'saida' THEN
    SELECT id INTO v_conta_id FROM plano_contas WHERE codigo = '5.9.01' LIMIT 1;
  END IF;
  RETURN v_conta_id;
END$$
DELIMITER ;

-- Impede que edições futuras recriem hierarquias incompatíveis.
DROP PROCEDURE IF EXISTS salvar_conta;
DELIMITER $$
CREATE PROCEDURE salvar_conta(
  IN p_id CHAR(36), IN p_codigo VARCHAR(20), IN p_nome VARCHAR(255),
  IN p_tipo VARCHAR(30), IN p_parent_id CHAR(36), IN p_analitica BOOLEAN,
  OUT p_out_id CHAR(36)
)
BEGIN
  DECLARE v_cur CHAR(36);
  DECLARE v_hops INT DEFAULT 0;
  DECLARE v_parent_tipo VARCHAR(30);
  DECLARE v_parent_codigo VARCHAR(20);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_parent_id IS NOT NULL THEN
    SELECT tipo, codigo INTO v_parent_tipo, v_parent_codigo FROM plano_contas WHERE id = p_parent_id;
    IF v_parent_tipo IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta pai não encontrada'; END IF;
    IF v_parent_tipo <> p_tipo THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta pai e conta filha devem ter a mesma natureza'; END IF;
    IF p_codigo NOT LIKE CONCAT(v_parent_codigo, '.%') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O código da conta deve iniciar com o código da conta pai'; END IF;
    IF p_parent_id = p_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma conta não pode ser pai de si mesma'; END IF;
    SET v_cur = p_parent_id;
    WHILE v_cur IS NOT NULL AND v_hops < 50 DO
      IF v_cur = p_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ciclo detectado na hierarquia do plano de contas'; END IF;
      SELECT parent_id INTO v_cur FROM plano_contas WHERE id = v_cur;
      SET v_hops = v_hops + 1;
    END WHILE;
  END IF;
  IF p_id IS NOT NULL AND p_analitica AND EXISTS (SELECT 1 FROM plano_contas WHERE parent_id = p_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta com filhas não pode ser analítica';
  END IF;

  IF p_id IS NULL THEN
    SET p_out_id = UUID();
    INSERT INTO plano_contas (id,codigo,nome,tipo,parent_id,analitica) VALUES (p_out_id,p_codigo,p_nome,p_tipo,p_parent_id,p_analitica);
  ELSE
    SET p_out_id = p_id;
    UPDATE plano_contas SET codigo=p_codigo,nome=p_nome,tipo=p_tipo,parent_id=p_parent_id,analitica=p_analitica WHERE id=p_id;
  END IF;
  IF p_parent_id IS NOT NULL THEN UPDATE plano_contas SET analitica=FALSE WHERE id=p_parent_id; END IF;
  IF v_own_tx THEN COMMIT; END IF;
END$$
DELIMITER ;
