-- =============================================================================
-- Migração 0096: escopo de loja nas rotinas e nas views (issue #349)
--
-- A #337 escopou as ~455 consultas do backend TypeScript. As 40 rotinas do
-- BANCO e as 3 views ficaram de fora — e elas são anteriores ao multi-tenant:
-- 36 das 40 não citam `loja_id` em lugar nenhum. Com uma Loja só isso não
-- aparece, porque o DEFAULT transitório da 0092 faz todo INSERT sem loja cair
-- na Loja semente, que é a única que existe. Com duas, o estrago é grande e
-- silencioso: `baixar_faturas` daria baixa citando a conta contábil de outra
-- Loja, `fechar_exercicio` somaria o movimento de todas elas, `gerar_
-- mensalidades` criaria fatura na Loja errada.
--
-- COMO O ESCOPO CHEGA AQUI. Não foi criado um parâmetro `p_loja_id` em cada
-- rotina. O escopo vem de `@current_loja_id`, a mesma variável de sessão que
-- `withUserConnection()` (src/lib/backend/db.ts) já seta no checkout do pool,
-- derivada do próprio usuário autenticado. A rotina roda na MESMA conexão que
-- a chamou, então enxerga a variável. Três consequências:
--
--   1. nenhuma assinatura muda — o TypeScript continua chamando
--      `CALL baixar_faturas(...)` exatamente como antes;
--   2. a loja não pode ser forjada pelo chamador, porque ninguém a passa;
--   3. o mesmo mecanismo vale no backend e no banco, então não existem duas
--      fontes de verdade sobre "de quem é esta linha".
--
-- FALHA FECHADA. Toda rotina de escrita começa conferindo que
-- `@current_loja_id` não é NULL. Sem loja no contexto (um CALL disparado
-- direto no phpMyAdmin, por exemplo) a rotina recusa em vez de gravar sem
-- dono — o oposto do DEFAULT, que grava na Loja semente e esconde o erro.
--
-- O QUE NÃO FOI ESCOPADO, E POR QUÊ:
--   - `has_role`: recebe `usuario_id`, que já é único globalmente e já
--     pertence a uma loja. Filtrar por @current_loja_id aqui quebraria o
--     super_admin (issue #339), que age fora de qualquer loja.
--   - `is_admin_or`, `mes_competencia`: não tocam tabela de negócio.
--   - `efetivar_recorrentes_vencidas` e `_postar_provisao_fatura`: só chamam
--     outras rotinas, que já ficam escopadas.
--
-- VIEWS. MariaDB não aceita variável de usuário dentro de uma view ("View's
-- SELECT contains a variable or parameter"), então elas não podem se
-- auto-escopar. A saída é expor `loja_id` e deixar quem consulta filtrar —
-- que é o que o backend passa a fazer. As junções internas ganharam o
-- casamento de loja nos dois lados, para que o cálculo nunca misture as
-- Lojas mesmo que um id atravesse.
--
-- Ordem: aplicar DEPOIS de implantar o código correspondente (o backend
-- já convive com as duas versões) e ANTES da 0097, que remove os DEFAULT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Views
-- -----------------------------------------------------------------------------

-- Cada conta financeira pertence a uma loja, e o saldo é a soma dos eventos
-- que apontam para ela — então o valor já saía certo. O que faltava era a
-- coluna: sem `loja_id` na saída, quem consulta a view não tinha como filtrar
-- e listava as contas de todas as Lojas. O casamento de loja em cada braço da
-- UNION é defesa em profundidade: se um lançamento de uma Loja um dia apontar
-- para a conta de outra, ele não entra no saldo em vez de entrar calado.
CREATE OR REPLACE VIEW v_saldo_contas AS
SELECT
  c.id, c.loja_id, c.nome, c.tipo, c.saldo_inicial,
  c.saldo_inicial + COALESCE(m.total, 0) AS saldo_atual
FROM contas_financeiras c
LEFT JOIN (
  SELECT conta_financeira_id, loja_id, SUM(valor_sinal) AS total
  FROM (
    SELECT r.conta_financeira_id AS conta_financeira_id, r.loja_id AS loja_id,
           r.valor_total AS valor_sinal
    FROM recibos r

    UNION ALL

    SELECT c2.conta_financeira_id, c2.loja_id,
           CASE WHEN l.tipo = 'entrada' THEN cl.valor_aplicado ELSE -cl.valor_aplicado END
    FROM conciliacoes c2
    JOIN conciliacao_lancamentos cl ON cl.conciliacao_id = c2.id AND cl.loja_id = c2.loja_id
    JOIN lancamentos l ON l.id = cl.lancamento_id AND l.loja_id = c2.loja_id
    WHERE c2.status = 'ativa'

    UNION ALL

    SELECT o.conta_financeira_id, o.loja_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM ofx_lancamentos o
    JOIN lancamentos l ON l.id = o.lancamento_id AND l.loja_id = o.loja_id
    WHERE o.conciliado = TRUE AND o.conciliacao_id IS NULL

    UNION ALL

    SELECT l.conta_id, l.loja_id,
           CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.conta_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM recibo_itens ri
         WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id
                            AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o
         WHERE o.lancamento_id = l.id AND o.loja_id = l.loja_id AND o.conciliacao_id IS NULL
      )

    UNION ALL

    SELECT l.conta_destino_id, l.loja_id, l.valor
    FROM lancamentos l
    WHERE l.pago = TRUE AND l.tipo = 'transferencia' AND l.conta_destino_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM recibo_itens ri
         WHERE ri.lancamento_id = l.id AND ri.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM conciliacao_lancamentos cl
        JOIN conciliacoes co ON co.id = cl.conciliacao_id AND co.loja_id = cl.loja_id
                            AND co.status = 'ativa'
        WHERE cl.lancamento_id = l.id AND cl.loja_id = l.loja_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ofx_lancamentos o
         WHERE o.lancamento_id = l.id AND o.loja_id = l.loja_id AND o.conciliacao_id IS NULL
      )
  ) eventos
  GROUP BY conta_financeira_id, loja_id
) m ON m.conta_financeira_id = c.id AND m.loja_id = c.loja_id;

-- Estas duas somavam TODAS as Lojas e não expunham loja_id, então não dava
-- pra filtrar de fora: o saldo de cada conta vinha com o movimento das outras
-- somado, e a auditoria contábil de uma Loja apontava lançamento torto de
-- outra. O backend deixou de depender delas na #346 (as consultas foram
-- reescritas inline); aqui a view em si é corrigida, para quem consultar o
-- banco direto ver o mesmo número que a tela mostra.
CREATE OR REPLACE VIEW v_saldo_plano_contas AS
SELECT
  c.id, c.loja_id, c.codigo, c.nome, c.tipo,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS total_debito,
  COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS total_credito,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS saldo_devedor
FROM plano_contas c
LEFT JOIN lancamentos_contabeis_itens i ON i.conta_id = c.id AND i.loja_id = c.loja_id
WHERE c.analitica = TRUE
GROUP BY c.id, c.loja_id, c.codigo, c.nome, c.tipo;

CREATE OR REPLACE VIEW v_auditoria_contabil_desbalanceados AS
SELECT
  l.id AS lancamento_id, l.loja_id, l.data, l.descricao, l.origem_tipo, l.origem_id,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS total_debito,
  COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS total_credito,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS diferenca
FROM lancamentos_contabeis l
JOIN lancamentos_contabeis_itens i ON i.lancamento_id = l.id AND i.loja_id = l.loja_id
GROUP BY l.id, l.loja_id, l.data, l.descricao, l.origem_tipo, l.origem_id
HAVING total_debito <> total_credito;

-- -----------------------------------------------------------------------------
-- 2. Funções
-- -----------------------------------------------------------------------------

DELIMITER $$

-- `periodo_esta_fechado` é consultada pelos triggers de escrita para barrar
-- lançamento em período fechado. Sem escopo, o fechamento de uma Loja
-- travava a escrita de todas as outras.
DROP FUNCTION IF EXISTS periodo_esta_fechado$$
CREATE FUNCTION periodo_esta_fechado(p_data DATE) RETURNS BOOLEAN
  READS SQL DATA
  DETERMINISTIC
BEGIN
  IF p_data IS NULL THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM fechamentos_exercicio
     WHERE loja_id = @current_loja_id AND status = 'fechado' AND p_data <= data_corte
  ) THEN
    RETURN TRUE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM periodos_fechados
     WHERE loja_id = @current_loja_id AND status = 'fechado' AND p_data <= LAST_DAY(competencia)
  ) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END$$

-- Resolve a conta de resultado do regime de caixa. As duas buscas por código
-- ('4.9.01' / '5.9.01') pegavam a conta de qualquer Loja — com duas Lojas, o
-- lançamento contábil de uma iria parar no plano de contas da outra.
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
    SELECT id INTO v_conta_id FROM plano_contas
     WHERE codigo = '4.9.01' AND loja_id = @current_loja_id LIMIT 1;
  ELSEIF v_conta_id IS NULL AND p_natureza = 'saida' THEN
    SELECT id INTO v_conta_id FROM plano_contas
     WHERE codigo = '5.9.01' AND loja_id = @current_loja_id LIMIT 1;
  END IF;
  RETURN v_conta_id;
