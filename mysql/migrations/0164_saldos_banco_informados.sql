-- issue do usuário — "Fechamento do extrato" hoje só fecha com OFX
-- importado (linha a linha) ou, pra contas sem OFX disponível, com a
-- conferência por PDF (issue #720, mas essa é um check avulso, não fecha o
-- painel). Esta tabela guarda o histórico de cada saldo informado na mão
-- pelo usuário quando nem OFX nem PDF estão disponíveis — o mais recente
-- por conta passa a alimentar o "Fechamento do extrato" como se fosse o
-- saldo final de um extrato, até que um OFX de verdade seja importado
-- (que sempre tem prioridade — ver obterResumoConciliacaoOfx).
CREATE TABLE IF NOT EXISTS saldos_banco_informados (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  conta_financeira_id CHAR(36) NOT NULL,
  data_saldo DATE NOT NULL,
  saldo DECIMAL(14,2) NOT NULL,
  informado_por CHAR(36) NULL,
  informado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_saldos_banco_informados_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_saldos_banco_informados_conta
    FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_saldos_banco_informados_conta
  ON saldos_banco_informados (loja_id, conta_financeira_id, informado_em);
