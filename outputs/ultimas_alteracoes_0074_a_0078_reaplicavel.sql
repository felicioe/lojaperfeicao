-- ============================================================================
-- PACOTE CONSOLIDADO E REAPLICAVEL - MIGRACOES 0074 A 0078
-- Data: 13/08/2026
-- Banco: MySQL 8 / MariaDB compativel com ADD COLUMN IF NOT EXISTS
--
-- Inclui:
--   1) PIX copia e cola e imagem do QR Code;
--   2) saldo inicial e anonimato do Tronco de Beneficencia;
--   3) valores oficiais SGCAB 2026 por grau;
--   4) faturas gerenciais SGCAB e seus itens;
--   5) catalogo SGCAB separado da Tabela de Valores da Loja.
--
-- Pode ser executado novamente. Nao exclui faturas gerenciais existentes.
-- ============================================================================

SET NAMES utf8mb4;
USE `u630316951_ado`;

-- 0074 - PIX -----------------------------------------------------------------
ALTER TABLE contas_financeiras_pix
  ADD COLUMN IF NOT EXISTS pix_copia_cola TEXT NULL AFTER chave,
  ADD COLUMN IF NOT EXISTS qr_code_url VARCHAR(500) NULL AFTER pix_copia_cola;

-- 0075 - TRONCO DE BENEFICENCIA ---------------------------------------------
CREATE TABLE IF NOT EXISTS tronco_beneficencia_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  saldo_inicial DECIMAL(14,2) NOT NULL DEFAULT 0,
  atualizado_por CHAR(36) NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_tronco_config_unico CHECK (id = 1),
  CONSTRAINT fk_tronco_config_usuario
    FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO tronco_beneficencia_config (id, saldo_inicial)
VALUES (1, 0);

SET @historico_tronco = 'Recebimento Pix - Irmão do quadro ou visitante - nome omitido para confidencialidade do tronco';

UPDATE lancamentos
SET descricao = @historico_tronco,
    forma_pagamento = 'PIX',
    irmao_id = NULL
WHERE categoria_recebimento = 'tronco'
  AND tipo = 'entrada';

UPDATE lancamentos_contabeis lc
JOIN lancamentos l ON l.id = lc.origem_id
SET lc.descricao = @historico_tronco
WHERE l.categoria_recebimento = 'tronco'
  AND l.tipo = 'entrada';

UPDATE lancamentos_contabeis_itens lci
JOIN lancamentos_contabeis lc ON lc.id = lci.lancamento_id
JOIN lancamentos l ON l.id = lc.origem_id
SET lci.descricao = @historico_tronco
WHERE l.categoria_recebimento = 'tronco'
  AND l.tipo = 'entrada';

DROP TRIGGER IF EXISTS trg_tronco_anonimo_insert;
DELIMITER $$
CREATE TRIGGER trg_tronco_anonimo_insert
BEFORE INSERT ON lancamentos
FOR EACH ROW
BEGIN
  IF NEW.categoria_recebimento = 'tronco' AND NEW.tipo = 'entrada' THEN
    SET NEW.descricao = 'Recebimento Pix - Irmão do quadro ou visitante - nome omitido para confidencialidade do tronco';
    SET NEW.forma_pagamento = 'PIX';
    SET NEW.irmao_id = NULL;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_tronco_anonimo_update;
DELIMITER $$
CREATE TRIGGER trg_tronco_anonimo_update
BEFORE UPDATE ON lancamentos
FOR EACH ROW
BEGIN
  IF NEW.categoria_recebimento = 'tronco' AND NEW.tipo = 'entrada' THEN
    SET NEW.descricao = 'Recebimento Pix - Irmão do quadro ou visitante - nome omitido para confidencialidade do tronco';
    SET NEW.forma_pagamento = 'PIX';
    SET NEW.irmao_id = NULL;
  END IF;
END$$
DELIMITER ;

