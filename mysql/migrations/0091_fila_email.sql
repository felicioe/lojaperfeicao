-- =============================================================================
-- Migração 0091: Fila de Envio de Email
--
-- Problema: Envio de email sob demanda sem rastreamento, sem retry,
-- sem controle de tentativas. Emails de comunicado/boas-vindas/relatório
-- desaparecem se SMTP falhar, sem possibilidade de reenvio.
--
-- Solução: Tabela filas_email que:
-- 1. Grava TODOS os pedidos de envio (sob demanda + CRON)
-- 2. Processa síncrono no ato (feedback imediato ao usuário)
-- 3. Se falhar, fica pendente para retry via CRON (max 3 tentativas)
-- 4. Mantém auditoria completa de tentativas
--
-- Diferença de emails_enviados:
-- - emails_enviados: histórico de tentativas (1 linha por tentativa)
-- - filas_email: fila + retry (1 linha por pedido, atualizado a cada tentativa)
-- =============================================================================

CREATE TABLE IF NOT EXISTS filas_email (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,

  -- Identificação do envio
  chave VARCHAR(255) NOT NULL UNIQUE,        -- ID único lógico do envio (ex: fatura_emitida:uuid)
  tipo ENUM('fatura_emitida', 'boas_vindas', 'comunicado', 'cobranca_manual', 'relatorio_manual', 'lembrete_vencida') NOT NULL,

  -- Destinatários
  destinatarios_json JSON NOT NULL,          -- Array de emails: ["email1@...", "email2@..."]

  -- Conteúdo
  assunto VARCHAR(255) NOT NULL,
  corpo_html LONGTEXT NOT NULL,
  corpo_texto LONGTEXT NOT NULL,

  -- Anexo (opcional)
  anexo_buffer LONGBLOB NULL,                -- Buffer do arquivo
  anexo_nome VARCHAR(255) NULL,              -- Nome do arquivo
  anexo_mime_type VARCHAR(100) NULL,         -- MIME type

  -- Controle de fila
  status ENUM('pendente', 'processando', 'enviado', 'erro_permanente') NOT NULL DEFAULT 'pendente',
  tentativas INT NOT NULL DEFAULT 0,         -- Quantas vezes tentou (max 3)
  proxima_tentativa TIMESTAMP NULL,          -- Quando tentar de novo (se falhar)

  -- Erro (se houver)
  ultimo_erro VARCHAR(500) NULL,             -- Mensagem da última tentativa

  -- Rastreamento
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  enviado_em TIMESTAMP NULL,                 -- Quando foi finalmente enviado

  -- Auditoria
  criado_por CHAR(36) NULL,                  -- Usuario que solicitou (se aplicável)

  -- Índices
  KEY idx_filas_email_chave (chave),
  KEY idx_filas_email_status (status),
  KEY idx_filas_email_tipo (tipo),
  KEY idx_filas_email_proxima_tentativa (proxima_tentativa),
  KEY idx_filas_email_criado_em (criado_em)

) ENGINE = InnoDB;

-- Índice composto para buscar filas prontas para retry
CREATE INDEX idx_filas_email_retry ON filas_email (status, proxima_tentativa)
WHERE status IN ('pendente', 'erro_permanente');
