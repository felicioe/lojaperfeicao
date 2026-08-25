-- Recuperação de senha self-service (issue #364).
--
-- Antes disso, o único jeito de recuperar uma senha esquecida era o admin
-- da Loja resetar manualmente na tela de Usuários — atrito real pra algo
-- que deveria ser self-service, e sobrecarga do admin.
--
-- Mesmo padrão de token de `loja_convites` (migração 0095): 256 bits de
-- aleatoriedade, guardados só como SHA-256 — um dump do banco não permite
-- redefinir senha nenhuma, porque o valor que vai no link nunca é gravado.
--
-- Validade curta de propósito (30 minutos, ver recuperacao-senha.ts): é um
-- link que abre a porta pra trocar a senha de outra pessoa se cair na mão
-- errada, então o intervalo em que isso é possível fica pequeno.
CREATE TABLE IF NOT EXISTS tokens_recuperacao_senha (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  usuario_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em TIMESTAMP NOT NULL,
  -- NULL = ainda válido (se não estiver expirado). Marcado no uso pra que um
  -- segundo clique no mesmo link — duas abas, e-mail reencaminhado depois da
  -- troca — não redefina a senha de novo por cima.
  usado_em TIMESTAMP NULL,
  UNIQUE KEY uq_trs_token (token_hash),
  KEY idx_trs_usuario (usuario_id),
  CONSTRAINT fk_trs_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_trs_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
