-- ================================================================
-- FATURAS GERENCIAIS DO SGCAB
-- Controle separado da Loja: nao cria fatura financeira, receita,
-- lancamento contabil ou inadimplencia interna.
-- ================================================================

CREATE TABLE IF NOT EXISTS sgcab_faturas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  irmao_id CHAR(36) NOT NULL,
  org_id CHAR(36) NOT NULL,
  ano INT NOT NULL,
  grau INT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  data_sessao DATETIME NULL,
  vencimento DATE NULL,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status ENUM('pendente', 'pago', 'cancelado') NOT NULL DEFAULT 'pendente',
  data_pagamento DATE NULL,
  comprovante_url VARCHAR(500) NULL,
  observacoes TEXT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sgcab_faturas_irmao FOREIGN KEY (irmao_id) REFERENCES irmaos(id) ON DELETE CASCADE,
  CONSTRAINT fk_sgcab_faturas_org FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  CONSTRAINT chk_sgcab_faturas_total CHECK (total >= 0),
  CONSTRAINT chk_sgcab_faturas_grau CHECK (grau > 0)
) ENGINE = InnoDB;

CREATE INDEX idx_sgcab_faturas_filtros
  ON sgcab_faturas (ano, status, org_id, irmao_id);

CREATE TABLE IF NOT EXISTS sgcab_fatura_itens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  fatura_id CHAR(36) NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor DECIMAL(12, 2) NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sgcab_fatura_itens_fatura FOREIGN KEY (fatura_id)
    REFERENCES sgcab_faturas(id) ON DELETE CASCADE,
  CONSTRAINT chk_sgcab_fatura_item_valor CHECK (valor >= 0)
) ENGINE = InnoDB;

CREATE INDEX idx_sgcab_fatura_itens_fatura
  ON sgcab_fatura_itens (fatura_id, ordem);

