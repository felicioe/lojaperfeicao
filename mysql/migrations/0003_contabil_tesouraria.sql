-- =========================================
-- Schema MySQL — motor contábil e tesouraria (issue #51, Fase 8).
-- Tradução final das tabelas e RPCs hoje em Postgres (issues #1, #2, #7,
-- #8, #9, #10, #11, #12, #13) para MySQL/MariaDB. Ver mysql/README.md.
--
-- Sobre o balanceamento débito=crédito: o Postgres usa uma constraint
-- trigger ADIÁVEL (checa no fim da transação). MariaDB não tem isso. A
-- validação aqui acontece ANTES de qualquer INSERT, dentro da própria
-- `registrar_lancamento_contabil` — soma os itens do JSON recebido e
-- recusa a chamada inteira se débito ≠ crédito. Mais simples e falha mais
-- cedo que o trigger adiável.
--
-- Sobre listas de IDs (equivalente a UUID[] do Postgres): stored procedure
-- MySQL não tem tipo array. Onde o Postgres recebe `_lancamento_ids UUID[]`
-- e filtra com `WHERE id = ANY(_ids)`, aqui o parâmetro é um JSON array de
-- strings e o filtro correspondente é `WHERE JSON_CONTAINS(p_ids,
-- JSON_QUOTE(id))` — testado localmente, comportamento idêntico.
--
-- Sobre FOR-IN-SELECT: PL/pgSQL itera uma query direto num FOR loop; MySQL
-- precisa de cursor explícito (DECLARE CURSOR + handler NOT FOUND). Mais
-- verboso, mesmo resultado.
-- =========================================

-- =========================================
-- Função utilitária: equivalente a date_trunc('month', x)::date.
-- =========================================
DROP FUNCTION IF EXISTS mes_competencia;
DELIMITER $$
CREATE FUNCTION mes_competencia(p_data DATE) RETURNS DATE
DETERMINISTIC
BEGIN
  RETURN DATE_SUB(p_data, INTERVAL (DAYOFMONTH(p_data) - 1) DAY);
END$$
DELIMITER ;

-- =========================================
-- PLANO DE CONTAS
-- RLS original: SELECT livre; escrita admin/tesoureiro.
-- =========================================
CREATE TABLE IF NOT EXISTS plano_contas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(255) NOT NULL,
  tipo ENUM('receita', 'despesa', 'ativo', 'passivo', 'patrimonio_liquido') NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  analitica BOOLEAN NOT NULL DEFAULT TRUE,
  parent_id CHAR(36),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_plano_contas_parent FOREIGN KEY (parent_id) REFERENCES plano_contas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_plano_contas_parent ON plano_contas (parent_id);

-- Guarda-corpo 1: uma conta que ganha filha deixa de ser analítica.
-- Só ajusta NEW.* quando a própria linha inserida é o pai (não aplicável
-- aqui — o pai já existe, é outra linha), então isso precisa ser um UPDATE
-- em outra linha (o pai) a partir do trigger da tabela filha. Mesma
-- restrição descoberta na issue #50 (trigger não pode UPDATE a própria
-- tabela que o disparou)? Não se aplica aqui: o trigger é AFTER INSERT/
-- UPDATE OF parent_id, e o UPDATE alvo é uma LINHA DIFERENTE (o pai) da
-- mesma tabela — isso também cai na mesma restrição 1442 (a restrição é
-- por TABELA, não por linha). Testado: precisa da mesma estratégia da
-- issue #50, então este guarda-corpo deixa de ser trigger e vira parte da
-- própria procedure que insere/reparenta uma conta (ver `salvar_conta` mais
-- abaixo) — quem reparenta já desativa `analitica` do novo pai no mesmo
-- fluxo, sem trigger.
--
-- Guarda-corpo 2 (ciclo na hierarquia): mesma lógica, também incorporado a
-- `salvar_conta` abaixo em vez de trigger, para manter os dois guarda-
-- corpos no mesmo lugar (mais fácil de auditar do que espalhar entre
-- trigger e procedure).
DROP PROCEDURE IF EXISTS salvar_conta;
DELIMITER $$
CREATE PROCEDURE salvar_conta(
  IN p_id CHAR(36),
  IN p_codigo VARCHAR(20),
  IN p_nome VARCHAR(255),
  IN p_tipo VARCHAR(30),
  IN p_parent_id CHAR(36),
  IN p_analitica BOOLEAN,
  OUT p_out_id CHAR(36)
)
BEGIN
  DECLARE v_cur CHAR(36);
  DECLARE v_hops INT DEFAULT 0;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    IF p_parent_id = p_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uma conta não pode ser pai de si mesma';
    END IF;
    SET v_cur = p_parent_id;
    WHILE v_cur IS NOT NULL AND v_hops < 50 DO
      IF v_cur = p_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ciclo detectado na hierarquia do plano de contas';
      END IF;
      SELECT parent_id INTO v_cur FROM plano_contas WHERE id = v_cur;
      SET v_hops = v_hops + 1;
    END WHILE;
  END IF;

  IF p_id IS NULL THEN
    SET p_out_id = UUID();
    INSERT INTO plano_contas (id, codigo, nome, tipo, parent_id, analitica)
    VALUES (p_out_id, p_codigo, p_nome, p_tipo, p_parent_id, p_analitica);
  ELSE
    SET p_out_id = p_id;
    UPDATE plano_contas SET codigo = p_codigo, nome = p_nome, tipo = p_tipo, parent_id = p_parent_id, analitica = p_analitica
    WHERE id = p_id;
  END IF;

  IF p_parent_id IS NOT NULL THEN
    UPDATE plano_contas SET analitica = FALSE WHERE id = p_parent_id AND analitica = TRUE;
  END IF;
END$$
DELIMITER ;

INSERT IGNORE INTO plano_contas (codigo, nome, tipo, analitica) VALUES
  ('1', 'Ativo', 'ativo', FALSE),
  ('1.1', 'Ativo Circulante', 'ativo', FALSE),
  ('1.1.01', 'Caixa e Bancos', 'ativo', TRUE),
  ('1.1.02', 'Contas a Receber', 'ativo', TRUE),
  ('2', 'Passivo', 'passivo', FALSE),
  ('2.1', 'Passivo Circulante', 'passivo', FALSE),
  ('2.1.01', 'Contas a Pagar', 'passivo', TRUE),
  ('3', 'Patrimônio Líquido', 'patrimonio_liquido', FALSE),
  ('4', 'Receitas', 'receita', FALSE),
  ('4.1.01', 'Mensalidades', 'receita', TRUE),
  ('4.1.02', 'Doações', 'receita', TRUE),
  ('4.1.03', 'Eventos', 'receita', TRUE),
  ('4.1.06', 'Multas e Juros Recebidos', 'receita', TRUE),
  ('5', 'Despesas', 'despesa', FALSE),
  ('5.1.01', 'Aluguel', 'despesa', TRUE),
  ('5.1.02', 'Água/Luz/Internet', 'despesa', TRUE),
  ('5.1.03', 'Manutenção', 'despesa', TRUE),
  ('5.1.04', 'Material de expediente', 'despesa', TRUE),
  ('5.1.05', 'Beneficência', 'despesa', TRUE),
  ('5.1.06', 'Descontos Concedidos', 'despesa', TRUE);

UPDATE plano_contas c JOIN plano_contas p ON p.codigo = '1' SET c.parent_id = p.id WHERE c.codigo = '1.1' AND c.parent_id IS NULL;
UPDATE plano_contas c JOIN plano_contas p ON p.codigo = '1.1' SET c.parent_id = p.id WHERE c.codigo IN ('1.1.01', '1.1.02') AND c.parent_id IS NULL;
UPDATE plano_contas c JOIN plano_contas p ON p.codigo = '2' SET c.parent_id = p.id WHERE c.codigo = '2.1' AND c.parent_id IS NULL;
UPDATE plano_contas c JOIN plano_contas p ON p.codigo = '2.1' SET c.parent_id = p.id WHERE c.codigo = '2.1.01' AND c.parent_id IS NULL;
UPDATE plano_contas c JOIN plano_contas p ON p.codigo = '4' SET c.parent_id = p.id WHERE c.codigo IN ('4.1.01', '4.1.02', '4.1.03', '4.1.06') AND c.parent_id IS NULL;
UPDATE plano_contas c JOIN plano_contas p ON p.codigo = '5' SET c.parent_id = p.id WHERE c.codigo IN ('5.1.01', '5.1.02', '5.1.03', '5.1.04', '5.1.05', '5.1.06') AND c.parent_id IS NULL;
UPDATE plano_contas SET analitica = FALSE WHERE id IN (SELECT * FROM (SELECT DISTINCT parent_id FROM plano_contas WHERE parent_id IS NOT NULL) t);

-- =========================================
-- CONTAS FINANCEIRAS
-- RLS original: SELECT livre; escrita admin/tesoureiro.
-- =========================================
CREATE TABLE IF NOT EXISTS contas_financeiras (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  tipo ENUM('caixa', 'banco', 'outro') NOT NULL DEFAULT 'caixa',
  banco VARCHAR(255),
  agencia VARCHAR(20),
  numero VARCHAR(50),
  saldo_inicial DECIMAL(14,2) NOT NULL DEFAULT 0,
  plano_conta_id CHAR(36),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contas_financeiras_plano FOREIGN KEY (plano_conta_id) REFERENCES plano_contas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT IGNORE INTO contas_financeiras (nome, tipo, saldo_inicial, plano_conta_id)
SELECT 'Caixa Geral', 'caixa', 0, id FROM plano_contas WHERE codigo = '1.1.01';

-- =========================================
-- LANÇAMENTOS (operacional — contas a pagar/receber, mensalidades etc.)
-- RLS original: SELECT admin/tesoureiro/secretario (tudo) ou o próprio
-- irmão vinculado; escrita admin/tesoureiro.
-- =========================================
CREATE TABLE IF NOT EXISTS lancamentos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  data DATE NOT NULL DEFAULT (CURRENT_DATE),
  data_vencimento DATE,
  data_pagamento DATE,
  descricao VARCHAR(500) NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  tipo ENUM('entrada', 'saida', 'transferencia') NOT NULL,
  conta_id CHAR(36),
  conta_destino_id CHAR(36),
  plano_conta_id CHAR(36),
  irmao_id CHAR(36),
  terceiro_id CHAR(36),
  forma_pagamento VARCHAR(50),
  pago BOOLEAN NOT NULL DEFAULT TRUE,
  is_mensalidade BOOLEAN NOT NULL DEFAULT FALSE,
  competencia_mes DATE,
  categoria_recebimento ENUM('mensalidade', 'taxa_grau', 'tronco', 'doacao', 'outros'),
  recorrente_id CHAR(36),
  recibo_id CHAR(36),
  parcelamento_id CHAR(36),
  parcelado BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  criado_por CHAR(36),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_lancamentos_valor CHECK (valor >= 0),
  CONSTRAINT fk_lancamentos_conta FOREIGN KEY (conta_id) REFERENCES contas_financeiras(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lancamentos_conta_destino FOREIGN KEY (conta_destino_id) REFERENCES contas_financeiras(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lancamentos_plano_conta FOREIGN KEY (plano_conta_id) REFERENCES plano_contas(id) ON DELETE SET NULL,
  CONSTRAINT fk_lancamentos_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE SET NULL,
  CONSTRAINT fk_lancamentos_terceiro FOREIGN KEY (terceiro_id) REFERENCES terceiros(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_lancamentos_data ON lancamentos (data);
CREATE INDEX idx_lancamentos_data_vencimento ON lancamentos (data_vencimento);
CREATE INDEX idx_lancamentos_irmao ON lancamentos (irmao_id);
CREATE INDEX idx_lancamentos_mensalidade ON lancamentos (is_mensalidade, competencia_mes);
CREATE INDEX idx_lancamentos_terceiro ON lancamentos (terceiro_id);
CREATE INDEX idx_lancamentos_recibo ON lancamentos (recibo_id);
CREATE INDEX idx_lancamentos_categoria ON lancamentos (categoria_recebimento);
-- Equivalente ao índice único parcial do Postgres — aqui plain UNIQUE
-- basta: NULL nunca colide com NULL neste índice (testado localmente),
-- então linhas sem recorrente_id (a imensa maioria) nunca conflitam entre
-- si, exatamente como o WHERE parcial faria.
CREATE UNIQUE INDEX lancamentos_recorrente_competencia_uniq ON lancamentos (recorrente_id, competencia_mes);

-- =========================================
-- LANÇAMENTOS CONTÁBEIS (motor de partida dobrada)
-- RLS original: SELECT admin/tesoureiro/secretario. Sem policy de escrita
-- — só a procedure registrar_lancamento_contabil grava aqui.
-- =========================================
CREATE TABLE IF NOT EXISTS lancamentos_contabeis (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  data DATE NOT NULL DEFAULT (CURRENT_DATE),
  competencia DATE NOT NULL,
  descricao VARCHAR(500) NOT NULL,
  origem_tipo VARCHAR(50),
  origem_id CHAR(36),
  criado_por CHAR(36),
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX idx_lancamentos_contabeis_data ON lancamentos_contabeis (data);
CREATE INDEX idx_lancamentos_contabeis_competencia ON lancamentos_contabeis (competencia);
CREATE INDEX idx_lancamentos_contabeis_origem ON lancamentos_contabeis (origem_tipo, origem_id);

CREATE TABLE IF NOT EXISTS lancamentos_contabeis_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  lancamento_id CHAR(36) NOT NULL,
  conta_id CHAR(36) NOT NULL,
  tipo ENUM('debito', 'credito') NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  descricao VARCHAR(500),
  CONSTRAINT chk_lancamentos_contabeis_itens_valor CHECK (valor > 0),
  CONSTRAINT fk_lci_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos_contabeis(id) ON DELETE CASCADE,
  CONSTRAINT fk_lci_conta FOREIGN KEY (conta_id) REFERENCES plano_contas(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_lci_lancamento ON lancamentos_contabeis_itens (lancamento_id);
CREATE INDEX idx_lci_conta ON lancamentos_contabeis_itens (conta_id);

-- Agora que as FKs cruzadas existem, liga as colunas de lancamentos que
-- referenciam tabelas criadas depois dela nesta mesma migration.
ALTER TABLE lancamentos
  ADD CONSTRAINT fk_lancamentos_recibo FOREIGN KEY (recibo_id) REFERENCES lancamentos(id) ON DELETE SET NULL;
-- (nota: recibo_id referenciará a tabela `recibos`, criada mais abaixo —
-- ver ALTER TABLE lancamentos ADD CONSTRAINT fk_lancamentos_recibo_real
-- logo após a criação de `recibos`. A linha acima é só um placeholder
-- inválido — removida a seguir; ver nota na seção RECIBOS.)
ALTER TABLE lancamentos DROP FOREIGN KEY fk_lancamentos_recibo;

-- =========================================
-- RPC: registrar_lancamento_contabil — único caminho de escrita em
-- lancamentos_contabeis/itens. Equivalente às versões Postgres das issues
-- #1 e #8 combinadas (contexto de sistema para jobs agendados).
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

  IF @current_usuario_id IS NOT NULL AND NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão para registrar lançamento contábil';
  END IF;

  SET v_n = JSON_LENGTH(p_itens);
  IF v_n IS NULL OR v_n < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Um lançamento contábil precisa de ao menos uma linha de débito e uma de crédito';
  END IF;

  -- Validação prévia: soma débito = soma crédito, e cada conta existe e é
  -- analítica — tudo ANTES de inserir qualquer linha (ver nota no topo do
  -- arquivo sobre a troca da constraint adiável do Postgres).
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
END$$
DELIMITER ;

-- =========================================
-- Views de apoio (equivalentes às do Postgres).
-- =========================================
CREATE OR REPLACE VIEW v_saldo_plano_contas AS
SELECT
  c.id, c.codigo, c.nome, c.tipo,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS total_debito,
  COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS total_credito,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS saldo_devedor
FROM plano_contas c
LEFT JOIN lancamentos_contabeis_itens i ON i.conta_id = c.id
WHERE c.analitica
GROUP BY c.id, c.codigo, c.nome, c.tipo;

CREATE OR REPLACE VIEW v_auditoria_contabil_desbalanceados AS
SELECT
  l.id AS lancamento_id, l.data, l.descricao, l.origem_tipo, l.origem_id,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) AS total_debito,
  COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS total_credito,
  COALESCE(SUM(CASE WHEN i.tipo = 'debito' THEN i.valor ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN i.tipo = 'credito' THEN i.valor ELSE 0 END), 0) AS diferenca
FROM lancamentos_contabeis l
JOIN lancamentos_contabeis_itens i ON i.lancamento_id = l.id
GROUP BY l.id, l.data, l.descricao, l.origem_tipo, l.origem_id
HAVING total_debito <> total_credito;

CREATE OR REPLACE VIEW v_saldo_contas AS
SELECT
  c.id, c.nome, c.tipo, c.saldo_inicial,
  c.saldo_inicial
    + COALESCE((SELECT SUM(valor) FROM lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'entrada' AND l.pago), 0)
    - COALESCE((SELECT SUM(valor) FROM lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'saida' AND l.pago), 0)
    - COALESCE((SELECT SUM(valor) FROM lancamentos l WHERE l.conta_id = c.id AND l.tipo = 'transferencia' AND l.pago), 0)
    + COALESCE((SELECT SUM(valor) FROM lancamentos l WHERE l.conta_destino_id = c.id AND l.tipo = 'transferencia' AND l.pago), 0)
  AS saldo_atual
FROM contas_financeiras c;

-- =========================================
-- CONTAS A PAGAR (issue #7)
-- =========================================
DROP PROCEDURE IF EXISTS criar_conta_pagar;
DELIMITER $$
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

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;

  SELECT id INTO v_conta_pagar_id FROM plano_contas WHERE codigo = '2.1.01';
  IF v_conta_pagar_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Contas a Pagar" (2.1.01) não encontrada';
  END IF;

  SET v_competencia = COALESCE(p_competencia_mes, mes_competencia(p_data));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
    terceiro_id, pago, competencia_mes, observacoes, criado_por
  ) VALUES (
    p_lancamento_id, p_data, p_data_vencimento, p_descricao, p_valor, 'saida', p_plano_conta_id,
    p_terceiro_id, FALSE, v_competencia, p_observacoes, @current_usuario_id
  );

  CALL registrar_lancamento_contabil(
    p_data, v_competencia, CONCAT('Provisão: ', p_descricao),
    JSON_ARRAY(
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'debito', 'valor', p_valor),
      JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'credito', 'valor', p_valor)
    ),
    'conta_pagar_provisao', NULL, @lanc_contabil_id
  );
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS baixar_conta_pagar;
DELIMITER $$
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
  DECLARE v_conta_pagar_id CHAR(36);
  DECLARE v_plano_conta_banco CHAR(36);

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT valor, descricao, pago INTO v_valor, v_descricao, v_pago
  FROM lancamentos WHERE id = p_lancamento_id AND tipo = 'saida';
  IF v_valor IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta a pagar não encontrada';
  END IF;
  IF v_pago THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta conta a pagar já foi baixada';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
  END IF;

  SELECT id INTO v_conta_pagar_id FROM plano_contas WHERE codigo = '2.1.01';

  UPDATE lancamentos
  SET pago = TRUE, data_pagamento = p_data_pagamento, conta_id = p_conta_financeira_id, forma_pagamento = p_forma_pagamento
  WHERE id = p_lancamento_id;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento), CONCAT('Baixa: ', v_descricao),
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'debito', 'valor', v_valor),
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', v_valor)
    ),
    'conta_pagar_baixa', p_lancamento_id, @lanc_contabil_id
  );
