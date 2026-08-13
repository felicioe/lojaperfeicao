-- Preserva os totais e o saldo bancario informados em cada arquivo OFX.
CREATE TABLE IF NOT EXISTS ofx_extratos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  conta_financeira_id CHAR(36) NOT NULL,
  data_inicial DATE NOT NULL,
  data_final DATE NOT NULL,
  saldo_inicial DECIMAL(14,2) NULL,
  saldo_final DECIMAL(14,2) NULL,
  total_entradas DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_saidas DECIMAL(14,2) NOT NULL DEFAULT 0,
  quantidade_lancamentos INT NOT NULL DEFAULT 0,
  importado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  importado_por CHAR(36) NULL,
  CONSTRAINT fk_ofx_extratos_conta
    FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_ofx_extratos_conta_importacao
  ON ofx_extratos (conta_financeira_id, importado_em);
