-- =========================================
-- Schema MySQL — orçamento anual e fechamento de exercício (issue #52,
-- Fase 8). Tradução final das issues #16 e #18 (Postgres) para MySQL.
-- Ver mysql/README.md para as decisões gerais e mysql/migrations/0003 para
-- o padrão de atomicidade (transação própria via @@in_transaction) usado
-- em toda procedure que faz mais de uma escrita.
-- =========================================

-- =========================================
-- ORÇAMENTO ANUAL (issue #16)
-- RLS original: SELECT admin/tesoureiro. Sem policy de escrita direta —
-- só as procedures abaixo (mesmo padrão do Postgres).
-- =========================================
CREATE TABLE IF NOT EXISTS orcamentos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  ano INT NOT NULL UNIQUE,
  status ENUM('rascunho', 'aprovado') NOT NULL DEFAULT 'rascunho',
  observacoes TEXT,
  criado_por CHAR(36),
  aprovado_por CHAR(36),
  aprovado_em DATETIME NULL DEFAULT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_orcamentos_ano CHECK (ano BETWEEN 2000 AND 2100)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orcamento_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  orcamento_id CHAR(36) NOT NULL,
  conta_id CHAR(36) NOT NULL,
  mes TINYINT NOT NULL,
  valor DECIMAL(14,2) NOT NULL DEFAULT 0,
  UNIQUE KEY orcamento_itens_uniq (orcamento_id, conta_id, mes),
  CONSTRAINT chk_orcamento_itens_mes CHECK (mes BETWEEN 1 AND 12),
  CONSTRAINT chk_orcamento_itens_valor CHECK (valor >= 0),
  CONSTRAINT fk_orcamento_itens_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_orcamento_itens_conta FOREIGN KEY (conta_id) REFERENCES plano_contas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_orcamento_itens_orcamento ON orcamento_itens (orcamento_id);
CREATE INDEX idx_orcamento_itens_conta ON orcamento_itens (conta_id);

-- RPC: cria o orçamento (rascunho) de um ano. Único statement de escrita —
-- não precisa de wrapper de transação (ver mysql/README.md).
DROP PROCEDURE IF EXISTS criar_orcamento;
DELIMITER $$
CREATE PROCEDURE criar_orcamento(IN p_ano INT, IN p_observacoes TEXT, OUT p_orcamento_id CHAR(36))
BEGIN
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF EXISTS (SELECT 1 FROM orcamentos WHERE ano = p_ano) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Já existe um orçamento cadastrado para este ano';
  END IF;

  SET p_orcamento_id = UUID();
  INSERT INTO orcamentos (id, ano, observacoes, criado_por)
  VALUES (p_orcamento_id, p_ano, p_observacoes, @current_usuario_id);
END$$
DELIMITER ;

-- RPC: define (upsert) o valor orçado de uma conta analítica em um mês.
DROP PROCEDURE IF EXISTS definir_valor_orcamento;
DELIMITER $$
CREATE PROCEDURE definir_valor_orcamento(IN p_orcamento_id CHAR(36), IN p_conta_id CHAR(36), IN p_mes INT, IN p_valor DECIMAL(14,2))
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_analitica BOOLEAN;
  DECLARE v_tipo VARCHAR(30);

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT status INTO v_status FROM orcamentos WHERE id = p_orcamento_id;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado';
  END IF;
  IF v_status <> 'rascunho' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento aprovado não pode ser editado — reabra antes de editar';
  END IF;

  SELECT analitica, tipo INTO v_analitica, v_tipo FROM plano_contas WHERE id = p_conta_id;
  IF v_analitica IS NULL OR NOT v_analitica OR v_tipo NOT IN ('receita', 'despesa') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta inválida para orçamento — selecione uma conta analítica de receita ou despesa';
  END IF;

  INSERT INTO orcamento_itens (orcamento_id, conta_id, mes, valor)
  VALUES (p_orcamento_id, p_conta_id, p_mes, p_valor)
  ON DUPLICATE KEY UPDATE valor = VALUES(valor);
END$$
DELIMITER ;

-- RPC: aprova o orçamento (rascunho -> aprovado). Só admin.
DROP PROCEDURE IF EXISTS aprovar_orcamento;
DELIMITER $$
CREATE PROCEDURE aprovar_orcamento(IN p_orcamento_id CHAR(36))
BEGIN
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin aprova o orçamento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orcamentos WHERE id = p_orcamento_id AND status = 'rascunho') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou já aprovado';
  END IF;

  UPDATE orcamentos SET status = 'aprovado', aprovado_por = @current_usuario_id, aprovado_em = NOW()
  WHERE id = p_orcamento_id;