-- 0076 - TAXAS OFICIAIS SGCAB 2026 POR GRAU -------------------------------
INSERT INTO taxas_grau
  (org_id, ano, grau, sgcab, ritual, diploma, taxa_propria, ativo)
SELECT
  o.id, 2026, oficial.grau, oficial.valor_iniciacao,
  35.00, 35.00, 0.00, TRUE
FROM orgs o
JOIN (
  SELECT 4 AS grau, 135.00 AS valor_iniciacao
  UNION ALL SELECT 5, 135.00
  UNION ALL SELECT 6, 135.00
  UNION ALL SELECT 7, 135.00
  UNION ALL SELECT 8, 160.00
  UNION ALL SELECT 9, 160.00
  UNION ALL SELECT 10, 160.00
  UNION ALL SELECT 11, 160.00
  UNION ALL SELECT 12, 275.00
  UNION ALL SELECT 13, 410.00
) oficial ON oficial.grau BETWEEN o.grau_min AND o.grau_max
WHERE o.ativo = TRUE
  AND LOWER(COALESCE(o.rito, '')) LIKE '%adonhiram%'
ON DUPLICATE KEY UPDATE
  sgcab = VALUES(sgcab),
  ritual = VALUES(ritual),
  diploma = VALUES(diploma),
  ativo = TRUE;

-- 0077 - FATURAS GERENCIAIS SGCAB ------------------------------------------
CREATE TABLE IF NOT EXISTS sgcab_faturas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  ano INT NOT NULL,
  grau INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  data_sessao DATETIME NULL,
  vencimento DATE NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
  data_pagamento DATE NULL,
  comprovante_url VARCHAR(500) NULL,
  observacoes TEXT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sgcab_faturas_irmao
    FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE,
  CONSTRAINT fk_sgcab_faturas_org
    FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT chk_sgcab_faturas_total CHECK (total >= 0),
  CONSTRAINT chk_sgcab_faturas_grau CHECK (grau > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sgcab_fatura_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  fatura_id CHAR(36) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sgcab_fatura_itens_fatura
    FOREIGN KEY (fatura_id) REFERENCES sgcab_faturas(id) ON DELETE CASCADE,
  CONSTRAINT chk_sgcab_fatura_item_valor CHECK (valor >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indices criados apenas quando ainda nao existem.
SET @sql_idx_faturas = IF(
  EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sgcab_faturas'
      AND index_name = 'idx_sgcab_faturas_filtros'
  ),
  'SELECT 1',
  'CREATE INDEX idx_sgcab_faturas_filtros ON sgcab_faturas (ano, status, org_id, irmao_id)'
);
PREPARE stmt_idx_faturas FROM @sql_idx_faturas;
EXECUTE stmt_idx_faturas;
DEALLOCATE PREPARE stmt_idx_faturas;

SET @sql_idx_itens = IF(
  EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sgcab_fatura_itens'
      AND index_name = 'idx_sgcab_fatura_itens_fatura'
  ),
  'SELECT 1',
  'CREATE INDEX idx_sgcab_fatura_itens_fatura ON sgcab_fatura_itens (fatura_id, ordem)'
);
PREPARE stmt_idx_itens FROM @sql_idx_itens;
EXECUTE stmt_idx_itens;
DEALLOCATE PREPARE stmt_idx_itens;