END$$
DELIMITER ;

-- =========================================
-- DESPESAS RECORRENTES (issue #8)
-- =========================================
CREATE TABLE IF NOT EXISTS despesas_recorrentes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  descricao VARCHAR(500) NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  dia_vencimento INT NOT NULL,
  plano_conta_id CHAR(36) NOT NULL,
  terceiro_id CHAR(36),
  data_inicio DATE NOT NULL DEFAULT (CURRENT_DATE),
  data_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_despesas_recorrentes_valor CHECK (valor > 0),
  CONSTRAINT chk_despesas_recorrentes_dia CHECK (dia_vencimento BETWEEN 1 AND 28),
  CONSTRAINT chk_despesas_recorrentes_datas CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CONSTRAINT fk_despesas_recorrentes_plano FOREIGN KEY (plano_conta_id) REFERENCES plano_contas(id) ON DELETE RESTRICT,
  CONSTRAINT fk_despesas_recorrentes_terceiro FOREIGN KEY (terceiro_id) REFERENCES terceiros(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE lancamentos
  ADD CONSTRAINT fk_lancamentos_recorrente FOREIGN KEY (recorrente_id) REFERENCES despesas_recorrentes(id) ON DELETE SET NULL;

DROP PROCEDURE IF EXISTS efetivar_recorrentes_vencidas;
DELIMITER $$
CREATE PROCEDURE efetivar_recorrentes_vencidas(OUT p_total INT)
BEGIN
  DECLARE v_done INT DEFAULT FALSE;
  DECLARE v_id CHAR(36);
  DECLARE v_descricao VARCHAR(500);
  DECLARE v_valor DECIMAL(14,2);
  DECLARE v_plano_conta_id CHAR(36);
  DECLARE v_terceiro_id CHAR(36);
  DECLARE v_dia_vencimento INT;
  DECLARE v_observacoes TEXT;
  DECLARE v_competencia DATE;
  DECLARE v_venc DATE;
  DECLARE v_lanc_id CHAR(36);
  DECLARE v_conta_pagar_id CHAR(36);
  DECLARE cur CURSOR FOR
    SELECT id, descricao, valor, plano_conta_id, terceiro_id, dia_vencimento, observacoes
    FROM despesas_recorrentes
    WHERE ativo
      AND data_inicio <= CURRENT_DATE
      AND (data_fim IS NULL OR data_fim >= CURRENT_DATE)
      AND DAYOFMONTH(CURRENT_DATE) >= dia_vencimento;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  IF @current_usuario_id IS NOT NULL AND NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT id INTO v_conta_pagar_id FROM plano_contas WHERE codigo = '2.1.01';
  IF v_conta_pagar_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Contas a Pagar" (2.1.01) não encontrada';
  END IF;

  SET v_competencia = mes_competencia(CURRENT_DATE);
  SET p_total = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id, v_descricao, v_valor, v_plano_conta_id, v_terceiro_id, v_dia_vencimento, v_observacoes;
    IF v_done THEN LEAVE read_loop; END IF;

    IF NOT EXISTS (SELECT 1 FROM lancamentos WHERE recorrente_id = v_id AND competencia_mes = v_competencia) THEN
      SET v_venc = DATE_ADD(v_competencia, INTERVAL (v_dia_vencimento - 1) DAY);
      SET v_lanc_id = UUID();

      INSERT INTO lancamentos (
        id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
        terceiro_id, recorrente_id, pago, competencia_mes, observacoes
      ) VALUES (
        v_lanc_id, CURRENT_DATE, v_venc, v_descricao, v_valor, 'saida', v_plano_conta_id,
        v_terceiro_id, v_id, FALSE, v_competencia, v_observacoes
      );

      CALL registrar_lancamento_contabil(
        CURRENT_DATE, v_competencia, CONCAT('Provisão (recorrente): ', v_descricao),
        JSON_ARRAY(
          JSON_OBJECT('conta_id', v_plano_conta_id, 'tipo', 'debito', 'valor', v_valor),
          JSON_OBJECT('conta_id', v_conta_pagar_id, 'tipo', 'credito', 'valor', v_valor)
        ),
        'conta_pagar_provisao', v_lanc_id, @lanc_contabil_id
      );

      SET p_total = p_total + 1;
    END IF;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

-- =========================================
-- PARÂMETROS FINANCEIROS (singleton) e cálculo de multa/juros (issue #10)
-- =========================================
CREATE TABLE IF NOT EXISTS parametros_financeiros (
  id TINYINT NOT NULL DEFAULT 1 PRIMARY KEY,
  multa_ativa BOOLEAN NOT NULL DEFAULT TRUE,
  multa_percentual DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  juros_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  juros_diario_percentual DECIMAL(6,4) NOT NULL DEFAULT 0.0330,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_parametros_financeiros_singleton CHECK (id = 1)
) ENGINE=InnoDB;
INSERT IGNORE INTO parametros_financeiros (id) VALUES (1);

-- MySQL não tem RETURNS TABLE — vira procedure com parâmetros OUT.
DROP PROCEDURE IF EXISTS calcular_multa_juros;
DELIMITER $$
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
  DECLARE v_multa_ativa BOOLEAN;
  DECLARE v_multa_percentual DECIMAL(5,2);
  DECLARE v_juros_ativo BOOLEAN;
  DECLARE v_juros_diario_percentual DECIMAL(6,4);

  SELECT multa_ativa, multa_percentual, juros_ativo, juros_diario_percentual
  INTO v_multa_ativa, v_multa_percentual, v_juros_ativo, v_juros_diario_percentual
  FROM parametros_financeiros WHERE id = 1;

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
DELIMITER ;

-- =========================================
-- RECIBOS (baixa de faturas — issue #10)
-- RLS original: SELECT admin/tesoureiro/secretario (tudo) ou o próprio
-- irmão vinculado. Sem policy de escrita: só a procedure baixar_faturas.
-- =========================================
CREATE TABLE IF NOT EXISTS recibos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  data DATE NOT NULL DEFAULT (CURRENT_DATE),
  valor_original DECIMAL(14,2) NOT NULL,
  valor_multa DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_juros DECIMAL(14,2) NOT NULL DEFAULT 0,
  desconto DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_total DECIMAL(14,2) NOT NULL,
  forma_pagamento VARCHAR(50),
  conta_financeira_id CHAR(36),
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por CHAR(36),
  CONSTRAINT fk_recibos_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE RESTRICT,
  CONSTRAINT fk_recibos_conta FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_recibos_irmao ON recibos (irmao_id);

ALTER TABLE lancamentos
  ADD CONSTRAINT fk_lancamentos_recibo FOREIGN KEY (recibo_id) REFERENCES recibos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS recibo_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  recibo_id CHAR(36) NOT NULL,
  lancamento_id CHAR(36) NOT NULL,
  valor_original DECIMAL(14,2) NOT NULL,
  valor_multa DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_juros DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_recibo_itens_recibo FOREIGN KEY (recibo_id) REFERENCES recibos(id) ON DELETE CASCADE,
  CONSTRAINT fk_recibo_itens_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_recibo_itens_recibo ON recibo_itens (recibo_id);

-- =========================================
-- RPC: baixa agrupada de faturas (issue #10). p_lancamento_ids: JSON array
-- de strings (UUIDs) — equivalente ao UUID[] do Postgres.
-- =========================================
DROP PROCEDURE IF EXISTS baixar_faturas;
DELIMITER $$
CREATE PROCEDURE baixar_faturas(
  IN p_lancamento_ids JSON,
  IN p_conta_financeira_id CHAR(36),
  IN p_forma_pagamento VARCHAR(50),
  IN p_data_pagamento DATE,
  IN p_desconto DECIMAL(14,2),
  IN p_observacoes TEXT,
  OUT p_recibo_id CHAR(36)
)
BEGIN
  DECLARE v_irmao_id CHAR(36);
  DECLARE v_n_irmaos INT;
  DECLARE v_plano_conta_banco CHAR(36);
  DECLARE v_receber_id CHAR(36);
  DECLARE v_multas_juros_id CHAR(36);
  DECLARE v_soma_original DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_multa DECIMAL(14,2) DEFAULT 0;
  DECLARE v_soma_juros DECIMAL(14,2) DEFAULT 0;
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
  DECLARE cur CURSOR FOR SELECT id, valor, data_vencimento FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_lancamento_ids IS NULL OR JSON_LENGTH(p_lancamento_ids) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos uma fatura';
  END IF;

  SELECT COUNT(DISTINCT irmao_id) INTO v_n_irmaos FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO v_irmao_id FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) LIMIT 1;

  IF EXISTS (SELECT 1 FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND (tipo <> 'entrada' OR pago)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura selecionada já está paga ou não é uma fatura em aberto';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
  END IF;

  SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';
  SELECT id INTO v_multas_juros_id FROM plano_contas WHERE codigo = '4.1.06';

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

  SET v_total = v_soma_original + v_soma_multa + v_soma_juros - COALESCE(p_desconto, 0);
  IF v_total < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Desconto maior que o valor total da baixa';
  END IF;

  SET p_recibo_id = UUID();
  INSERT INTO recibos (
    id, irmao_id, data, valor_original, valor_multa, valor_juros, desconto,
    valor_total, forma_pagamento, conta_financeira_id, observacoes, criado_por
  ) VALUES (
    p_recibo_id, v_irmao_id, p_data_pagamento, v_soma_original, v_soma_multa, v_soma_juros, COALESCE(p_desconto, 0),
    v_total, p_forma_pagamento, p_conta_financeira_id, p_observacoes, @current_usuario_id
  );

  SET v_done = FALSE;
  OPEN cur;
  itens_loop: LOOP
    FETCH cur INTO v_id, v_valor, v_vencimento;
    IF v_done THEN LEAVE itens_loop; END IF;
    CALL calcular_multa_juros(v_valor, v_vencimento, p_data_pagamento, v_multa, v_juros, v_dias, v_calc_total);

    INSERT INTO recibo_itens (recibo_id, lancamento_id, valor_original, valor_multa, valor_juros)
    VALUES (p_recibo_id, v_id, v_valor, v_multa, v_juros);

    UPDATE lancamentos
    SET pago = TRUE, data_pagamento = p_data_pagamento, conta_id = p_conta_financeira_id,
        forma_pagamento = p_forma_pagamento, recibo_id = p_recibo_id
    WHERE id = v_id;
  END LOOP;
  CLOSE cur;

  SET v_itens = JSON_ARRAY(JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', v_total));
  IF COALESCE(p_desconto, 0) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', (SELECT id FROM plano_contas WHERE codigo = '5.1.06'), 'tipo', 'debito', 'valor', p_desconto));
  END IF;
  SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', v_soma_original));
  IF (v_soma_multa + v_soma_juros) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_multas_juros_id, 'tipo', 'credito', 'valor', v_soma_multa + v_soma_juros));
  END IF;

  CALL registrar_lancamento_contabil(
    p_data_pagamento, mes_competencia(p_data_pagamento),
    'Recibo (baixa de fatura)', v_itens, 'recibo_baixa', p_recibo_id, @lanc_contabil_id
  );
END$$
DELIMITER ;

-- =========================================
-- PARCELAMENTOS (issue #11)
-- RLS original: SELECT admin/tesoureiro/secretario (tudo) ou o próprio
-- irmão. Sem policy de escrita: só a procedure criar_parcelamento.
-- =========================================
CREATE TABLE IF NOT EXISTS parcelamentos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  data DATE NOT NULL DEFAULT (CURRENT_DATE),
  valor_original DECIMAL(14,2) NOT NULL,
  valor_multa DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_juros DECIMAL(14,2) NOT NULL DEFAULT 0,
  entrada DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_parcelado DECIMAL(14,2) NOT NULL,
  numero_parcelas INT NOT NULL,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criado_por CHAR(36),
  CONSTRAINT chk_parcelamentos_numero CHECK (numero_parcelas > 0),
  CONSTRAINT fk_parcelamentos_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE INDEX idx_parcelamentos_irmao ON parcelamentos (irmao_id);

ALTER TABLE lancamentos
  ADD CONSTRAINT fk_lancamentos_parcelamento FOREIGN KEY (parcelamento_id) REFERENCES parcelamentos(id) ON DELETE SET NULL;

DROP PROCEDURE IF EXISTS criar_parcelamento;
DELIMITER $$
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
  DECLARE cur CURSOR FOR SELECT id, valor, data_vencimento FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_lancamento_ids IS NULL OR JSON_LENGTH(p_lancamento_ids) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Selecione ao menos uma fatura';
  END IF;
  IF p_numero_parcelas IS NULL OR p_numero_parcelas <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Número de parcelas deve ser maior que zero';
  END IF;

  SELECT COUNT(DISTINCT irmao_id) INTO v_n_irmaos FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));
  IF v_n_irmaos <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Todas as faturas selecionadas devem ser do mesmo irmão';
  END IF;
  SELECT irmao_id INTO v_irmao_id FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) LIMIT 1;

  IF EXISTS (SELECT 1 FROM lancamentos WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id)) AND (tipo <> 'entrada' OR pago)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Alguma fatura selecionada já está paga ou não é uma fatura em aberto';
  END IF;

  IF COALESCE(p_entrada, 0) > 0 THEN
    IF p_conta_financeira_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Informe a conta que recebeu a entrada';
    END IF;
    SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
    IF v_plano_conta_banco IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
    END IF;
  END IF;

  SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';
  SELECT id INTO v_multas_juros_id FROM plano_contas WHERE codigo = '4.1.06';

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
    valor_parcelado, numero_parcelas, observacoes, criado_por
  ) VALUES (
    p_parcelamento_id, v_irmao_id, p_data, v_soma_original, v_soma_multa, v_soma_juros, COALESCE(p_entrada, 0),
    v_valor_parcelado, p_numero_parcelas, p_observacoes, @current_usuario_id
  );

  UPDATE lancamentos
  SET pago = TRUE, parcelado = TRUE, parcelamento_id = p_parcelamento_id, data_pagamento = p_data
  WHERE JSON_CONTAINS(p_lancamento_ids, JSON_QUOTE(id));

  IF COALESCE(p_entrada, 0) > 0 THEN
    INSERT INTO lancamentos (
      data, data_vencimento, descricao, valor, tipo, irmao_id,
      pago, data_pagamento, conta_id, forma_pagamento, parcelamento_id, is_mensalidade
    ) VALUES (
      p_data, p_data, 'Entrada — acordo de parcelamento', p_entrada, 'entrada', v_irmao_id,
      TRUE, p_data, p_conta_financeira_id, 'entrada_parcelamento', p_parcelamento_id, FALSE
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
      pago, parcelamento_id, is_mensalidade
    ) VALUES (
      p_data, DATE_ADD(p_data, INTERVAL v_i MONTH), v_desc, v_valor_parcela, 'entrada', v_irmao_id,
      FALSE, p_parcelamento_id, FALSE
    );

    SET v_i = v_i + 1;
  END WHILE;

  SET v_itens = JSON_ARRAY(JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'debito', 'valor', v_valor_parcelado));
  IF COALESCE(p_entrada, 0) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', p_entrada));
  END IF;
  SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'credito', 'valor', v_soma_original));
  IF (v_soma_multa + v_soma_juros) > 0 THEN
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_multas_juros_id, 'tipo', 'credito', 'valor', v_soma_multa + v_soma_juros));
  END IF;

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data),
    'Parcelamento de faturas em atraso', v_itens, 'parcelamento', p_parcelamento_id, @lanc_contabil_id
  );