END$$

-- -----------------------------------------------------------------------------
-- 3. Procedures — orçamento, plano de contas, gestões, períodos
-- -----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS criar_orcamento$$
CREATE PROCEDURE criar_orcamento(IN p_ano INT, IN p_observacoes TEXT, OUT p_orcamento_id CHAR(36))
BEGIN
  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  -- Sem o filtro de loja, uma Loja nova não conseguiria criar o orçamento de
  -- um ano que outra Loja já tivesse criado.
  IF EXISTS (SELECT 1 FROM orcamentos WHERE ano = p_ano AND loja_id = @current_loja_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Já existe um orçamento cadastrado para este ano';
  END IF;

  SET p_orcamento_id = UUID();
  INSERT INTO orcamentos (id, ano, observacoes, criado_por, loja_id)
  VALUES (p_orcamento_id, p_ano, p_observacoes, @current_usuario_id, @current_loja_id);
END$$

DROP PROCEDURE IF EXISTS aprovar_orcamento$$
CREATE PROCEDURE aprovar_orcamento(IN p_orcamento_id CHAR(36))
BEGIN
  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin aprova o orçamento';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM orcamentos
     WHERE id = p_orcamento_id AND status = 'rascunho' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou já aprovado';
  END IF;

  UPDATE orcamentos SET status = 'aprovado', aprovado_por = @current_usuario_id, aprovado_em = NOW()
  WHERE id = p_orcamento_id AND loja_id = @current_loja_id;
END$$

DROP PROCEDURE IF EXISTS reabrir_orcamento$$
CREATE PROCEDURE reabrir_orcamento(IN p_orcamento_id CHAR(36))
BEGIN
  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o orçamento';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM orcamentos
     WHERE id = p_orcamento_id AND status = 'aprovado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou não está aprovado';
  END IF;

  UPDATE orcamentos SET status = 'rascunho', aprovado_por = NULL, aprovado_em = NULL
  WHERE id = p_orcamento_id AND loja_id = @current_loja_id;
END$$

DROP PROCEDURE IF EXISTS definir_valor_orcamento$$
CREATE PROCEDURE definir_valor_orcamento(
  IN p_orcamento_id CHAR(36), IN p_conta_id CHAR(36), IN p_mes INT, IN p_valor DECIMAL(14,2)
)
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_analitica BOOLEAN;
  DECLARE v_tipo VARCHAR(30);

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT status INTO v_status FROM orcamentos
   WHERE id = p_orcamento_id AND loja_id = @current_loja_id;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado';
  END IF;
  IF v_status <> 'rascunho' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento aprovado não pode ser editado — reabra antes de editar';
  END IF;

  -- A conta também tem que ser da Loja: sem isto dava para orçar contra o
  -- plano de contas do vizinho passando o id certo.
  SELECT analitica, tipo INTO v_analitica, v_tipo FROM plano_contas
   WHERE id = p_conta_id AND loja_id = @current_loja_id;
  IF v_analitica IS NULL OR NOT v_analitica OR v_tipo NOT IN ('receita', 'despesa') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta inválida para orçamento — selecione uma conta analítica de receita ou despesa';
  END IF;

  INSERT INTO orcamento_itens (orcamento_id, conta_id, mes, valor, loja_id)
  VALUES (p_orcamento_id, p_conta_id, p_mes, p_valor, @current_loja_id)
  ON DUPLICATE KEY UPDATE valor = VALUES(valor);
END$$

DROP PROCEDURE IF EXISTS salvar_conta$$
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

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_parent_id IS NOT NULL THEN
    SELECT tipo, codigo INTO v_parent_tipo, v_parent_codigo FROM plano_contas
     WHERE id = p_parent_id AND loja_id = @current_loja_id;
    IF v_parent_tipo IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta pai não encontrada'; END IF;
    IF v_parent_tipo <> p_tipo THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta pai e conta filha devem ter a mesma natureza'; END IF;
    IF p_codigo NOT LIKE CONCAT(v_parent_codigo, '.%') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O código da conta deve iniciar com o código da conta pai'; END IF;
    IF p_parent_id = p_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma conta não pode ser pai de si mesma'; END IF;
    SET v_cur = p_parent_id;
    WHILE v_cur IS NOT NULL AND v_hops < 50 DO
      IF v_cur = p_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ciclo detectado na hierarquia do plano de contas'; END IF;
      SELECT parent_id INTO v_cur FROM plano_contas
       WHERE id = v_cur AND loja_id = @current_loja_id;
      SET v_hops = v_hops + 1;
    END WHILE;
  END IF;
  IF p_id IS NOT NULL AND p_analitica AND EXISTS (
    SELECT 1 FROM plano_contas WHERE parent_id = p_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta com filhas não pode ser analítica';
  END IF;

  IF p_id IS NULL THEN
    SET p_out_id = UUID();
    INSERT INTO plano_contas (id,codigo,nome,tipo,parent_id,analitica,loja_id)
    VALUES (p_out_id,p_codigo,p_nome,p_tipo,p_parent_id,p_analitica,@current_loja_id);
  ELSE
    SET p_out_id = p_id;
    UPDATE plano_contas SET codigo=p_codigo,nome=p_nome,tipo=p_tipo,parent_id=p_parent_id,analitica=p_analitica
     WHERE id=p_id AND loja_id = @current_loja_id;
  END IF;
  IF p_parent_id IS NOT NULL THEN
    UPDATE plano_contas SET analitica=FALSE WHERE id=p_parent_id AND loja_id = @current_loja_id;
  END IF;
  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS ativar_gestao$$
CREATE PROCEDURE ativar_gestao(IN p_gestao_id CHAR(36))
BEGIN
  DECLARE v_org_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT org_id INTO v_org_id FROM gestoes
   WHERE id = p_gestao_id AND loja_id = @current_loja_id;
  IF v_org_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Gestão não encontrada';
  END IF;

  UPDATE gestoes SET ativo = FALSE, org_id_se_ativo = NULL
   WHERE org_id = v_org_id AND id <> p_gestao_id AND ativo AND loja_id = @current_loja_id;
  UPDATE gestoes SET ativo = TRUE, org_id_se_ativo = org_id
   WHERE id = p_gestao_id AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS gerar_graus_padrao_org$$
CREATE PROCEDURE gerar_graus_padrao_org(IN p_org_id CHAR(36), OUT p_total INT)
BEGIN
  DECLARE v_min INT;
  DECLARE v_max INT;
  DECLARE v_g INT;
  DECLARE v_nome VARCHAR(255);

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT grau_min, grau_max INTO v_min, v_max FROM orgs
   WHERE id = p_org_id AND loja_id = @current_loja_id;
  IF v_min IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Corpo não encontrado';
  END IF;

  SET v_g = v_min;
  WHILE v_g <= v_max DO
    SET v_nome = CASE v_g WHEN 1 THEN 'Aprendiz' WHEN 2 THEN 'Companheiro' WHEN 3 THEN 'Mestre' ELSE CONCAT('Grau ', v_g) END;
    INSERT IGNORE INTO orgs_graus (org_id, grau, nome, loja_id)
    VALUES (p_org_id, v_g, v_nome, @current_loja_id);
    SET v_g = v_g + 1;
  END WHILE;

  SELECT COUNT(*) INTO p_total FROM orgs_graus
   WHERE org_id = p_org_id AND loja_id = @current_loja_id;
END$$

DROP PROCEDURE IF EXISTS fechar_periodo$$
CREATE PROCEDURE fechar_periodo(IN p_competencia DATE, IN p_observacoes TEXT, OUT p_periodo_id CHAR(36))
BEGIN
  DECLARE v_competencia DATE;
  DECLARE v_existing_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin fecha o período';
  END IF;

  SET v_competencia = mes_competencia(p_competencia);
  IF EXISTS (
    SELECT 1 FROM periodos_fechados
     WHERE competencia = v_competencia AND status = 'fechado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este período já está fechado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM periodos_fechados
     WHERE competencia > v_competencia AND status = 'fechado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um período mais recente já fechado — feche os períodos em ordem cronológica';
  END IF;

  SELECT id INTO v_existing_id FROM periodos_fechados
   WHERE competencia = v_competencia AND loja_id = @current_loja_id;
  IF v_existing_id IS NOT NULL THEN
    SET p_periodo_id = v_existing_id;
    UPDATE periodos_fechados SET
      status = 'fechado', fechado_por = @current_usuario_id, fechado_em = NOW(),
      reaberto_por = NULL, reaberto_em = NULL, motivo_reabertura = NULL, observacoes = p_observacoes
    WHERE id = p_periodo_id AND loja_id = @current_loja_id;
  ELSE
    SET p_periodo_id = UUID();
    INSERT INTO periodos_fechados (id, competencia, status, fechado_por, fechado_em, observacoes, loja_id)
    VALUES (p_periodo_id, v_competencia, 'fechado', @current_usuario_id, NOW(), p_observacoes, @current_loja_id);
  END IF;

  INSERT INTO periodos_fechados_eventos (periodo_id, acao, realizado_por, motivo, loja_id)
  VALUES (p_periodo_id, 'fechamento', @current_usuario_id, p_observacoes, @current_loja_id);

  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS reabrir_periodo$$
CREATE PROCEDURE reabrir_periodo(IN p_competencia DATE, IN p_motivo TEXT)
BEGIN
  DECLARE v_periodo_id CHAR(36);
  DECLARE v_competencia DATE;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o período';
  END IF;
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo da reabertura';
  END IF;

  SET v_competencia = mes_competencia(p_competencia);
  SELECT id INTO v_periodo_id FROM periodos_fechados
   WHERE competencia = v_competencia AND status = 'fechado' AND loja_id = @current_loja_id;
  IF v_periodo_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período não encontrado ou não está fechado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM periodos_fechados
     WHERE competencia > v_competencia AND status = 'fechado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um período mais recente já fechado — reabra-o primeiro';
  END IF;

  UPDATE periodos_fechados
  SET status = 'reaberto', reaberto_por = @current_usuario_id, reaberto_em = NOW(), motivo_reabertura = p_motivo
  WHERE id = v_periodo_id AND loja_id = @current_loja_id;

  INSERT INTO periodos_fechados_eventos (periodo_id, acao, realizado_por, motivo, loja_id)
  VALUES (v_periodo_id, 'reabertura', @current_usuario_id, p_motivo, @current_loja_id);

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;

-- -----------------------------------------------------------------------------
-- 4. Procedures — contas, parâmetros e reset
-- -----------------------------------------------------------------------------

DELIMITER $$

-- Bootstrap do primeiro usuário do sistema. É o único caminho que roda sem
-- loja no contexto (o signup só é permitido enquanto `usuarios` está vazia —
-- achado #155), então aqui NÃO se pode falhar fechado: sem @current_loja_id,
-- cai na loja mais antiga, que nesse instante é a única que existe. Contas
-- criadas depois passam por usuarios.ts / saas-convites.ts, que informam a
-- loja explicitamente e não usam esta rotina.
DROP PROCEDURE IF EXISTS criar_usuario$$
CREATE PROCEDURE criar_usuario(
  IN p_email VARCHAR(255),
  IN p_senha_hash VARCHAR(255),
  IN p_nome_completo VARCHAR(255),
  OUT p_usuario_id CHAR(36)
)
BEGIN
  DECLARE v_total_papeis INT;
  DECLARE v_loja_id CHAR(36);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  SET v_loja_id = COALESCE(
    @current_loja_id,
    (SELECT id FROM lojas ORDER BY criado_em, id LIMIT 1)
  );
  IF v_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nenhuma loja cadastrada — não há onde criar a conta';
  END IF;

  -- E-mail é único POR LOJA desde a 0092: o mesmo endereço em duas Lojas são
  -- duas contas distintas, e a checagem tem que respeitar isso.
  IF EXISTS (SELECT 1 FROM usuarios WHERE email = p_email AND loja_id = v_loja_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Já existe uma conta com este e-mail.';
  END IF;

  SET p_usuario_id = UUID();
  INSERT INTO usuarios (id, email, senha_hash, nome_completo, loja_id)
  VALUES (p_usuario_id, p_email, p_senha_hash, p_nome_completo, v_loja_id);

  -- "Primeiro usuário vira admin" agora é por Loja: a segunda Loja também
  -- precisa do seu próprio primeiro admin.
  SELECT COUNT(*) INTO v_total_papeis
  FROM usuarios_papeis up
  JOIN usuarios u ON u.id = up.usuario_id
  WHERE u.loja_id = v_loja_id;

  INSERT INTO usuarios_papeis (usuario_id, papel, loja_id)
  VALUES (p_usuario_id, IF(v_total_papeis = 0, 'admin', 'irmao'), v_loja_id);

  IF v_own_tx THEN COMMIT; END IF;
END$$

-- `parametros_financeiros` virou uma linha POR LOJA na 0092 (a PK passou a ser
-- loja_id). O `WHERE id = 1` de antes lia a linha de qualquer Loja — a multa
-- e o juro de uma seriam aplicados na cobrança da outra. Loja sem parâmetros
-- salvos ainda fica com multa e juros zerados, que é a leitura correta de
-- "não configurado" (mesmo critério do relatório de inadimplência).
DROP PROCEDURE IF EXISTS calcular_multa_juros$$
CREATE PROCEDURE calcular_multa_juros(
  IN p_valor DECIMAL(14,2),
  IN p_vencimento DATE,
  IN p_data_referencia DATE,
  OUT p_multa DECIMAL(14,2),
  OUT p_juros DECIMAL(14,2),
  OUT p_dias_atraso INT,
  OUT p_total DECIMAL(14,2)
)
BEGIN
  DECLARE v_multa_ativa BOOLEAN DEFAULT FALSE;
  DECLARE v_multa_percentual DECIMAL(5,2) DEFAULT 0;
  DECLARE v_juros_ativo BOOLEAN DEFAULT FALSE;
  DECLARE v_juros_diario_percentual DECIMAL(6,4) DEFAULT 0;

  SELECT multa_ativa, multa_percentual, juros_ativo, juros_diario_percentual
  INTO v_multa_ativa, v_multa_percentual, v_juros_ativo, v_juros_diario_percentual
  FROM parametros_financeiros WHERE loja_id = @current_loja_id;

  SET p_dias_atraso = GREATEST(0, DATEDIFF(p_data_referencia, p_vencimento));
  SET p_multa = 0;
  SET p_juros = 0;

  IF p_dias_atraso > 0 THEN
    IF v_multa_ativa THEN
      SET p_multa = ROUND(p_valor * v_multa_percentual / 100, 2);
    END IF;
    IF v_juros_ativo THEN
      SET p_juros = ROUND(p_valor * v_juros_diario_percentual / 100 * p_dias_atraso, 2);
    END IF;
  END IF;

  SET p_total = p_valor + p_multa + p_juros;
END$$

-- A rotina mais perigosa do banco: os DELETE não tinham WHERE nenhum. Com
-- duas Lojas, um admin apagando o próprio movimento apagaria o de TODAS. É a
-- diferença entre uma ação destrutiva e um incidente de plataforma.
DROP PROCEDURE IF EXISTS resetar_financeiro$$
CREATE PROCEDURE resetar_financeiro(OUT p_total_lancamentos INT)
BEGIN
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;
  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT COUNT(*) INTO p_total_lancamentos FROM lancamentos WHERE loja_id = @current_loja_id;

  DELETE FROM ofx_lancamentos       WHERE loja_id = @current_loja_id;
  DELETE FROM fechamentos_exercicio WHERE loja_id = @current_loja_id;
  DELETE FROM orcamentos            WHERE loja_id = @current_loja_id;
  DELETE FROM recibos               WHERE loja_id = @current_loja_id;
  DELETE FROM parcelamentos         WHERE loja_id = @current_loja_id;
  DELETE FROM lancamentos_contabeis WHERE loja_id = @current_loja_id;
  DELETE FROM lancamentos           WHERE loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS conciliar_ofx_existente$$
CREATE PROCEDURE conciliar_ofx_existente(IN p_ofx_id CHAR(36), IN p_lancamento_id CHAR(36))
BEGIN
  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ofx_lancamentos
     WHERE id = p_ofx_id AND NOT conciliado AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;
  -- Sem este filtro, uma linha do extrato podia ser amarrada ao lançamento de
  -- outra Loja passando o id — e o saldo das duas passava a mentir.
  IF NOT EXISTS (
    SELECT 1 FROM lancamentos WHERE id = p_lancamento_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento não encontrado';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;
END$$

-- -----------------------------------------------------------------------------
-- 5. Procedures — lançamentos de entrada e saída
-- -----------------------------------------------------------------------------

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

  SELECT id INTO v_conta_pagar_id FROM plano_contas
   WHERE codigo = '2.1.01' AND loja_id = @current_loja_id;
  IF v_conta_pagar_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Contas a Pagar" (2.1.01) não encontrada';
  END IF;

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

  SELECT id INTO v_conta_receita FROM plano_contas
   WHERE codigo = '4.1.01' AND loja_id = @current_loja_id LIMIT 1;

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

DROP PROCEDURE IF EXISTS criar_transferencia$$
CREATE PROCEDURE criar_transferencia(
  IN p_conta_origem_id CHAR(36),
  IN p_conta_destino_id CHAR(36),
  IN p_valor DECIMAL(14,2),
  IN p_data DATE,
  IN p_descricao VARCHAR(500),
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_plano_origem CHAR(36);
  DECLARE v_plano_destino CHAR(36);
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
  IF p_conta_origem_id = p_conta_destino_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta de origem e destino devem ser diferentes';
  END IF;

  -- As duas contas precisam ser da mesma Loja da sessão. Sem isso, uma
  -- transferência podia tirar dinheiro do caixa da Loja vizinha.
  SELECT plano_conta_id INTO v_plano_origem FROM contas_financeiras
   WHERE id = p_conta_origem_id AND loja_id = @current_loja_id;
  SELECT plano_conta_id INTO v_plano_destino FROM contas_financeiras
   WHERE id = p_conta_destino_id AND loja_id = @current_loja_id;
  IF v_plano_origem IS NULL OR v_plano_destino IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ambas as contas precisam ser desta loja e ter conta do plano de contas vinculada';
  END IF;

  SET p_lancamento_id = UUID();
  INSERT INTO lancamentos (
    id, data, data_pagamento, descricao, valor, tipo, conta_id, conta_destino_id, pago, criado_por, loja_id
  ) VALUES (
    p_lancamento_id, p_data, p_data, p_descricao, p_valor, 'transferencia',
    p_conta_origem_id, p_conta_destino_id, TRUE, @current_usuario_id, @current_loja_id
  );

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data), p_descricao,
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_destino, 'tipo', 'debito', 'valor', CAST(p_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_plano_origem, 'tipo', 'credito', 'valor', CAST(p_valor AS DECIMAL(14,2)))
    ),
    'transferencia', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS registrar_recebimento_avulso$$
CREATE PROCEDURE registrar_recebimento_avulso(
  IN p_valor DECIMAL(14,2),
  IN p_categoria VARCHAR(20),
  IN p_plano_conta_id CHAR(36),
  IN p_conta_financeira_id CHAR(36),
  IN p_data DATE,
  IN p_forma_pagamento VARCHAR(50),
  IN p_irmao_id CHAR(36),
  IN p_terceiro_id CHAR(36),
  IN p_descricao VARCHAR(500),
  IN p_observacoes TEXT,
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_label VARCHAR(50);
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
  IF NOT EXISTS (
    SELECT 1 FROM plano_contas WHERE id = p_plano_conta_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta de receita não encontrada nesta loja';
  END IF;
  IF p_irmao_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM irmaos WHERE id = p_irmao_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Irmão não encontrado nesta loja';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = p_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não é desta loja ou não tem conta do plano de contas vinculada';
  END IF;

  SET v_label = CASE p_categoria
    WHEN 'mensalidade' THEN 'Mensalidade'
    WHEN 'taxa_grau' THEN 'Taxa Grau'
    WHEN 'tronco' THEN 'Tronco'
    WHEN 'doacao' THEN 'Doação'
    ELSE 'Outros'
  END;
  SET v_desc = COALESCE(p_descricao, v_label);
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, forma_pagamento, observacoes, criado_por, loja_id
  ) VALUES (
    p_lancamento_id, p_data, p_data, v_desc, p_valor, p_valor, 'entrada', p_conta_financeira_id, p_plano_conta_id,
    p_irmao_id, p_terceiro_id, p_categoria, TRUE, p_forma_pagamento, p_observacoes, @current_usuario_id, @current_loja_id
  );

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data), v_desc,
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(p_valor AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'credito', 'valor', CAST(p_valor AS DECIMAL(14,2)))
    ),
    'recebimento_avulso', p_lancamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;

-- -----------------------------------------------------------------------------
-- 6. Procedures — contabilidade e recorrentes
-- -----------------------------------------------------------------------------

DELIMITER $$

-- O coração da partida dobrada: toda baixa, transferência e provisão passa por
-- aqui. As buscas por `plano_contas` (código e `analitica`) não filtravam a
-- Loja, então a validação "a conta é analítica?" podia ser respondida pela
-- conta homônima da Loja vizinha — e o item contábil nasceria apontando pra
-- lá. É onde o vazamento seria mais difícil de enxergar depois, porque o
-- balancete das duas Lojas continuaria fechando.
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

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Um lançamento contábil precisa de débito e crédito';
  END IF;

  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
    SET v_codigo = (
      SELECT codigo FROM plano_contas
       WHERE id = v_conta_id AND loja_id = @current_loja_id LIMIT 1
    );
    IF v_codigo IN ('1.1.02', '2.1.01')
       AND p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'conta_pagar_baixa', 'conciliacao_baixa', 'conciliacao_estorno', 'parcelamento') THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    SET v_analitica = NULL;
    SELECT analitica INTO v_analitica FROM plano_contas
     WHERE id = v_conta_id AND loja_id = @current_loja_id;
    -- v_analitica NULL agora significa das duas uma: conta inexistente, ou
    -- conta de OUTRA Loja. As duas são o mesmo erro do ponto de vista de quem
    -- chamou, e as duas têm que parar aqui.
    IF v_analitica IS NULL OR NOT v_analitica THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta contábil de caixa inválida, não analítica ou de outra loja';
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
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
    SET v_desc = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].descricao')));
    SET v_codigo = (
      SELECT codigo FROM plano_contas
       WHERE id = v_conta_id AND loja_id = @current_loja_id LIMIT 1
    );
    IF v_codigo IN ('1.1.02', '2.1.01')
       AND p_origem_tipo IN ('recibo_baixa', 'recibo_baixa_parcial', 'conta_pagar_baixa', 'conciliacao_baixa', 'conciliacao_estorno', 'parcelamento') THEN
      SET v_conta_id = v_conta_resultado;
    END IF;
    INSERT INTO lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao, loja_id)
    VALUES (p_lancamento_id, v_conta_id, v_tipo, v_valor, v_desc, @current_loja_id);
    SET v_i = v_i + 1;
  END WHILE;
  IF v_own_tx THEN COMMIT; END IF;
END$$

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

  SELECT id INTO v_conta_pagar_id FROM plano_contas
   WHERE codigo = '2.1.01' AND loja_id = @current_loja_id;

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

-- O cursor varria TODAS as despesas recorrentes ativas do banco. Com duas
-- Lojas, abrir a tela de recorrentes de uma geraria as previsões da outra —
-- e o UPDATE de manutenção reescreveria os lançamentos futuros de lá.
DROP PROCEDURE IF EXISTS gerar_previsoes_recorrentes$$
CREATE PROCEDURE gerar_previsoes_recorrentes(IN p_ate DATE, OUT p_total INT)
BEGIN
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_descricao VARCHAR(500);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_plano_conta_id CHAR(36);
  DECLARE v_terceiro_id CHAR(36);
  DECLARE v_dia INT;
  DECLARE v_inicio DATE;
  DECLARE v_fim DATE;
  DECLARE v_observacoes TEXT;
  DECLARE v_competencia DATE;
  DECLARE v_limite DATE;
  DECLARE v_vencimento DATE;
  DECLARE cur CURSOR FOR
    SELECT id, descricao, valor, plano_conta_id, terceiro_id,
           dia_vencimento, data_inicio, data_fim, observacoes
    FROM despesas_recorrentes
    WHERE ativo = TRUE AND loja_id = @current_loja_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;

  SET p_total = 0;
  SET p_ate = COALESCE(p_ate, DATE_ADD(CURRENT_DATE, INTERVAL 11 MONTH));

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  recorrencias: LOOP
    FETCH cur INTO v_id, v_descricao, v_valor, v_plano_conta_id,
      v_terceiro_id, v_dia, v_inicio, v_fim, v_observacoes;
    IF v_done THEN LEAVE recorrencias; END IF;

    SET v_competencia = GREATEST(
      DATE_FORMAT(v_inicio, '%Y-%m-01'),
      DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
    );
    SET v_limite = LEAST(
      DATE_FORMAT(p_ate, '%Y-%m-01'),
      COALESCE(DATE_FORMAT(v_fim, '%Y-%m-01'), DATE_FORMAT(p_ate, '%Y-%m-01'))
    );
    SET v_vencimento = DATE_ADD(
      v_competencia,
      INTERVAL (LEAST(v_dia, DAY(LAST_DAY(v_competencia))) - 1) DAY
    );
    IF v_vencimento < v_inicio THEN
      SET v_competencia = DATE_ADD(v_competencia, INTERVAL 1 MONTH);
    END IF;

    UPDATE lancamentos l
    SET l.descricao = v_descricao,
        l.valor = IF(l.valor_efetivo_confirmado, l.valor, v_valor),
        l.valor_previsto = v_valor,
        l.plano_conta_id = v_plano_conta_id,
        l.terceiro_id = v_terceiro_id,
        l.data_vencimento = DATE_ADD(
          l.competencia_mes,
          INTERVAL (LEAST(v_dia, DAY(LAST_DAY(l.competencia_mes))) - 1) DAY
        ),
        l.observacoes = v_observacoes
    WHERE l.recorrente_id = v_id
      AND l.loja_id = @current_loja_id
      AND l.pago = FALSE
      AND l.competencia_mes >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01');

    WHILE v_competencia <= v_limite DO
      SET v_vencimento = DATE_ADD(
        v_competencia,
        INTERVAL (LEAST(v_dia, DAY(LAST_DAY(v_competencia))) - 1) DAY
      );
      IF v_fim IS NULL OR v_vencimento <= v_fim THEN
        INSERT IGNORE INTO lancamentos (
          data, data_vencimento, descricao, valor, valor_previsto,
          valor_efetivo_confirmado, tipo, plano_conta_id, terceiro_id,
          recorrente_id, pago, competencia_mes, observacoes, loja_id
        ) VALUES (
          v_competencia, v_vencimento, v_descricao, v_valor, v_valor,
          FALSE, 'saida', v_plano_conta_id, v_terceiro_id,
          v_id, FALSE, v_competencia, v_observacoes, @current_loja_id
        );
        SET p_total = p_total + ROW_COUNT();
      END IF;
      SET v_competencia = DATE_ADD(v_competencia, INTERVAL 1 MONTH);
    END WHILE;
  END LOOP;
  CLOSE cur;
END$$

DELIMITER ;

-- -----------------------------------------------------------------------------
-- 7. Procedures — fechamento de exercício e geração em lote
-- -----------------------------------------------------------------------------

DELIMITER $$

-- O cursor somava o movimento contábil de TODAS as Lojas e a conta de
-- resultado vinha de `WHERE codigo = '3.1.01'` sem loja — fechar o exercício
-- de uma Loja zeraria o resultado das outras e jogaria o apurado na conta
-- errada. Escrita destrutiva, não relatório torto: é o pior caso da #349.
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

  SELECT id INTO v_resultados_id FROM plano_contas
   WHERE codigo = '3.1.01' AND loja_id = @current_loja_id;
  IF v_resultados_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Lucros/Prejuízos Acumulados" (3.1.01) não encontrada';
  END IF;

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

  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS reabrir_exercicio$$
CREATE PROCEDURE reabrir_exercicio(IN p_exercicio INT, IN p_motivo TEXT)
BEGIN
  DECLARE v_fechamento_id CHAR(36);
  DECLARE v_data_corte DATE;
  DECLARE v_lancamento_transporte_id CHAR(36);
  DECLARE v_itens JSON DEFAULT (JSON_ARRAY());
  DECLARE v_estorno_id CHAR(36) DEFAULT NULL;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao VARCHAR(500);
  DECLARE cur CURSOR FOR
    SELECT conta_id, tipo, valor, descricao FROM lancamentos_contabeis_itens
     WHERE lancamento_id = v_lancamento_transporte_id AND loja_id = @current_loja_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;

  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o exercício';
  END IF;
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo da reabertura';
  END IF;

  SELECT id, data_corte, lancamento_transporte_id
    INTO v_fechamento_id, v_data_corte, v_lancamento_transporte_id
  FROM fechamentos_exercicio
  WHERE exercicio = p_exercicio AND status = 'fechado' AND loja_id = @current_loja_id;
  IF v_fechamento_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Exercício não encontrado ou não está fechado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM fechamentos_exercicio
     WHERE exercicio > p_exercicio AND status = 'fechado' AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um exercício mais recente já fechado — reabra-o primeiro';
  END IF;

  UPDATE fechamentos_exercicio
  SET status = 'reaberto', reaberto_por = @current_usuario_id, reaberto_em = NOW(), motivo_reabertura = p_motivo
  WHERE id = v_fechamento_id AND loja_id = @current_loja_id;

  IF v_lancamento_transporte_id IS NOT NULL THEN
    -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
    -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
    -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
    -- que separa "não havia nada a fazer" de "não fizemos nada calados".
    SET v_done = FALSE;
    OPEN cur;
    read_loop: LOOP
      FETCH cur INTO v_conta_id, v_tipo, v_valor, v_descricao;
      IF v_done THEN LEAVE read_loop; END IF;
      SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT(
        'conta_id', v_conta_id,
        'tipo', IF(v_tipo = 'debito', 'credito', 'debito'),
        'valor', CAST(v_valor AS DECIMAL(14,2)),
        'descricao', v_descricao
      ));
    END LOOP;
    CLOSE cur;

    CALL registrar_lancamento_contabil(
      v_data_corte, mes_competencia(v_data_corte),
      CONCAT('Estorno do fechamento do exercício ', p_exercicio),
      v_itens, 'fechamento_exercicio_reabertura', v_fechamento_id, v_estorno_id
    );
  END IF;

  INSERT INTO fechamentos_exercicio_eventos
    (fechamento_id, acao, lancamento_id, realizado_por, motivo, loja_id)
  VALUES
    (v_fechamento_id, 'reabertura', v_estorno_id, @current_usuario_id, p_motivo, @current_loja_id);

  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS gerar_cobrancas_sgcab$$
