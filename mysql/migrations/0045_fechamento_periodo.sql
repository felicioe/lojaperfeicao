-- =========================================
-- FECHAMENTO DE PERÍODO MENSAL (issue #122) — trava mais leve que o
-- Fechamento de Exercício (0005, anual): não apura resultado nem
-- transporta saldo, só impede qualquer novo lançamento/movimentação
-- datado num mês já fechado. Mesma disciplina de fechamento sequencial
-- (só fecha o mês seguinte ao último fechado, só reabre o último
-- fechado) e mesmo padrão de tabela principal + tabela de eventos de
-- `fechamentos_exercicio`/`fechamentos_exercicio_eventos`.
-- =========================================
CREATE TABLE IF NOT EXISTS periodos_fechados (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  competencia DATE NOT NULL UNIQUE COMMENT 'primeiro dia do mês, ex 2026-08-01',
  status ENUM('fechado', 'reaberto') NOT NULL DEFAULT 'fechado',
  fechado_por CHAR(36),
  fechado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reaberto_por CHAR(36),
  reaberto_em DATETIME NULL DEFAULT NULL,
  motivo_reabertura TEXT,
  observacoes TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS periodos_fechados_eventos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  periodo_id CHAR(36) NOT NULL,
  acao ENUM('fechamento', 'reabertura') NOT NULL,
  realizado_por CHAR(36),
  realizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motivo TEXT,
  CONSTRAINT fk_pfe_periodo FOREIGN KEY (periodo_id) REFERENCES periodos_fechados(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_pfe_periodo ON periodos_fechados_eventos (periodo_id);

-- Função compartilhada: uma data está bloqueada se cair num exercício
-- fechado (fechamentos_exercicio, 0005) OU num período mensal fechado
-- (periodos_fechados, aqui) — usada dentro de registrar_lancamento_contabil
-- e nos triggers de `lancamentos` logo abaixo, ponto único da regra.
DROP FUNCTION IF EXISTS periodo_esta_fechado;
DELIMITER $$
CREATE FUNCTION periodo_esta_fechado(p_data DATE) RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  IF p_data IS NULL THEN
    RETURN FALSE;
  END IF;
  IF EXISTS (SELECT 1 FROM fechamentos_exercicio WHERE status = 'fechado' AND p_data <= data_corte) THEN
    RETURN TRUE;
  END IF;
  IF EXISTS (SELECT 1 FROM periodos_fechados WHERE status = 'fechado' AND p_data <= LAST_DAY(competencia)) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END$$
DELIMITER ;

-- Mesmo corpo de registrar_lancamento_contabil (0005), só trocando a
-- checagem inline de fechamentos_exercicio pela função compartilhada
-- acima (agora cobre período mensal também).
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
  IF periodo_esta_fechado(p_data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício encerrado para esta data — reabra o fechamento correspondente antes de lançar';
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

-- Gap que este trigger fecha: nem todo lançamento em `lancamentos` passa
-- por registrar_lancamento_contabil (ex.: lançamento manual sem partida
-- dobrada, por design — ver comentário em criarLancamentoManual). Sem
-- isso, um mês fechado bloquearia a contabilidade mas não impediria criar
-- ou editar um lançamento "cru" datado dentro dele. Cobre `data` (emissão)
-- e `data_pagamento` (baixa) — as duas datas que "colocam" um lançamento
-- dentro do período.
DROP TRIGGER IF EXISTS trg_lancamentos_bloqueia_periodo_fechado_insert;
DELIMITER $$
CREATE TRIGGER trg_lancamentos_bloqueia_periodo_fechado_insert
BEFORE INSERT ON lancamentos
FOR EACH ROW
BEGIN
  IF periodo_esta_fechado(NEW.data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício contábil encerrado para esta data';
  END IF;
  IF NEW.data_pagamento IS NOT NULL AND periodo_esta_fechado(NEW.data_pagamento) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício contábil encerrado para a data de pagamento';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_lancamentos_bloqueia_periodo_fechado_update;
DELIMITER $$
CREATE TRIGGER trg_lancamentos_bloqueia_periodo_fechado_update
BEFORE UPDATE ON lancamentos
FOR EACH ROW
BEGIN
  IF periodo_esta_fechado(OLD.data) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este lançamento pertence a um período/exercício contábil já encerrado';
  END IF;
  IF NEW.data_pagamento IS NOT NULL
     AND (OLD.data_pagamento IS NULL OR OLD.data_pagamento <> NEW.data_pagamento)
     AND periodo_esta_fechado(NEW.data_pagamento) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período/exercício contábil encerrado para a nova data de pagamento';
  END IF;
END$$
DELIMITER ;

-- RPC: fecha o período (mês). Sem apuração de resultado — só trava.
DROP PROCEDURE IF EXISTS fechar_periodo;
DELIMITER $$
CREATE PROCEDURE fechar_periodo(IN p_competencia DATE, IN p_observacoes TEXT, OUT p_periodo_id CHAR(36))
BEGIN
  DECLARE v_competencia DATE;
  DECLARE v_existing_id CHAR(36);
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

  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin fecha o período';
  END IF;

  SET v_competencia = mes_competencia(p_competencia);
  IF EXISTS (SELECT 1 FROM periodos_fechados WHERE competencia = v_competencia AND status = 'fechado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Este período já está fechado';
  END IF;
  IF EXISTS (SELECT 1 FROM periodos_fechados WHERE competencia > v_competencia AND status = 'fechado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um período mais recente já fechado — feche os períodos em ordem cronológica';
  END IF;

  SELECT id INTO v_existing_id FROM periodos_fechados WHERE competencia = v_competencia;
  IF v_existing_id IS NOT NULL THEN
    SET p_periodo_id = v_existing_id;
    UPDATE periodos_fechados SET
      status = 'fechado', fechado_por = @current_usuario_id, fechado_em = NOW(),
      reaberto_por = NULL, reaberto_em = NULL, motivo_reabertura = NULL, observacoes = p_observacoes
    WHERE id = p_periodo_id;
  ELSE
    SET p_periodo_id = UUID();
    INSERT INTO periodos_fechados (id, competencia, status, fechado_por, fechado_em, observacoes)
    VALUES (p_periodo_id, v_competencia, 'fechado', @current_usuario_id, NOW(), p_observacoes);
  END IF;

  INSERT INTO periodos_fechados_eventos (periodo_id, acao, realizado_por, motivo)
  VALUES (p_periodo_id, 'fechamento', @current_usuario_id, p_observacoes);

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;

-- RPC: reabre o último período fechado.
DROP PROCEDURE IF EXISTS reabrir_periodo;
DELIMITER $$
CREATE PROCEDURE reabrir_periodo(IN p_competencia DATE, IN p_motivo TEXT)
BEGIN
  DECLARE v_periodo_id CHAR(36);
  DECLARE v_competencia DATE;
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

  IF NOT has_role(@current_usuario_id, 'admin') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão — apenas admin reabre o período';
  END IF;
  IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe o motivo da reabertura';
  END IF;

  SET v_competencia = mes_competencia(p_competencia);
  SELECT id INTO v_periodo_id FROM periodos_fechados WHERE competencia = v_competencia AND status = 'fechado';
  IF v_periodo_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Período não encontrado ou não está fechado';
  END IF;
  IF EXISTS (SELECT 1 FROM periodos_fechados WHERE competencia > v_competencia AND status = 'fechado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existe um período mais recente já fechado — reabra-o primeiro';
  END IF;

  UPDATE periodos_fechados
  SET status = 'reaberto', reaberto_por = @current_usuario_id, reaberto_em = NOW(), motivo_reabertura = p_motivo
  WHERE id = v_periodo_id;

  INSERT INTO periodos_fechados_eventos (periodo_id, acao, realizado_por, motivo)
  VALUES (v_periodo_id, 'reabertura', @current_usuario_id, p_motivo);

  IF v_own_tx THEN
    COMMIT;
  END IF;
END$$
DELIMITER ;