END$$
DELIMITER ;

-- =========================================
-- FATURAS/MENSALIDADES (issue #9) — helper interno + RPCs.
-- =========================================
DROP PROCEDURE IF EXISTS _postar_provisao_fatura;
DELIMITER $$
CREATE PROCEDURE _postar_provisao_fatura(
  IN p_lancamento_id CHAR(36),
  IN p_valor DECIMAL(14,2),
  IN p_data DATE,
  IN p_competencia DATE,
  IN p_descricao VARCHAR(500),
  IN p_rateio JSON
)
BEGIN
  DECLARE v_receber_id CHAR(36);
  DECLARE v_mensalidades_id CHAR(36);
  DECLARE v_itens JSON;
  DECLARE v_soma_pct DECIMAL(6,2) DEFAULT 0;
  DECLARE v_acumulado DECIMAL(14,2) DEFAULT 0;
  DECLARE v_valor_linha DECIMAL(14,2);
  DECLARE v_n INT;
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_conta_id CHAR(36);
  DECLARE v_percentual DECIMAL(6,2);

  SELECT id INTO v_receber_id FROM plano_contas WHERE codigo = '1.1.02';
  IF v_receber_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Contas a Receber" (1.1.02) não encontrada';
  END IF;
  SET v_itens = JSON_ARRAY(JSON_OBJECT('conta_id', v_receber_id, 'tipo', 'debito', 'valor', p_valor));

  IF p_rateio IS NOT NULL AND JSON_LENGTH(p_rateio) > 0 THEN
    SET v_n = JSON_LENGTH(p_rateio);
    WHILE v_i < v_n DO
      SET v_conta_id = JSON_UNQUOTE(JSON_EXTRACT(p_rateio, CONCAT('$[', v_i, '].conta_id')));
      SET v_percentual = JSON_EXTRACT(p_rateio, CONCAT('$[', v_i, '].percentual'));
      SET v_soma_pct = v_soma_pct + v_percentual;

      IF v_i = v_n - 1 THEN
        SET v_valor_linha = p_valor - v_acumulado;
      ELSE
        SET v_valor_linha = ROUND(p_valor * v_percentual / 100, 2);
        SET v_acumulado = v_acumulado + v_valor_linha;
      END IF;

      SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_conta_id, 'tipo', 'credito', 'valor', v_valor_linha));
      SET v_i = v_i + 1;
    END WHILE;
    IF ABS(v_soma_pct - 100) > 0.01 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Rateio deve somar 100%';
    END IF;
  ELSE
    SELECT id INTO v_mensalidades_id FROM plano_contas WHERE codigo = '4.1.01';
    SET v_itens = JSON_ARRAY_APPEND(v_itens, '$', JSON_OBJECT('conta_id', v_mensalidades_id, 'tipo', 'credito', 'valor', p_valor));
  END IF;

  CALL registrar_lancamento_contabil(p_data, p_competencia, p_descricao, v_itens, 'fatura_provisao', p_lancamento_id, @lanc_contabil_id);
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS criar_fatura_avulsa;
DELIMITER $$
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

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;

  SET v_comp = mes_competencia(p_competencia_mes);
  SET v_desc = COALESCE(p_descricao, CONCAT('Fatura ', DATE_FORMAT(p_competencia_mes, '%m/%Y')));
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_vencimento, descricao, valor, tipo, irmao_id, plano_conta_id,
    pago, is_mensalidade, competencia_mes, criado_por
  ) VALUES (
    p_lancamento_id, CURRENT_DATE, p_data_vencimento, v_desc, p_valor, 'entrada', p_irmao_id,
    (SELECT id FROM plano_contas WHERE codigo = '4.1.01'),
    FALSE, TRUE, v_comp, @current_usuario_id
  );

  CALL _postar_provisao_fatura(p_lancamento_id, p_valor, CURRENT_DATE, v_comp, v_desc, p_rateio);
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS gerar_mensalidades;
DELIMITER $$
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
  DECLARE v_lanc_id CHAR(36);
  DECLARE cur CURSOR FOR
    SELECT id, valor_mensalidade FROM irmaos
    WHERE situacao IN ('ativo', 'quite', 'irregular') AND valor_mensalidade > 0
      AND (p_irmao_id IS NULL OR id = p_irmao_id);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT id INTO v_plano FROM plano_contas WHERE codigo = '4.1.01';
  IF v_plano IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta "Mensalidades" (4.1.01) não encontrada';
  END IF;
  SET v_comp = mes_competencia(p_competencia);
  SET v_venc = COALESCE(p_data_vencimento, DATE_ADD(v_comp, INTERVAL 9 DAY));
  SET v_desc = CONCAT('Mensalidade ', DATE_FORMAT(p_competencia, '%m/%Y'));
  SET p_total = 0;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_id, v_valor_mensalidade;
    IF v_done THEN LEAVE read_loop; END IF;

    IF NOT EXISTS (SELECT 1 FROM lancamentos WHERE is_mensalidade AND irmao_id = v_id AND competencia_mes = v_comp) THEN
      SET v_lanc_id = UUID();
      INSERT INTO lancamentos (
        id, data, data_vencimento, descricao, valor, tipo, plano_conta_id,
        irmao_id, pago, is_mensalidade, competencia_mes, criado_por
      ) VALUES (
        v_lanc_id, CURRENT_DATE, v_venc, v_desc, v_valor_mensalidade, 'entrada', v_plano,
        v_id, FALSE, TRUE, v_comp, @current_usuario_id
      );

      CALL _postar_provisao_fatura(v_lanc_id, v_valor_mensalidade, CURRENT_DATE, v_comp, v_desc, p_rateio);

      SET p_total = p_total + 1;
    END IF;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

