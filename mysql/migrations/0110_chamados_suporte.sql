-- Sistema de chamados de suporte, Loja → super_admin (issue #363).
--
-- Escopo decidido com o usuário antes de implementar (a issue tinha várias
-- "Decisões em aberto"):
-- - Anexos como data URL em MEDIUMTEXT, mesmo padrão do QR Code PIX
--   (migração 0108) — não Cloudflare R2: as credenciais BACKUP_R2_* do .env
--   não são usadas em NENHUM lugar do código hoje (nem o backup, que ainda
--   grava em disco local), então integrar R2 aqui seria abrir uma
--   dependência de infra nova, não reaproveitar uma existente.
-- - Qualquer membro da Loja pode abrir chamado (não só admin).
-- - SLA com 4 níveis de prioridade, prazo em horas corridas (não dias
--   úteis, pra não precisar de um calculador de dia útil nesta v1).
--
-- chamados_mensagens é a thread inteira, incluindo a mensagem de abertura
-- (autor = quem abriu, eh_super_admin = FALSE) — sem duplicar a descrição
-- num campo separado em `chamados`. chamados_anexos pendura de uma
-- mensagem, nunca do chamado direto, porque um anexo sempre chega junto de
-- alguma mensagem (a de abertura ou uma resposta).
CREATE TABLE IF NOT EXISTS chamados (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  loja_id CHAR(36) NOT NULL,
  aberto_por CHAR(36) NOT NULL,
  assunto VARCHAR(200) NOT NULL,
  prioridade ENUM('baixa', 'media', 'alta', 'urgente') NOT NULL DEFAULT 'media',
  status ENUM('aberto', 'em_andamento', 'resolvido', 'fechado') NOT NULL DEFAULT 'aberto',
  prazo_sla TIMESTAMP NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolvido_em TIMESTAMP NULL,
  KEY idx_chamados_loja (loja_id),
  KEY idx_chamados_status (status),
  CONSTRAINT fk_chamados_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  CONSTRAINT fk_chamados_usuario FOREIGN KEY (aberto_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chamados_mensagens (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  chamado_id CHAR(36) NOT NULL,
  autor_id CHAR(36) NOT NULL,
  eh_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  mensagem TEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chamados_mensagens_chamado (chamado_id),
  CONSTRAINT fk_chamados_mensagens_chamado FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE,
  CONSTRAINT fk_chamados_mensagens_usuario FOREIGN KEY (autor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chamados_anexos (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  mensagem_id CHAR(36) NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  tamanho_bytes INT UNSIGNED NOT NULL,
  conteudo MEDIUMTEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chamados_anexos_mensagem (mensagem_id),
  CONSTRAINT fk_chamados_anexos_mensagem FOREIGN KEY (mensagem_id) REFERENCES chamados_mensagens(id) ON DELETE CASCADE
) ENGINE=InnoDB;