END$$
DELIMITER ;

-- RPC: reabre um orçamento aprovado (volta para rascunho). Só admin.
DROP PROCEDURE IF EXISTS reabrir_orcamento;
DELIMITER $$
CREATE PROCEDURE reabrir_orcamento(IN p_orcamento_id CHAR(36))
BEGIN
  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o orçamento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orcamentos WHERE id = p_orcamento_id AND status = 'aprovado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orçamento não encontrado ou não está aprovado';
  END IF;

  UPDATE orcamentos SET status = 'rascunho', aprovado_por = NULL, aprovado_em = NULL
  WHERE id = p_orcamento_id;
END$$
DELIMITER ;

-- =========================================
-- FECHAMENTO DE EXERCÍCIO (issue #18 — funcionalidade nova, não existia no
-- legado: renderFechamento() no PHP era só uma tela de listagem).
-- =========================================
INSERT IGNORE INTO plano_contas (codigo, nome, tipo, analitica, parent_id)
SELECT '3.1.01', 'Lucros/Prejuízos Acumulados', 'patrimonio_liquido', TRUE, id FROM plano_contas WHERE codigo = '3';

CREATE TABLE IF NOT EXISTS fechamentos_exercicio (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  exercicio INT NOT NULL UNIQUE,
  data_corte DATE NOT NULL,
  status ENUM('fechado', 'reaberto') NOT NULL DEFAULT 'fechado',
  lancamento_transporte_id CHAR(36),
  resultado_apurado DECIMAL(14,2),
  fechado_por CHAR(36),
  fechado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reaberto_por CHAR(36),
  reaberto_em DATETIME NULL DEFAULT NULL,
  motivo_reabertura TEXT,
  observacoes TEXT,
  CONSTRAINT chk_fechamentos_exercicio_ano CHECK (exercicio BETWEEN 2000 AND 2100),
  CONSTRAINT fk_fechamentos_exercicio_lancamento FOREIGN KEY (lancamento_transporte_id) REFERENCES lancamentos_contabeis(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fechamentos_exercicio_eventos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  fechamento_id CHAR(36) NOT NULL,
  acao ENUM('fechamento', 'reabertura') NOT NULL,
  lancamento_id CHAR(36),
  realizado_por CHAR(36),
  realizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motivo TEXT,
  CONSTRAINT fk_fee_fechamento FOREIGN KEY (fechamento_id) REFERENCES fechamentos_exercicio(id) ON DELETE CASCADE,
  CONSTRAINT fk_fee_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos_contabeis(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_fee_fechamento ON fechamentos_exercicio_eventos (fechamento_id);

-- =========================================
-- Trava: nenhum lançamento contábil pode ser registrado com data <= à data
-- de corte de um exercício ainda fechado. DROP+CREATE em vez de editar
-- 0003 (já aplicada) — mesma técnica usada no lado Postgres (issue #8/#18)
-- e em 0004 desta mesma fase. Corpo idêntico ao de 0003, só acrescido da
-- checagem de exercício fechado logo após a checagem de permissão.
-- =========================================
DROP PROCEDURE IF EXISTS registrar_lancamento_contabil;
DELIMITER $$
CREATE PROCEDURE registrar_lancamento_contabil(
  IN p_data DATE,
  IN p_competencia DATE,
  IN p_descricao VARCHAR(500),
  IN p_itens JSON,
  IN p_origem_tipo VARCHAR(50),
  IN p_origem_id CHAR(36),
  OUT p_lancamento_id CHAR(36)
)
BEGIN
  DECLARE v_n INT;
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_tipo VARCHAR(20);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_desc VARCHAR(500);
  DECLARE v_analitica BOOLEAN;
  DECLARE v_soma_debito DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_credito DECIMAL(14,2) DEFAULT 0;
  DECLARE v_own_tx BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF @current_usuario_id IS NOT NULL AND NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão para registrar lançamento contábil';
  END IF;
  IF EXISTS (SELECT 1 FROM fechamentos_exercicio WHERE status = 'fechado' AND p_data <= data_corte) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Exercício encerrado para esta data — reabra o fechamento correspondente antes de lançar';
  END IF;

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Um lançamento contábil precisa de ao menos uma linha de débito e uma de crédito';
  END IF;

  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));

    SELECT analitica INTO v_analitica FROM plano_contas WHERE id = v_conta_id;
    IF v_analitica IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta não encontrada no plano de contas';
    END IF;
    IF NOT v_analitica THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta não é analítica — apenas contas-folha recebem lançamento';
    END IF;
    IF v_tipo NOT IN ('debito', 'credito') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Tipo de linha inválido';
    END IF;

    IF v_tipo = 'debito' THEN
      SET v_soma_debito = v_soma_debito + v_valor;
    ELSE
      SET v_soma_credito = v_soma_credito + v_valor;
    END IF;

    SET v_i = v_i + 1;
  END WHILE;

  IF v_soma_debito <> v_soma_credito THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento contábil desbalanceado: débito e crédito não batem';
  END IF;

  SET p_lancamento_id = UUID();
  INSERT INTO lancamentos_contabeis (id, data, competencia, descricao, origem_tipo, origem_id, criado_por)
  VALUES (p_lancamento_id, p_data, p_competencia, p_descricao, p_origem_tipo, p_origem_id, @current_usuario_id);

  SET v_i = 0;
  WHILE v_i < v_n DO
    SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].conta_id')));
    SET v_tipo = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].tipo')));
    SET v_valor = JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].valor'));
    SET v_desc = JSON_UNQUOTE(JSON_EXTRACT(p_itens, CONCAT('$[', v_i, '].descricao')));

    INSERT INTO lancamentos_contabeis_itens (lancamento_id, conta_id, tipo, valor, descricao)
    VALUES (p_lancamento_id, v_conta_id, v_tipo, v_valor, v_desc);

    SET v_i = v_i + 1;
  END WHILE;

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- =========================================
-- RPC: fecha o exercício. Apura o saldo de todas as contas analíticas de
-- receita/despesa (acumulado desde o início — um fechamento anterior já
-- zerou tudo antes do período atual) até a data de corte, zera essas
-- contas e transporta o resultado para "Lucros/Prejuízos Acumulados".
-- =========================================
DROP PROCEDURE IF EXISTS fechar_exercicio;
DELIMITER $$
CREATE PROCEDURE fechar_exercicio(IN p_exercicio INT, IN p_data_corte DATE, IN p_observacoes TEXT, OUT p_fechamento_id CHAR(36))
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
    JOIN lancamentos_contabeis_itens i ON i.conta_id = pc.id
    JOIN lancamentos_contabeis lc ON lc.id = i.lancamento_id
    WHERE pc.tipo IN ('receita', 'despesa') AND pc.analitica AND lc.data <= p_data_corte
    GROUP BY pc.id, pc.tipo;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin fecha o exercício';
  END IF;
  IF YEAR(p_data_corte) <> p_exercicio THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A data de corte não pertence ao exercício informado';
  END IF;
  IF EXISTS (SELECT 1 FROM fechamentos_exercicio WHERE exercicio = p_exercicio AND status = 'fechado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este exercício já está fechado';
  END IF;
  IF EXISTS (SELECT 1 FROM fechamentos_exercicio WHERE exercicio > p_exercicio AND status = 'fechado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um exercício mais recente já fechado — feche os exercícios em ordem cronológica';
  END IF;

  SELECT id INTO v_resultados_id FROM plano_contas WHERE codigo = '3.1.01';
  IF v_resultados_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Lucros/Prejuízos Acumulados" (3.1.01) não encontrada';
  END IF;

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

  SELECT id INTO v_existing_id FROM fechamentos_exercicio WHERE exercicio = p_exercicio;
  IF v_existing_id IS NOT NULL THEN
    SET p_fechamento_id = v_existing_id;
    UPDATE fechamentos_exercicio SET
      data_corte = p_data_corte, status = 'fechado', lancamento_transporte_id = v_lanc_id,
      resultado_apurado = v_resultado, fechado_por = @current_usuario_id, fechado_em = NOW(),
      reaberto_por = NULL, reaberto_em = NULL, motivo_reabertura = NULL, observacoes = p_observacoes
    WHERE id = p_fechamento_id;
  ELSE
    SET p_fechamento_id = UUID();
    INSERT INTO fechamentos_exercicio (id, exercicio, data_corte, status, lancamento_transporte_id, resultado_apurado, fechado_por, fechado_em, observacoes)
    VALUES (p_fechamento_id, p_exercicio, p_data_corte, 'fechado', v_lanc_id, v_resultado, @current_usuario_id, NOW(), p_observacoes);
  END IF;

  INSERT INTO fechamentos_exercicio_eventos (fechamento_id, acao, lancamento_id, realizado_por, motivo)
  VALUES (p_fechamento_id, 'fechamento', v_lanc_id, @current_usuario_id, p_observacoes);

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- =========================================
-- RPC: reabre um exercício fechado. Primeiro destrava (muda o status, o
-- que libera a checagem em registrar_lancamento_contabil), só então posta
-- o estorno do lançamento de fechamento — nessa ordem porque, com o status
-- ainda 'fechado', o próprio estorno (datado na data de corte) seria
-- bloqueado pela trava que estamos removendo.
-- =========================================
DROP PROCEDURE IF EXISTS reabrir_exercicio;
DELIMITER $$
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
    SELECT conta_id, tipo, valor, descricao FROM lancamentos_contabeis_itens WHERE lancamento_id = v_lancamento_transporte_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_own_tx THEN ROLLBACK; END IF;
    RESIGNAL;
  END;

  IF @@in_transaction = 0 THEN
    START TRANSACTION;
    SET v_own_tx = TRUE;
  END IF;

  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o exercício';
  END IF;
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo da reabertura';
  END IF;

  SELECT id, data_corte, lancamento_transporte_id INTO v_fechamento_id, v_data_corte, v_lancamento_transporte_id
  FROM fechamentos_exercicio WHERE exercicio = p_exercicio AND status = 'fechado';
  IF v_fechamento_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Exercício não encontrado ou não está fechado';
  END IF;
  IF EXISTS (SELECT 1 FROM fechamentos_exercicio WHERE exercicio > p_exercicio AND status = 'fechado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um exercício mais recente já fechado — reabra-o primeiro';
  END IF;

  UPDATE fechamentos_exercicio
  SET status = 'reaberto', reaberto_por = @current_usuario_id, reaberto_em = NOW(), motivo_reabertura = p_motivo
  WHERE id = v_fechamento_id;

  IF v_lancamento_transporte_id IS NOT NULL THEN
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

  INSERT INTO fechamentos_exercicio_eventos (fechamento_id, acao, lancamento_id, realizado_por, motivo)
  VALUES (v_fechamento_id, 'reabertura', v_estorno_id, @current_usuario_id, p_motivo);

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