-- =========================================
-- RECEBIMENTOS UNIFICADOS E TRANSFERÊNCIAS (issue #12)
-- =========================================
DROP PROCEDURE IF EXISTS registrar_recebimento_avulso;
DELIMITER $$
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

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = p_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária/caixa selecionada não tem conta do plano de contas vinculada';
  END IF;

  -- equivalente a initcap(replace(categoria,'_',' ')) — conjunto fechado de
  -- categorias, não precisa de um algoritmo genérico de capitalização.
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
    id, data, data_pagamento, descricao, valor, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, forma_pagamento, observacoes, criado_por
  ) VALUES (
    p_lancamento_id, p_data, p_data, v_desc, p_valor, 'entrada', p_conta_financeira_id, p_plano_conta_id,
    p_irmao_id, p_terceiro_id, p_categoria, TRUE, p_forma_pagamento, p_observacoes, @current_usuario_id
  );

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data), v_desc,
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', p_valor),
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'credito', 'valor', p_valor)
    ),
    'recebimento_avulso', p_lancamento_id, @lanc_contabil_id
  );
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS criar_transferencia;
DELIMITER $$
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

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valor deve ser maior que zero';
  END IF;
  IF p_conta_origem_id = p_conta_destino_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Conta de origem e destino devem ser diferentes';
  END IF;

  SELECT plano_conta_id INTO v_plano_origem FROM contas_financeiras WHERE id = p_conta_origem_id;
  SELECT plano_conta_id INTO v_plano_destino FROM contas_financeiras WHERE id = p_conta_destino_id;
  IF v_plano_origem IS NULL OR v_plano_destino IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ambas as contas precisam ter conta do plano de contas vinculada';
  END IF;

  SET p_lancamento_id = UUID();
  INSERT INTO lancamentos (
    id, data, data_pagamento, descricao, valor, tipo, conta_id, conta_destino_id, pago, criado_por
  ) VALUES (
    p_lancamento_id, p_data, p_data, p_descricao, p_valor, 'transferencia', p_conta_origem_id, p_conta_destino_id, TRUE, @current_usuario_id
  );

  CALL registrar_lancamento_contabil(
    p_data, mes_competencia(p_data), p_descricao,
    JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_destino, 'tipo', 'debito', 'valor', p_valor),
      JSON_OBJECT('conta_id', v_plano_origem, 'tipo', 'credito', 'valor', p_valor)
    ),
    'transferencia', p_lancamento_id, @lanc_contabil_id
  );
