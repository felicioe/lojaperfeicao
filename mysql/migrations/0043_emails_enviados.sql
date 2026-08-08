-- =========================================
-- ENVIO DE E-MAIL (issue #103) — infraestrutura de log de envios,
-- reaproveitando o mesmo espírito de dedup de notificacoes_enviadas
-- (0018_notificacoes_push.sql), mas SEM UNIQUE KEY na chave: falha de
-- envio (SMTP fora do ar, timeout etc.) precisa poder ser tentada de novo
-- no próximo disparo, então a dedup é feita em código checando se já
-- existe uma linha com sucesso = TRUE pra aquela chave, não via
-- constraint. Cada linha é uma TENTATIVA (sucedida ou não), não um envio
-- lógico único.
-- =========================================
CREATE TABLE IF NOT EXISTS emails_enviados (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  chave VARCHAR(255) NOT NULL,
  destinatario VARCHAR(255) NOT NULL,
  assunto VARCHAR(255) NOT NULL,
  sucesso BOOLEAN NOT NULL,
  erro VARCHAR(500) NULL,
  enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB;
CREATE INDEX idx_emails_enviados_chave ON emails_enviados (chave);
