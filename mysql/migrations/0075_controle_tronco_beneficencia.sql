-- Saldo inicial meramente gerencial do Tronco de Beneficência.
CREATE TABLE IF NOT EXISTS tronco_beneficencia_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  saldo_inicial DECIMAL(14,2) NOT NULL DEFAULT 0,
  atualizado_por CHAR(36) NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_tronco_config_unico CHECK (id = 1),
  CONSTRAINT fk_tronco_config_usuario FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO tronco_beneficencia_config (id, saldo_inicial) VALUES (1, 0);

-- O Tronco é confidencial: anonimiza inclusive o histórico já existente.
SET @historico_tronco = 'Recebimento Pix - Irmão do quadro ou visitante - nome omitido para confidencialidade do tronco';

UPDATE lancamentos
SET descricao = @historico_tronco,
    forma_pagamento = 'PIX',
    irmao_id = NULL
WHERE categoria_recebimento = 'tronco' AND tipo = 'entrada';

UPDATE lancamentos_contabeis lc
JOIN lancamentos l ON l.id = lc.origem_id
SET lc.descricao = @historico_tronco
WHERE l.categoria_recebimento = 'tronco' AND l.tipo = 'entrada';

UPDATE lancamentos_contabeis_itens lci
JOIN lancamentos_contabeis lc ON lc.id = lci.lancamento_id
JOIN lancamentos l ON l.id = lc.origem_id
SET lci.descricao = @historico_tronco
WHERE l.categoria_recebimento = 'tronco' AND l.tipo = 'entrada';

-- Impede que importações ou conciliações futuras revelem o ofertante.
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