CREATE PROCEDURE gerar_cobrancas_sgcab(
  IN p_org_id CHAR(36),
  IN p_ano INT,
  OUT p_total_gerado INT
)
BEGIN
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_antes INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN IF v_own_tx THEN ROLLBACK; END IF; RESIGNAL; END;

  IF @current_loja_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contexto de loja ausente';
  END IF;
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'secretario')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orgs WHERE id = p_org_id AND loja_id = @current_loja_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Corpo não encontrado nesta loja';
  END IF;

  IF @@in_transaction = 0 THEN START TRANSACTION; SET v_own_tx = TRUE; END IF;

  SELECT COUNT(*) INTO v_antes FROM sgcab_cobrancas
   WHERE org_id = p_org_id AND ano = p_ano AND loja_id = @current_loja_id;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status, loja_id)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'sgcab', tg.sgcab, 'pendente', @current_loja_id
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual AND tg.loja_id = io.loja_id
  WHERE io.org_id = p_org_id AND io.loja_id = @current_loja_id
    AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.sgcab > 0;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status, loja_id)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'ritual', tg.ritual, 'pendente', @current_loja_id
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual AND tg.loja_id = io.loja_id
  WHERE io.org_id = p_org_id AND io.loja_id = @current_loja_id
    AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.ritual > 0;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status, loja_id)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'diploma', tg.diploma, 'pendente', @current_loja_id
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual AND tg.loja_id = io.loja_id
  WHERE io.org_id = p_org_id AND io.loja_id = @current_loja_id
    AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.diploma > 0;

  INSERT IGNORE INTO sgcab_cobrancas (irmao_id, org_id, ano, grau, tipo, valor, status, loja_id)
  SELECT io.irmao_id, tg.org_id, tg.ano, tg.grau, 'taxa_propria', tg.taxa_propria, 'pendente', @current_loja_id
  FROM irmao_orgs io
  JOIN taxas_grau tg ON tg.org_id = io.org_id AND tg.grau = io.grau_atual AND tg.loja_id = io.loja_id
  WHERE io.org_id = p_org_id AND io.loja_id = @current_loja_id
    AND tg.ano = p_ano AND tg.ativo = TRUE AND tg.taxa_propria > 0;

  SELECT COUNT(*) - v_antes INTO p_total_gerado FROM sgcab_cobrancas
   WHERE org_id = p_org_id AND ano = p_ano AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$

