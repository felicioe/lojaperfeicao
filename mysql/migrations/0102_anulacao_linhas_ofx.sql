-- Vincula duas linhas OFX de mesmo valor e sinais opostos sem criar
-- lançamento financeiro ou contábil. As linhas permanecem no extrato.
CREATE TABLE IF NOT EXISTS ofx_anulacoes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  conta_financeira_id CHAR(36) NOT NULL,
  ofx_credito_id CHAR(36) NOT NULL,
  ofx_debito_id CHAR(36) NOT NULL,
  historico VARCHAR(255) NOT NULL DEFAULT 'Lançamento indevido',
  criado_por CHAR(36) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ofx_anulacoes_credito (loja_id, ofx_credito_id),
  UNIQUE KEY uq_ofx_anulacoes_debito (loja_id, ofx_debito_id),
  KEY idx_ofx_anulacoes_conta (loja_id, conta_financeira_id),
  CONSTRAINT fk_ofx_anulacoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_ofx_anulacoes_conta FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id),
  CONSTRAINT fk_ofx_anulacoes_credito FOREIGN KEY (ofx_credito_id) REFERENCES ofx_lancamentos(id),
  CONSTRAINT fk_ofx_anulacoes_debito FOREIGN KEY (ofx_debito_id) REFERENCES ofx_lancamentos(id),
  CONSTRAINT fk_ofx_anulacoes_usuario FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;