-- 0078 - CATALOGO SGCAB SEPARADO DA LOJA ----------------------------------
CREATE TABLE IF NOT EXISTS sgcab_valores_catalogo (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  ano INT NOT NULL,
  valor DECIMAL(12,2) NOT NULL,
  vigencia_inicio DATE NOT NULL,
  descricao TEXT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY sgcab_catalogo_tipo_ano_uniq (tipo, ano)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Primeiro preserva qualquer item SGCAB que ainda esteja na tabela da Loja.
INSERT INTO sgcab_valores_catalogo
  (tipo, ano, valor, vigencia_inicio, descricao)
SELECT
  tv.tipo,
  YEAR(tv.vigencia_inicio),
  tv.valor,
  tv.vigencia_inicio,
  tv.observacoes
FROM tabela_valores tv
WHERE tv.tipo LIKE 'sgcab\_%' ESCAPE '\\'
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  vigencia_inicio = VALUES(vigencia_inicio),
  descricao = VALUES(descricao);

-- Reforca diretamente no catalogo os 15 itens oficiais do ATO 001/2026.
INSERT INTO sgcab_valores_catalogo
  (tipo, ano, valor, vigencia_inicio, descricao)
SELECT oficial.tipo, 2026, oficial.valor, '2026-01-02', oficial.descricao
FROM (
  SELECT 'sgcab_anuidade_jan_jun_2026' AS tipo, 210.00 AS valor,
         'Anuidade SGCAB 2026 - graus 4 a 13 - janeiro a junho. ATO Nº 001/2026.' AS descricao
  UNION ALL SELECT 'sgcab_anuidade_jul_set_2026', 160.00,
         'Anuidade SGCAB 2026 - graus 4 a 13 - julho a setembro. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_anuidade_out_dez_2026', 110.00,
         'Anuidade SGCAB 2026 - graus 4 a 13 - outubro a dezembro. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_carta_constitutiva_2026', 135.00,
         'Carta constitutiva. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_filiacao_equivalencia_taxa_2026', 120.00,
         'Taxa-base de filiação/equivalência; somar a anuidade do período. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_regularizacao_taxa_2026', 160.00,
         'Taxa-base de regularização; somar a anuidade atual. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_regularizacao_anuidade_2026', 210.00,
         'Anuidade indicada na linha de regularização. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_ritual_2026', 35.00,
         'Ritual. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_compendio_filosofico_2026', 40.00,
         'Compêndio Filosófico. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_diploma_2026', 35.00,
         'Diploma. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_painel_grau_2026', 60.00,
         'Painel do grau. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_historia_rito_adonhiramita_2026', 40.00,
         'História do Rito Adonhiramita. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_bandeira_2026', 300.00,
         'Bandeira do SGCAB. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_boton_2026', 30.00,
         'Boton do SGCAB. ATO Nº 001/2026.'
  UNION ALL SELECT 'sgcab_boton_grau_13_2026', 30.00,
         'Boton do grau 13. ATO Nº 001/2026.'
) oficial
ON DUPLICATE KEY UPDATE
  valor = VALUES(valor),
  vigencia_inicio = VALUES(vigencia_inicio),
  descricao = VALUES(descricao);

-- Somente depois da preservacao, remove da Tabela de Valores da Loja.
DELETE FROM tabela_valores
WHERE tipo LIKE 'sgcab\_%' ESCAPE '\\';

-- CONFERENCIA FINAL ----------------------------------------------------------
-- Consultas independentes: evita que o MySQL mantenha information_schema
-- como banco de resolucao das tabelas depois do primeiro SELECT.
SELECT 'pix_colunas' AS verificacao, COUNT(*) AS quantidade
FROM information_schema.columns
WHERE table_schema = 'u630316951_ado'
  AND table_name = 'contas_financeiras_pix'
  AND column_name IN ('pix_copia_cola', 'qr_code_url');

SELECT 'config_tronco' AS verificacao, COUNT(*) AS quantidade
FROM tronco_beneficencia_config;

SELECT 'faturas_sgcab' AS verificacao, COUNT(*) AS quantidade
FROM sgcab_faturas;

SELECT 'itens_catalogo_sgcab_2026' AS verificacao, COUNT(*) AS quantidade
FROM sgcab_valores_catalogo
WHERE ano = 2026;

SELECT 'sgcab_ainda_na_tabela_da_loja' AS verificacao, COUNT(*) AS quantidade
FROM tabela_valores
WHERE tipo LIKE 'sgcab\_%' ESCAPE '\\';

-- Resultado esperado da ultima linha: 0.