-- O cursor percorria TODOS os irmãos do banco: gerar as mensalidades de uma
-- Loja emitiria fatura no nome dos irmãos da outra, com a conta contábil e a
-- chave Pix da Loja errada. Junto disso, `tabela_valores` e a busca da chave
-- Pix também passaram a respeitar a Loja.
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

  SELECT id INTO v_plano FROM plano_contas
   WHERE codigo = '4.1.01' AND loja_id = @current_loja_id;
  IF v_plano IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Mensalidades" (4.1.01) não encontrada';
  END IF;

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

DELIMITER ;

-- -----------------------------------------------------------------------------
-- 8. Procedures — baixa de faturas
-- -----------------------------------------------------------------------------

DELIMITER $$

-- Os ids das faturas vêm num JSON do formulário. Sem escopo, bastava mandar o
-- id certo para dar baixa na fatura de outra Loja — e o recibo, os itens e o
-- lançamento contábil nasceriam na Loja de quem chamou, deixando as duas
-- contabilidades erradas ao mesmo tempo. Todo `JSON_CONTAINS(...)` agora vem
-- acompanhado de `loja_id = @current_loja_id`.
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
  DECLARE v_multas_juros_id CHAR(36);
  DECLARE v_desconto_id CHAR(36);
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

  SELECT id INTO v_receber_id FROM plano_contas
   WHERE codigo = '1.1.02' AND loja_id = @current_loja_id;
  SELECT id INTO v_multas_juros_id FROM plano_contas
   WHERE codigo = '4.1.06' AND loja_id = @current_loja_id;
  SELECT id INTO v_desconto_id FROM plano_contas
   WHERE codigo = '5.1.06' AND loja_id = @current_loja_id;

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
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_desconto_id, 'tipo', 'debito', 'valor', CAST(p_desconto AS DECIMAL(14,2))));
  END IF;
  SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_soma_original AS DECIMAL(14,2))));
  IF (v_soma_multa + v_soma_juros) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_multas_juros_id, 'tipo', 'credito', 'valor', CAST(v_soma_multa + v_soma_juros AS DECIMAL(14,2))));
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

  SELECT id INTO v_receber_id FROM plano_contas
   WHERE codigo = '1.1.02' AND loja_id = @current_loja_id;

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

