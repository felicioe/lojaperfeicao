-- =========================================
-- NOTIFICAÇÕES E PUSH — issue #27.
--
-- Referência no legado PHP: `gerarNotificacoes()` (aniversários, faturas
-- vencidas, recorrentes pendentes) calculado em tempo real — não há
-- tabela de "notificações" persistida, só o log de disparo (para não
-- reenviar push do mesmo evento a cada execução do cron) e as inscrições
-- de push por dispositivo.
-- =========================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY push_subscriptions_endpoint_uniq (endpoint(255)),
  CONSTRAINT fk_push_subscriptions_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE = InnoDB;
CREATE INDEX idx_push_subscriptions_usuario ON push_subscriptions (usuario_id);

-- Dedup do disparo: uma chave (tipo:entidade:data) só dispara push uma vez,
-- mesmo que o cron rode várias vezes no mesmo dia.
CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  chave VARCHAR(255) NOT NULL,
  enviado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY notificacoes_enviadas_chave_uniq (chave)
) ENGINE = InnoDB;
