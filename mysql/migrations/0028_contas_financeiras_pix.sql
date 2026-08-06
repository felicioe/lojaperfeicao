-- =========================================
-- CHAVES PIX por conta financeira — uma conta pode ter várias chaves
-- (email, telefone, CPF/CNPJ, aleatória), cada uma podendo virar a chave
-- usada pra gerar o "Pix Copia e Cola" (BR Code) impresso na fatura.
-- nome_beneficiario/cidade ficam na própria chave (não em contas_
-- financeiras) porque o BR Code exige os dois campos (Merchant Name/
-- Merchant City) e podem variar por chave/finalidade dentro da mesma
-- conta bancária. "principal" é só a sugestão de pré-seleção nos
-- formulários — a aplicação garante no máximo uma principal por conta
-- (desmarca as demais ao marcar uma nova), não dá pra expressar isso como
-- constraint simples no MySQL sem trigger.
-- =========================================
CREATE TABLE IF NOT EXISTS contas_financeiras_pix (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  conta_financeira_id CHAR(36) NOT NULL,
  tipo ENUM('email', 'telefone', 'cpf', 'cnpj', 'aleatoria') NOT NULL,
  chave VARCHAR(140) NOT NULL,
  nome_beneficiario VARCHAR(25) NOT NULL,
  cidade VARCHAR(15) NOT NULL,
  principal BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_contas_financeiras_pix_conta FOREIGN KEY (conta_financeira_id) REFERENCES contas_financeiras(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_contas_financeiras_pix_conta ON contas_financeiras_pix (conta_financeira_id);