DELIMITER ;

-- -----------------------------------------------------------------------------
-- 9. Procedures — parcelamento e conciliação OFX
-- -----------------------------------------------------------------------------

DELIMITER $$

DROP PROCEDURE IF EXISTS criar_parcelamento$$
CREATE PROCEDURE criar_parcelamento(
  IN p_lancamento_ids JSON,
  IN p_numero_parcelas INT,
  IN p_entrada DECIMAL(14,2),
  IN p_conta_financeira_id CHAR(36),
  IN p_data DATE,
  IN p_incluir_multa_juros BOOLEAN,
  IN p_observacoes TEXT,
  OUT p_parcelamento_id CHAR(36)
)
BEGIN
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_n_irmaos INT;
  DECLARE v_n_selecionadas INT;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_receber_id CHAR(36);
  DECLARE v_multas_juros_id CHAR(36);
  DECLARE v_soma_original DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_multa DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_juros DECIMAL(14,2) DEFAULT 0;
  DECLARE v_valor_parcelado DECIMAL(14,2);
  DECLARE v_itens JSON;
  DECLARE v_valor_parcela DECIMAL(14,2);
  DECLARE v_acumulado DECIMAL(14,2) DEFAULT 0;
  DECLARE v_desc VARCHAR(500);
  DECLARE v_i INT;
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
  IF p_numero_parcelas IS NULL OR p_numero_parcelas <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Número de parcelas deve ser maior que zero';
  END IF;

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

  IF COALESCE(p_entrada, 0) > 0 THEN
    IF p_conta_financeira_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe a conta que recebeu a entrada';
    END IF;
    SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
     WHERE id = p_conta_financeira_id AND loja_id = @current_loja_id;
    IF v_plano_conta_banco IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não é desta loja ou não tem conta do plano de contas vinculada';
    END IF;
  END IF;

  SELECT id INTO v_receber_id FROM plano_contas
   WHERE codigo = '1.1.02' AND loja_id = @current_loja_id;
  SELECT id INTO v_multas_juros_id FROM plano_contas
   WHERE codigo = '4.1.06' AND loja_id = @current_loja_id;

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  calc_loop: LOOP
    FETCH cur INTO v_id, v_valor, v_vencimento;
    IF v_done THEN LEAVE calc_loop; END IF;
    CALL calcular_multa_juros(v_valor, v_vencimento, p_data, v_multa, v_juros, v_dias, v_calc_total);
    SET v_soma_original = v_soma_original + v_valor;
    IF p_incluir_multa_juros THEN
      SET v_soma_multa = v_soma_multa + v_multa;
      SET v_soma_juros = v_soma_juros + v_juros;
    END IF;
  END LOOP;
  CLOSE cur;

  SET v_valor_parcelado = v_soma_original + v_soma_multa + v_soma_juros - COALESCE(p_entrada, 0);
  IF v_valor_parcelado < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Entrada maior que o valor total a parcelar';
  END IF;

  SET p_parcelamento_id = UUID();
  INSERT INTO parcelamentos (
    id, irmao_id, data, valor_original, valor_multa, valor_juros, entrada,
    valor_parcelado, numero_parcelas, observacoes, criado_por, loja_id
  ) VALUES (
    p_parcelamento_id, v_irmao_id, p_data, v_soma_original, v_soma_multa, v_soma_juros, COALESCE(p_entrada, 0),
    v_valor_parcelado, p_numero_parcelas, p_observacoes, @current_usuario_id, @current_loja_id
  );

  UPDATE lancamentos
  SET pago = TRUE, parcelado = TRUE, parcelamento_id = p_parcelamento_id, data_pagamento = p_data
  WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND loja_id = @current_loja_id;

  IF COALESCE(p_entrada, 0) > 0 THEN
    INSERT INTO lancamentos (
      data, data_vencimento, descricao, valor, tipo, irmao_id,
      pago, data_pagamento, conta_id, forma_pagamento, parcelamento_id, is_mensalidade, loja_id
    ) VALUES (
      p_data, p_data, 'Entrada — acordo de parcelamento', p_entrada, 'entrada', v_irmao_id,
      TRUE, p_data, p_conta_financeira_id, 'entrada_parcelamento', p_parcelamento_id, FALSE, @current_loja_id
    );
  END IF;

  SET v_i = 1;
  WHILE v_i <= p_numero_parcelas DO
    IF v_i = p_numero_parcelas THEN
      SET v_valor_parcela = v_valor_parcelado - v_acumulado;
    ELSE
      SET v_valor_parcela = ROUND(v_valor_parcelado / p_numero_parcelas, 2);
      SET v_acumulado = v_acumulado + v_valor_parcela;
    END IF;
    SET v_desc = CONCAT('Parcela ', v_i, '/', p_numero_parcelas, ' — Acordo ', DATE_FORMAT(p_data, '%d/%m/%Y'));

    INSERT INTO lancamentos (
      data, data_vencimento, descricao, valor, tipo, irmao_id,
      pago, parcelamento_id, is_mensalidade, loja_id
    ) VALUES (
      p_data, DATE_ADD(p_data, INTERVAL v_i MONTH), v_desc, v_valor_parcela, 'entrada', v_irmao_id,
      FALSE, p_parcelamento_id, FALSE, @current_loja_id
    );

    SET v_i = v_i + 1;
  END WHILE;

  SET v_itens = JSON_ARRAY(JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'debito', 'valor', CAST(v_valor_parcelado AS DECIMAL(14,2))));
  IF COALESCE(p_entrada, 0) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(p_entrada AS DECIMAL(14,2))));
  END IF;
  SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_soma_original AS DECIMAL(14,2))));
  IF (v_soma_multa + v_soma_juros) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_multas_juros_id, 'tipo', 'credito', 'valor', CAST(v_soma_multa + v_soma_juros AS DECIMAL(14,2))));
  END IF;

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data),
    'Parcelamento de faturas em atraso', v_itens, 'parcelamento', p_parcelamento_id, @lanc_contabil_id
  );
  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS criar_lancamento_de_ofx$$
