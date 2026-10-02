-- issue #720 — Conciliação Bancária hoje só confere saldo contra extrato
-- OFX; várias contas (aplicações/RDC, Conta Capital na Sicoob) só têm PDF
-- disponível, sem opção de exportar OFX. Esta tabela guarda o histórico de
-- cada conferência de saldo feita a partir de um PDF: o saldo que o PDF
-- informa, o saldo que o sistema calculava pra mesma data e a diferença
-- entre os dois, pra o usuário acompanhar ao longo do tempo sem precisar
-- reabrir o PDF original.
CREATE TABLE IF NOT EXISTS conferencias_saldo_pdf (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  conta_financeira_id CHAR(36) NOT NULL,
  data_referencia DATE NOT NULL,
  saldo_pdf DECIMAL(14,2) NOT NULL,
  saldo_sistema DECIMAL(14,2) NULL,
  diferenca DECIMAL(14,2) NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  criado_por CHAR(36) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_conferencias_saldo_pdf_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_conferencias_saldo_pdf_conta
    FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_conferencias_saldo_pdf_conta
  ON conferencias_saldo_pdf (loja_id, conta_financeira_id, criado_em);
