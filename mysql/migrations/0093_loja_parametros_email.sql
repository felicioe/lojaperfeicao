-- =============================================================================
-- Migração 0093: parâmetros de e-mail (SMTP) por loja (issue #352)
--
-- Tira o SMTP das variáveis de ambiente do servidor e põe no banco, uma linha
-- por loja. Num SaaS cada loja tem a própria caixa de e-mail, e o remetente
-- das faturas, comunicados e relatórios precisa ser o dela — não o de outra.
--
-- Efeito colateral que motivou a issue: enquanto a configuração for código,
-- corrigir um host ou uma senha custa um deploy inteiro (a Hostinger clona o
-- repositório e roda o build; não existe deploy incremental). Com ela no
-- banco, o ciclo vira salvar na tela e clicar em "Enviar e-mail de teste".
--
-- A senha é gravada CIFRADA (AES-256-GCM). A chave é derivada do
-- SESSION_SECRET — deliberadamente, para não criar mais um segredo que o
-- administrador precise guardar e nunca perder. Se o SESSION_SECRET for
-- trocado, a senha deixa de ser decifrável e a tela volta a pedi-la, o que é
-- degradação aceitável (e as sessões caem junto de qualquer forma).
--
-- Fallback: loja SEM linha aqui continua usando as variáveis SMTP_* do
-- servidor. É o que mantém a Adonhiram enviando e-mail no instante do deploy,
-- sem ninguém precisar abrir a tela primeiro.
-- =============================================================================

CREATE TABLE IF NOT EXISTS loja_parametros_email (
  -- PK é a própria loja: uma configuração por loja, sem id artificial.
  loja_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  host VARCHAR(255) NOT NULL,
  porta SMALLINT UNSIGNED NOT NULL DEFAULT 465,
  -- Login SMTP: o endereço completo, com domínio. Guardar só a parte antes do
  -- @ foi a causa de horas de "535 authentication failed" na Adonhiram.
  usuario VARCHAR(255) NOT NULL,
  -- AES-256-GCM em base64 (iv:tag:conteudo). Nunca em texto puro: quem
  -- abrisse o phpMyAdmin leria a senha da caixa de e-mail de todas as lojas.
  senha_cifrada VARCHAR(1024) NOT NULL,
  -- Nome exibido no remetente; o endereço vem de `usuario` quando vazio.
  remetente_nome VARCHAR(255) NULL,
  remetente_email VARCHAR(255) NULL,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  PRIMARY KEY (loja_id),
  CONSTRAINT fk_loja_parametros_email_loja
    FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A collation vai explícita em loja_id e atualizado_por de propósito: no
-- MariaDB 11 o padrão do servidor passou a ser utf8mb4_uca1400_ai_ci, e
-- `lojas.id` está em utf8mb4_unicode_ci. Uma FK entre colunas de texto exige
-- collation idêntica nos dois lados — sem isto a criação falha com
-- "errno 150: Foreign key constraint is incorrectly formed", que foi
-- exatamente o que travou a aplicação da 0092 em produção.