CREATE PROCEDURE criar_lancamento_de_ofx(
  IN p_ofx_id CHAR(36),
  IN p_plano_conta_id CHAR(36),
  IN p_categoria VARCHAR(20),
  IN p_irmao_id CHAR(36),
  IN p_terceiro_id CHAR(36),
  IN p_descricao VARCHAR(500),
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_conta_financeira_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao_ofx VARCHAR(500);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_valor_abs DECIMAL(14,2);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_itens JSON;
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
  IF NOT EXISTS (
    SELECT 1 FROM plano_contas WHERE id = p_plano_conta_id AND loja_id = @current_loja_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta contábil não encontrada nesta loja';
  END IF;

  SELECT conta_financeira_id, data, valor, descricao
    INTO v_conta_financeira_id, v_data, v_valor, v_descricao_ofx
  FROM ofx_lancamentos
  WHERE id = p_ofx_id AND NOT conciliado AND loja_id = @current_loja_id;
  IF v_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = v_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SET v_valor_abs = ABS(v_valor);
  SET v_tipo = CASE WHEN v_valor >= 0 THEN 'entrada' ELSE 'saida' END;
  SET v_desc = COALESCE(p_descricao, v_descricao_ofx, 'Lançamento importado do extrato');
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, criado_por, loja_id
  ) VALUES (
    p_lancamento_id, v_data, v_data, v_desc, v_valor_abs, v_valor_abs, v_tipo, v_conta_financeira_id, p_plano_conta_id,
    p_irmao_id, p_terceiro_id, CASE WHEN v_tipo = 'entrada' THEN p_categoria ELSE NULL END, TRUE,
    @current_usuario_id, @current_loja_id
  );

  IF v_tipo = 'entrada' THEN
    SET v_itens = JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
    );
  ELSE
    SET v_itens = JSON_ARRAY(
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'debito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2))),
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_abs AS DECIMAL(14,2)))
    );
  END IF;

  CALL registrar_lancamento_contabil(v_data, mes_competencia(v_data), v_desc, v_itens, 'ofx_importado', p_lancamento_id, @lanc_contabil_id);

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;
  IF v_own_tx THEN COMMIT; END IF;
END$$