END$$
DELIMITER ;

-- =========================================
-- IMPORTAÇÃO OFX E CONCILIAÇÃO BANCÁRIA (issue #13)
-- RLS original: SELECT admin/tesoureiro. Sem policy de escrita: a
-- importação em si roda na rota server-side (issue #54); a conciliação
-- roda pelas procedures abaixo.
-- =========================================
CREATE TABLE IF NOT EXISTS ofx_lancamentos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  conta_financeira_id CHAR(36) NOT NULL,
  fitid VARCHAR(255),
  data DATE NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  tipo_ofx VARCHAR(50),
  descricao VARCHAR(500),
  chave_dedupe VARCHAR(255) NOT NULL,
  conciliado BOOLEAN NOT NULL DEFAULT FALSE,
  lancamento_id CHAR(36),
  importado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  importado_por CHAR(36),
  UNIQUE KEY ofx_lancamentos_conta_chave_uniq (conta_financeira_id, chave_dedupe),
  CONSTRAINT fk_ofx_conta FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id) ON DELETE CASCADE,
  CONSTRAINT fk_ofx_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_ofx_conta_conciliado ON ofx_lancamentos (conta_financeira_id, conciliado);

DROP PROCEDURE IF EXISTS conciliar_ofx_existente;
DELIMITER $$
CREATE PROCEDURE conciliar_ofx_existente(IN p_ofx_id CHAR(36), IN p_lancamento_id CHAR(36))
BEGIN
  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ofx_lancamentos WHERE id = p_ofx_id AND NOT conciliado) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lancamentos WHERE id = p_lancamento_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lançamento não encontrado';
  END IF;

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id WHERE id = p_ofx_id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS criar_lancamento_de_ofx;
DELIMITER $$
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

  IF NOT (has_role(@current_usuario_id, 'admin') OR has_role(@current_usuario_id, 'tesoureiro')) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sem permissão';
  END IF;

  SELECT conta_financeira_id, data, valor, descricao INTO v_conta_financeira_id, v_data, v_valor, v_descricao_ofx
  FROM ofx_lancamentos WHERE id = p_ofx_id AND NOT conciliado;
  IF v_conta_financeira_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Linha OFX não encontrada ou já conciliada';
  END IF;

  SELECT plano_conta_id INTO v_plano_conta_banco FROM contas_financeiras WHERE id = v_conta_financeira_id;
  IF v_plano_conta_banco IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A conta bancária do extrato não tem conta do plano de contas vinculada';
  END IF;

  SET v_valor_abs = ABS(v_valor);
  SET v_tipo = CASE WHEN v_valor >= 0 THEN 'entrada' ELSE 'saida' END;
  SET v_desc = COALESCE(p_descricao, v_descricao_ofx, 'Lançamento importado do extrato');
  SET p_lancamento_id = UUID();

  INSERT INTO lancamentos (
    id, data, data_pagamento, descricao, valor, tipo, conta_id, plano_conta_id,
    irmao_id, terceiro_id, categoria_recebimento, pago, criado_por
  ) VALUES (
    p_lancamento_id, v_data, v_data, v_desc, v_valor_abs, v_tipo, v_conta_financeira_id, p_plano_conta_id,
    p_irmao_id, p_terceiro_id, CASE WHEN v_tipo = 'entrada' THEN p_categoria ELSE NULL END, TRUE, @current_usuario_id
  );

  IF v_tipo = 'entrada' THEN
    SET v_itens = JSON_ARRAY(
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'debito', 'valor', v_valor_abs),
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'credito', 'valor', v_valor_abs)
    );
  ELSE
    SET v_itens = JSON_ARRAY(
      JSON_OBJECT('conta_id', p_plano_conta_id, 'tipo', 'debito', 'valor', v_valor_abs),
      JSON_OBJECT('conta_id', v_plano_conta_banco, 'tipo', 'credito', 'valor', v_valor_abs)
    );
  END IF;

  CALL registrar_lancamento_contabil(v_data, mes_competencia(v_data), v_desc, v_itens, 'ofx_importado', p_lancamento_id, @lanc_contabil_id);

  UPDATE ofx_lancamentos SET conciliado = TRUE, lancamento_id = p_lancamento_id WHERE id = p_ofx_id;
END$$
DELIMITER ;