DROP PROCEDURE IF EXISTS desfazer_lancamento_ofx$$
CREATE PROCEDURE desfazer_lancamento_ofx(IN p_ofx_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_lancamento_id CHAR(36);
  DECLARE v_conciliacao_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_itens JSON;
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
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT lancamento_id, conciliacao_id, data INTO v_lancamento_id, v_conciliacao_id, v_data
  FROM ofx_lancamentos
  WHERE id = p_ofx_id AND conciliado = TRUE AND loja_id = @current_loja_id;
  IF v_lancamento_id IS NULL AND v_conciliacao_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha do extrato não encontrada ou não está conciliada';
  END IF;
  IF v_conciliacao_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta linha faz parte de um evento de conciliação em lote — use desfazer_conciliacao';
  END IF;
  IF periodo_esta_fechado(v_data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, lancamento_id = NULL
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;

  SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
  WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lancamento_id AND loja_id = @current_loja_id
  LIMIT 1;

  IF v_lanc_contabil_id IS NOT NULL THEN
    SET v_itens = (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'conta_id', conta_id,
          'tipo', IF(tipo = 'debito', 'credito', 'debito'),
          'valor', valor,
          'descricao', descricao
        )
      )
      FROM lancamentos_contabeis_itens
      WHERE lancamento_id = v_lanc_contabil_id AND loja_id = @current_loja_id
    );
    CALL registrar_lancamento_contabil(
      v_data, mes_competencia(v_data), 'Estorno de lançamento criado via conciliação (desfeito)',
      v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
    );
    DELETE FROM lancamentos WHERE id = v_lancamento_id AND loja_id = @current_loja_id;
  ELSE
    SELECT id INTO v_lanc_contabil_id FROM lancamentos_contabeis
    WHERE origem_tipo = 'conciliacao_baixa' AND origem_id = v_lancamento_id AND loja_id = @current_loja_id
    LIMIT 1;

    IF v_lanc_contabil_id IS NOT NULL THEN
      SET v_itens = (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'conta_id', conta_id,
            'tipo', IF(tipo = 'debito', 'credito', 'debito'),
            'valor', valor,
            'descricao', descricao
          )
        )
        FROM lancamentos_contabeis_itens
        WHERE lancamento_id = v_lanc_contabil_id AND loja_id = @current_loja_id
      );
      CALL registrar_lancamento_contabil(
        v_data, mes_competencia(v_data), 'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lancamento_id, @desfazer_ofx_estorno_id
      );
    END IF;

    UPDATE lancamentos
    SET pago = FALSE, data_pagamento = NULL, conta_id = NULL,
        forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
    WHERE id = v_lancamento_id AND loja_id = @current_loja_id;
  END IF;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;

DELIMITER $$

DROP PROCEDURE IF EXISTS conciliar_ofx_baixando_lancamento$$
CREATE PROCEDURE conciliar_ofx_baixando_lancamento(
  IN p_ofx_id CHAR(36),
  IN p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_ofx_conta_financeira_id CHAR(36);
  DECLARE v_ofx_data DATE;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_lanc_tipo VARCHAR(20);
  DECLARE v_lanc_valor DECIMAL(14,2);
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

  SELECT conta_financeira_id, data INTO v_ofx_conta_financeira_id, v_ofx_data
  FROM ofx_lancamentos
  WHERE id = p_ofx_id AND NOT conciliado AND loja_id = @current_loja_id;
  IF v_ofx_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT tipo, valor, pago, descricao INTO v_lanc_tipo, v_lanc_valor, v_lanc_pago, v_lanc_desc
  FROM lancamentos WHERE id = p_lancamento_id AND loja_id = @current_loja_id;
  IF v_lanc_tipo IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento não encontrado';
  END IF;
  IF v_lanc_pago THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento já está pago';
  END IF;
  IF v_lanc_tipo NOT IN ('entrada', 'saida') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Só é possível baixar entradas ou saídas por aqui';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = v_ofx_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  UPDATE lancamentos
  SET pago = TRUE, data_pagamento = v_ofx_data, conta_id = v_ofx_conta_financeira_id,
      forma_pagamento = COALESCE(forma_pagamento, 'Conciliação OFX')
  WHERE id = p_lancamento_id AND loja_id = @current_loja_id;

  SELECT EXISTS(
    SELECT 1 FROM lancamentos_contabeis
    WHERE origem_id = p_lancamento_id AND loja_id = @current_loja_id
      AND origem_tipo IN ('fatura_provisao', 'conta_pagar_provisao')
  ) INTO v_tem_provisao;

  IF v_tem_provisao THEN
    IF v_lanc_tipo = 'entrada' THEN
      SELECT id INTO v_receber_id FROM plano_contas
       WHERE codigo = '1.1.02' AND loja_id = @current_loja_id;
      CALL registrar_lancamento_contabil(
        v_ofx_data, mes_competencia(v_ofx_data), CONCAT('Baixa via conciliação: ', v_lanc_desc),
        JSON_ARRAY(
          JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2))),
          JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', CAST(v_lanc_valor AS DECIMAL(14,2)))
        ),
        'conciliacao_baixa', p_lancamento_id, @lanc_contabil_id
      );
    ELSE
      SELECT id INTO v_pagar_id FROM plano_contas
       WHERE codigo = '2.1.01' AND loja_id = @current_loja_id;
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

-- A conciliação em lote é o caso mais delicado: ela casa N linhas do extrato
-- com M lançamentos e só aceita se os totais baterem. Sem escopo, um id de
-- outra Loja entrava na conta — e como a validação é por SOMA, a diferença
-- podia até fechar por coincidência, gravando a conciliação com dado dos dois
-- lados. Agora tudo o que é lido, travado e atualizado passa pela Loja.
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

  SELECT id INTO v_receber_id FROM plano_contas
   WHERE codigo = '1.1.02' AND loja_id = @current_loja_id;
  SELECT id INTO v_pagar_id FROM plano_contas
   WHERE codigo = '2.1.01' AND loja_id = @current_loja_id;

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
  END LOOP;
  CLOSE cur;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;

DELIMITER $$

DROP PROCEDURE IF EXISTS criar_lancamentos_de_ofx_rateado$$
CREATE PROCEDURE criar_lancamentos_de_ofx_rateado(
  IN p_ofx_id CHAR(36),
  IN p_itens JSON,
  OUT p_conciliacao_id CHAR(36)
)
BEGIN
  DECLARE v_conta_financeira_id CHAR(36);
  DECLARE v_data DATE;
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_descricao_ofx VARCHAR(500);
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_valor_abs DECIMAL(14,2);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_qtd_itens INT;
  DECLARE v_qtd_validos INT;
  DECLARE v_qtd_contas_da_loja INT;
  DECLARE v_soma_itens DECIMAL(14,2);
  DECLARE v_item_id CHAR(36);
  DECLARE v_plano_conta_id CHAR(36);
  DECLARE v_categoria VARCHAR(20);
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_valor_item DECIMAL(14,2);
  DECLARE v_descricao_item VARCHAR(500);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_itens_contabeis JSON;
  DECLARE v_lanc_contabil_id_novo CHAR(36);
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE cur CURSOR FOR
    SELECT jt.plano_conta_id, jt.categoria, jt.irmao_id, jt.valor, jt.descricao
    FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
      plano_conta_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.plano_conta_id',
      categoria VARCHAR(20) PATH '$.categoria',
      irmao_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.irmao_id',
      valor DECIMAL(14,2) PATH '$.valor',
      descricao VARCHAR(500) PATH '$.descricao'
    )) jt;
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
  IF p_itens IS NULL OR JSON_LENGTH(p_itens) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe ao menos um item do rateio';
  END IF;

  SELECT conta_financeira_id, data, valor, descricao
    INTO v_conta_financeira_id, v_data, v_valor, v_descricao_ofx
  FROM ofx_lancamentos
  WHERE id = p_ofx_id AND NOT conciliado AND loja_id = @current_loja_id
  FOR UPDATE;
  IF v_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras
   WHERE id = v_conta_financeira_id AND loja_id = @current_loja_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SET v_valor_abs = ABS(v_valor);
  SET v_tipo = CASE WHEN v_valor >= 0 THEN 'entrada' ELSE 'saida' END;

  SELECT COUNT(*), COALESCE(SUM(valor), 0) INTO v_qtd_itens, v_soma_itens
  FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(valor DECIMAL(14,2) PATH '$.valor')) jt;
  IF v_soma_itens <> v_valor_abs THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A soma dos itens do rateio precisa bater exatamente com o valor da linha do extrato';
  END IF;

  SELECT COUNT(*) INTO v_qtd_validos
  FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
      plano_conta_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.plano_conta_id',
      valor DECIMAL(14,2) PATH '$.valor'
    )) jt
  WHERE jt.plano_conta_id IS NOT NULL AND jt.valor > 0;
  IF v_qtd_validos <> v_qtd_itens THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cada item do rateio precisa de uma categoria contábil e valor maior que zero';
  END IF;

  -- Cada categoria contábil do rateio vem por id do formulário. Sem conferir,
  -- o rateio de uma Loja podia creditar a receita na conta da outra.
  SELECT COUNT(*) INTO v_qtd_contas_da_loja
  FROM JSON_TABLE(p_itens, '$[*]' COLUMNS(
      plano_conta_id CHAR(36) COLLATE utf8mb4_unicode_ci PATH '$.plano_conta_id'
    )) jt
  JOIN plano_contas pc ON pc.id = jt.plano_conta_id AND pc.loja_id = @current_loja_id;
  IF v_qtd_contas_da_loja <> v_qtd_itens THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma categoria contábil do rateio não pertence a esta loja';
  END IF;

  SET p_conciliacao_id = UUID();
  INSERT INTO conciliacoes (id, conta_financeira_id, data_conciliacao, valor_total, criado_por, loja_id)
  VALUES (p_conciliacao_id, v_conta_financeira_id, v_data, v_valor_abs, @current_usuario_id, @current_loja_id);

  UPDATE ofx_lancamentos SET conciliado = TRUE, conciliacao_id = p_conciliacao_id
   WHERE id = p_ofx_id AND loja_id = @current_loja_id;

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  loop_itens: LOOP
    FETCH cur INTO v_plano_conta_id, v_categoria, v_irmao_id, v_valor_item, v_descricao_item;
    IF v_done THEN LEAVE loop_itens; END IF;

    SET v_desc = COALESCE(v_descricao_item, v_descricao_ofx, 'Lançamento importado do extrato');
    SET v_item_id = UUID();

    INSERT INTO lancamentos (
      id, data, data_pagamento, descricao, valor, valor_pago, tipo, conta_id, plano_conta_id,
      irmao_id, categoria_recebimento, pago, conciliacao_id, criado_por, loja_id
    ) VALUES (
      v_item_id, v_data, v_data, v_desc, v_valor_item, v_valor_item, v_tipo, v_conta_financeira_id, v_plano_conta_id,
      v_irmao_id, CASE WHEN v_tipo = 'entrada' THEN v_categoria ELSE NULL END, TRUE, p_conciliacao_id,
      @current_usuario_id, @current_loja_id
    );

    IF v_tipo = 'entrada' THEN
      SET v_itens_contabeis = JSON_ARRAY(
        JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', CAST(v_valor_item AS DECIMAL(14,2))),
        JSON_OBJECT('conta_id', v_plano_conta_id, 'tipo', 'credito', 'valor', CAST(v_valor_item AS DECIMAL(14,2)))
      );
    ELSE
      SET v_itens_contabeis = JSON_ARRAY(
        JSON_OBJECT('conta_id', v_plano_conta_id, 'tipo', 'debito', 'valor', CAST(v_valor_item AS DECIMAL(14,2))),
        JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', CAST(v_valor_item AS DECIMAL(14,2)))
      );
    END IF;

    CALL registrar_lancamento_contabil(v_data, mes_competencia(v_data), v_desc, v_itens_contabeis, 'ofx_importado', v_item_id, v_lanc_contabil_id_novo);

    INSERT INTO conciliacao_lancamentos
      (conciliacao_id, lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id, loja_id)
    VALUES
      (p_conciliacao_id, v_item_id, v_valor_item, TRUE, v_lanc_contabil_id_novo, @current_loja_id);
  END LOOP;
  CLOSE cur;

  IF v_own_tx THEN COMMIT; END IF;
END$$

-- Desfazer conciliação apaga lançamentos. Os dois DELETE finais não tinham
-- filtro de loja nenhum: o segundo, em particular, varria `lancamentos` do
-- banco inteiro procurando órfãos de conciliação — apagando os da Loja
-- vizinha junto. É a segunda rotina mais perigosa da lista, atrás só do
-- resetar_financeiro.
DROP PROCEDURE IF EXISTS desfazer_conciliacao$$
CREATE PROCEDURE desfazer_conciliacao(IN p_conciliacao_id CHAR(36), IN p_motivo TEXT)
BEGIN
  DECLARE v_data_conciliacao DATE;
  DECLARE v_status VARCHAR(20);
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_valor_aplicado DECIMAL(14,2);
  DECLARE v_fechou_fatura BOOLEAN;
  DECLARE v_lanc_contabil_id CHAR(36);
  DECLARE v_estorno_id CHAR(36);
  DECLARE v_itens JSON;
  DECLARE v_bloqueado INT;
  DECLARE v_criado_pelo_evento BOOLEAN;
  DECLARE cur CURSOR FOR
    SELECT lancamento_id, valor_aplicado, fechou_fatura, lancamento_contabil_id
    FROM conciliacao_lancamentos
    WHERE conciliacao_id = p_conciliacao_id AND loja_id = @current_loja_id;
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
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo do desfazimento';
  END IF;

  SELECT data_conciliacao, status INTO v_data_conciliacao, v_status
  FROM conciliacoes WHERE id = p_conciliacao_id AND loja_id = @current_loja_id;
  IF v_data_conciliacao IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conciliação não encontrada';
  END IF;
  IF v_status <> 'ativa' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conciliação já foi desfeita';
  END IF;
  IF periodo_esta_fechado(v_data_conciliacao) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para a data desta conciliação — reabra antes de desfazer';
  END IF;

  SELECT COUNT(*) INTO v_bloqueado
  FROM conciliacao_lancamentos cl
  WHERE cl.conciliacao_id = p_conciliacao_id AND cl.loja_id = @current_loja_id
  AND (
    EXISTS (
      SELECT 1 FROM conciliacao_lancamentos cl2
      JOIN conciliacoes c2 ON c2.id = cl2.conciliacao_id AND c2.loja_id = cl2.loja_id
                          AND c2.status = 'ativa'
      WHERE cl2.lancamento_id = cl.lancamento_id AND cl2.loja_id = cl.loja_id
        AND cl2.criado_em > cl.criado_em
    )
    OR EXISTS (
      SELECT 1 FROM recibo_itens ri
      JOIN recibos r ON r.id = ri.recibo_id AND r.loja_id = ri.loja_id
      WHERE ri.lancamento_id = cl.lancamento_id AND ri.loja_id = cl.loja_id
        AND r.criado_em > cl.criado_em
    )
  );
  IF v_bloqueado > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma ou mais faturas desta conciliação já receberam outro pagamento depois (conciliação ou baixa manual) — desfaça primeiro o pagamento mais recente dessas faturas';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = FALSE, conciliacao_id = NULL
  WHERE conciliacao_id = p_conciliacao_id AND loja_id = @current_loja_id;

  -- Um "SELECT ... INTO" acima que não acha linha dispara o CONTINUE
  -- HANDLER FOR NOT FOUND e deixa v_done = TRUE — o laço abaixo sairia
  -- na primeira volta, sem erro nenhum. Zerar o sinalizador aqui é o
  -- que separa "não havia nada a fazer" de "não fizemos nada calados".
  SET v_done = FALSE;
  OPEN cur;
  loop_cl: LOOP
    FETCH cur INTO v_lanc_id, v_valor_aplicado, v_fechou_fatura, v_lanc_contabil_id;
    IF v_done THEN LEAVE loop_cl; END IF;

    IF v_lanc_contabil_id IS NOT NULL THEN
      SET v_itens = (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'conta_id', conta_id,
            'tipo', IF(tipo = 'debito', 'credito', 'debito'),
            'valor', valor,
            'descricao', descricao
          )
        )
        FROM lancamentos_contabeis_itens
        WHERE lancamento_id = v_lanc_contabil_id AND loja_id = @current_loja_id
      );
      CALL registrar_lancamento_contabil(
        v_data_conciliacao, mes_competencia(v_data_conciliacao),
        'Estorno de conciliação desfeita',
        v_itens, 'conciliacao_estorno', v_lanc_id, v_estorno_id
      );
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM lancamentos_contabeis
      WHERE origem_tipo = 'ofx_importado' AND origem_id = v_lanc_id
        AND loja_id = @current_loja_id
    ) INTO v_criado_pelo_evento;

    IF NOT v_criado_pelo_evento THEN
      IF v_fechou_fatura THEN
        UPDATE lancamentos
        SET valor_pago = valor_pago - v_valor_aplicado,
            pago = FALSE, data_pagamento = NULL, conta_id = NULL, conciliacao_id = NULL,
            forma_pagamento = IF(forma_pagamento = 'Conciliação OFX', NULL, forma_pagamento)
        WHERE id = v_lanc_id AND loja_id = @current_loja_id;
      ELSE
        UPDATE lancamentos SET valor_pago = valor_pago - v_valor_aplicado
         WHERE id = v_lanc_id AND loja_id = @current_loja_id;
      END IF;
    END IF;
  END LOOP;
  CLOSE cur;

  DELETE cl FROM conciliacao_lancamentos cl
  JOIN lancamentos_contabeis lc
    ON lc.origem_tipo = 'ofx_importado' AND lc.origem_id = cl.lancamento_id
   AND lc.loja_id = cl.loja_id
  WHERE cl.conciliacao_id = p_conciliacao_id AND cl.loja_id = @current_loja_id;

  -- Este DELETE varre `lancamentos` procurando o que ficou órfão. Sem o
  -- `l.loja_id = @current_loja_id` ele alcançava as outras Lojas.
  DELETE l FROM lancamentos l
  JOIN lancamentos_contabeis lc
    ON lc.origem_tipo = 'ofx_importado' AND lc.origem_id = l.id AND lc.loja_id = l.loja_id
  WHERE l.loja_id = @current_loja_id
    AND NOT EXISTS (
      SELECT 1 FROM conciliacao_lancamentos cl2
       WHERE cl2.lancamento_id = l.id AND cl2.loja_id = l.loja_id
    );

  UPDATE conciliacoes
  SET status = 'desfeita', desfeita_por = @current_usuario_id, desfeita_em = NOW(), motivo_desfazimento = p_motivo
  WHERE id = p_conciliacao_id AND loja_id = @current_loja_id;

  IF v_own_tx THEN COMMIT; END IF;
END$$

DELIMITER ;
