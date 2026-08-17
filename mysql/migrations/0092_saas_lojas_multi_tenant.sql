-- =============================================================================
-- Migração 0092: SaaS fase 1 — fundação multi-tenant (issue #336)
--
-- Cria a tabela `lojas` (tenant) e adiciona `loja_id` a TODAS as tabelas de
-- negócio, com FK e índice. Todo dado existente é atribuído à loja Adonhiram
-- (seed abaixo, id fixo pra ser referenciável em código/scripts de transição).
--
-- ESTRATÉGIA DE TRANSIÇÃO (leia antes de mexer):
--   `loja_id` nasce com DEFAULT no id da Adonhiram. Isso mantém 100% do
--   código e das procedures atuais funcionando sem alteração — INSERTs que
--   não informam loja_id continuam caindo na Adonhiram, que é o comportamento
--   single-tenant vigente. A issue #337 reescreve backend + procedures pra
--   informar loja_id explicitamente (via @current_loja_id) e REMOVE estes
--   DEFAULTs — a partir dali, INSERT sem loja explícita passa a falhar, que
--   é o comportamento correto num SaaS. Não cadastrar uma segunda loja em
--   produção antes da #337 estar implantada.
--
-- Tabelas de infra global que NÃO recebem loja_id (por quê):
--   - cnpj_consultas_cache / cnpj_rate_limit: cache de API externa, sem dado
--     de negócio; compartilhar entre lojas é o desejado.
--   - tentativas_login: rate limit por e-mail/IP pré-login (antes de saber a
--     loja); escopo global protege mais, não menos.
--   - google/facebook_oauth_state e *_login_tickets: estado transitório do
--     fluxo OAuth, expira em minutos.
--
-- Casos especiais:
--   - auditoria.loja_id aceita NULL: ações do futuro super-admin (issue #339)
--     acontecem fora de qualquer loja.
--   - Singletons (parametros_financeiros, tronco_beneficencia_config,
--     configuracoes_lgpd): a PK muda de (id) pra (loja_id) — vira "uma linha
--     por loja". A coluna id (sempre 1, CHECK mantido) fica pra
--     compatibilidade com os SELECT ... WHERE id = 1 atuais até a #337.
--   - UNIQUEs que eram globais e passam a ser por loja: usuarios (email,
--     google_id, facebook_id), plano_contas.codigo, fechamentos_exercicio
--     .exercicio, orcamentos.ano, periodos_fechados.competencia,
--     recibos_avulsos.numero, sgcab_valores_catalogo (tipo, ano),
--     notificacoes_enviadas.chave, filas_email.chave.
--     Decisão do usuário (issue #336): e-mail é único POR LOJA — o mesmo
--     e-mail em duas lojas são contas separadas.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lojas (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  -- slug = subdomínio de acesso (issue #338); rótulo DNS: max 63 chars
  slug VARCHAR(63) NOT NULL UNIQUE,
  nome VARCHAR(255) NOT NULL,
  razao_social VARCHAR(255) NULL,
  cnpj VARCHAR(20) NULL,
  -- inativar bloqueia o login de todos os usuários da loja (issue #339)
  ativa TINYINT(1) NOT NULL DEFAULT 1,
  criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Loja seed: todos os dados existentes pertencem a ela. Id fixo de propósito
-- (referenciado pelos DEFAULTs abaixo e por scripts de verificação).
INSERT IGNORE INTO lojas (id, slug, nome, razao_social, cnpj) VALUES (
  '00000000-0000-4000-8000-000000000001',
  'adonhiram',
  'Loja de Perfeição Adonhiram',
  'ASSOCIACAO CAPITULAR ADONHIRAMITA AO VALE DE ITAJAI',
  '26.649.083/0001-38'
);

ALTER TABLE auditoria
  ADD COLUMN loja_id CHAR(36) NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_auditoria_loja (loja_id),
  ADD CONSTRAINT fk_auditoria_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE backups_gerados
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_backups_gerados_loja (loja_id),
  ADD CONSTRAINT fk_backups_gerados_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE cargos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_cargos_loja (loja_id),
  ADD CONSTRAINT fk_cargos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE comissao_membros
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_comissao_membros_loja (loja_id),
  ADD CONSTRAINT fk_comissao_membros_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE comissoes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_comissoes_loja (loja_id),
  ADD CONSTRAINT fk_comissoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE comunicados
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_comunicados_loja (loja_id),
  ADD CONSTRAINT fk_comunicados_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE comunicado_leituras
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_comunicado_leituras_loja (loja_id),
  ADD CONSTRAINT fk_comunicado_leituras_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE conciliacao_lancamentos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_conciliacao_lancamentos_loja (loja_id),
  ADD CONSTRAINT fk_conciliacao_lancamentos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE conciliacoes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_conciliacoes_loja (loja_id),
  ADD CONSTRAINT fk_conciliacoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE configuracoes_lgpd
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (loja_id),
  ADD KEY idx_configuracoes_lgpd_loja (loja_id),
  ADD CONSTRAINT fk_configuracoes_lgpd_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE contas_financeiras
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_contas_financeiras_loja (loja_id),
  ADD CONSTRAINT fk_contas_financeiras_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE contas_financeiras_pix
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_contas_financeiras_pix_loja (loja_id),
  ADD CONSTRAINT fk_contas_financeiras_pix_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE despesas_recorrentes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_despesas_recorrentes_loja (loja_id),
  ADD CONSTRAINT fk_despesas_recorrentes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE documentos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_documentos_loja (loja_id),
  ADD CONSTRAINT fk_documentos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE documento_assinaturas
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_documento_assinaturas_loja (loja_id),
  ADD CONSTRAINT fk_documento_assinaturas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE emails_enviados
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_emails_enviados_loja (loja_id),
  ADD CONSTRAINT fk_emails_enviados_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE enquetes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_enquetes_loja (loja_id),
  ADD CONSTRAINT fk_enquetes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE enquete_opcoes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_enquete_opcoes_loja (loja_id),
  ADD CONSTRAINT fk_enquete_opcoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE enquete_votos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_enquete_votos_loja (loja_id),
  ADD CONSTRAINT fk_enquete_votos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE eventos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_eventos_loja (loja_id),
  ADD CONSTRAINT fk_eventos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE evento_rsvps
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_evento_rsvps_loja (loja_id),
  ADD CONSTRAINT fk_evento_rsvps_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE fechamentos_exercicio
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_fechamentos_exercicio_loja (loja_id),
  ADD CONSTRAINT fk_fechamentos_exercicio_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY exercicio,
  ADD UNIQUE KEY uq_fechamentos_exercicio_loja_exercicio (loja_id, exercicio);

ALTER TABLE fechamentos_exercicio_eventos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_fechamentos_exercicio_eventos_loja (loja_id),
  ADD CONSTRAINT fk_fechamentos_exercicio_eventos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE filas_email
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_filas_email_loja (loja_id),
  ADD CONSTRAINT fk_filas_email_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY chave,
  ADD UNIQUE KEY uq_filas_email_loja_chave (loja_id, chave);

ALTER TABLE gestao_cargos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_gestao_cargos_loja (loja_id),
  ADD CONSTRAINT fk_gestao_cargos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE gestoes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_gestoes_loja (loja_id),
  ADD CONSTRAINT fk_gestoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE irmaos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_irmaos_loja (loja_id),
  ADD CONSTRAINT fk_irmaos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE irmao_elevacoes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_irmao_elevacoes_loja (loja_id),
  ADD CONSTRAINT fk_irmao_elevacoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE irmao_filhos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_irmao_filhos_loja (loja_id),
  ADD CONSTRAINT fk_irmao_filhos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE irmao_formacao
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_irmao_formacao_loja (loja_id),
  ADD CONSTRAINT fk_irmao_formacao_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE irmao_orgs
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_irmao_orgs_loja (loja_id),
  ADD CONSTRAINT fk_irmao_orgs_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE irmao_parentes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_irmao_parentes_loja (loja_id),
  ADD CONSTRAINT fk_irmao_parentes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE lancamentos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_lancamentos_loja (loja_id),
  ADD CONSTRAINT fk_lancamentos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE lancamentos_contabeis
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_lancamentos_contabeis_loja (loja_id),
  ADD CONSTRAINT fk_lancamentos_contabeis_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE lancamentos_contabeis_itens
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_lancamentos_contabeis_itens_loja (loja_id),
  ADD CONSTRAINT fk_lancamentos_contabeis_itens_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE notificacoes_enviadas
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_notificacoes_enviadas_loja (loja_id),
  ADD CONSTRAINT fk_notificacoes_enviadas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY notificacoes_enviadas_chave_uniq,
  ADD UNIQUE KEY uq_notificacoes_enviadas_loja_chave (loja_id, chave);

ALTER TABLE ofx_extratos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_ofx_extratos_loja (loja_id),
  ADD CONSTRAINT fk_ofx_extratos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE ofx_lancamentos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_ofx_lancamentos_loja (loja_id),
  ADD CONSTRAINT fk_ofx_lancamentos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE orcamentos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_orcamentos_loja (loja_id),
  ADD CONSTRAINT fk_orcamentos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY ano,
  ADD UNIQUE KEY uq_orcamentos_loja_ano (loja_id, ano);

ALTER TABLE orcamento_itens
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_orcamento_itens_loja (loja_id),
  ADD CONSTRAINT fk_orcamento_itens_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE orgs
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_orgs_loja (loja_id),
  ADD CONSTRAINT fk_orgs_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE orgs_graus
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_orgs_graus_loja (loja_id),
  ADD CONSTRAINT fk_orgs_graus_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE parametros_financeiros
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (loja_id),
  ADD KEY idx_parametros_financeiros_loja (loja_id),
  ADD CONSTRAINT fk_parametros_financeiros_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE parcelamentos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_parcelamentos_loja (loja_id),
  ADD CONSTRAINT fk_parcelamentos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE pecas_arquitetura
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_pecas_arquitetura_loja (loja_id),
  ADD CONSTRAINT fk_pecas_arquitetura_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE periodos_fechados
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_periodos_fechados_loja (loja_id),
  ADD CONSTRAINT fk_periodos_fechados_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY competencia,
  ADD UNIQUE KEY uq_periodos_fechados_loja_competencia (loja_id, competencia);

ALTER TABLE periodos_fechados_eventos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_periodos_fechados_eventos_loja (loja_id),
  ADD CONSTRAINT fk_periodos_fechados_eventos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE planos_ensino
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_planos_ensino_loja (loja_id),
  ADD CONSTRAINT fk_planos_ensino_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE plano_contas
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_plano_contas_loja (loja_id),
  ADD CONSTRAINT fk_plano_contas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY codigo,
  ADD UNIQUE KEY uq_plano_contas_loja_codigo (loja_id, codigo);

ALTER TABLE potencias
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_potencias_loja (loja_id),
  ADD CONSTRAINT fk_potencias_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE presencas
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_presencas_loja (loja_id),
  ADD CONSTRAINT fk_presencas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE push_subscriptions
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_push_subscriptions_loja (loja_id),
  ADD CONSTRAINT fk_push_subscriptions_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE recibos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_recibos_loja (loja_id),
  ADD CONSTRAINT fk_recibos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE recibos_avulsos
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_recibos_avulsos_loja (loja_id),
  ADD CONSTRAINT fk_recibos_avulsos_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY numero,
  ADD UNIQUE KEY uq_recibos_avulsos_loja_numero (numero, loja_id);

ALTER TABLE recibo_itens
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_recibo_itens_loja (loja_id),
  ADD CONSTRAINT fk_recibo_itens_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE sessao_responsaveis
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_sessao_responsaveis_loja (loja_id),
  ADD CONSTRAINT fk_sessao_responsaveis_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE sessoes
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_sessoes_loja (loja_id),
  ADD CONSTRAINT fk_sessoes_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE sgcab_cobrancas
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_sgcab_cobrancas_loja (loja_id),
  ADD CONSTRAINT fk_sgcab_cobrancas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE sgcab_faturas
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_sgcab_faturas_loja (loja_id),
  ADD CONSTRAINT fk_sgcab_faturas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE sgcab_fatura_itens
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_sgcab_fatura_itens_loja (loja_id),
  ADD CONSTRAINT fk_sgcab_fatura_itens_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE sgcab_valores_catalogo
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_sgcab_valores_catalogo_loja (loja_id),
  ADD CONSTRAINT fk_sgcab_valores_catalogo_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY sgcab_catalogo_tipo_ano_uniq,
  ADD UNIQUE KEY uq_sgcab_valores_catalogo_loja_tipo_ano (loja_id, tipo, ano);

ALTER TABLE tabela_valores
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_tabela_valores_loja (loja_id),
  ADD CONSTRAINT fk_tabela_valores_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE taxas_grau
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_taxas_grau_loja (loja_id),
  ADD CONSTRAINT fk_taxas_grau_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE terceiros
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_terceiros_loja (loja_id),
  ADD CONSTRAINT fk_terceiros_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE tronco_beneficencia_config
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (loja_id),
  ADD KEY idx_tronco_beneficencia_config_loja (loja_id),
  ADD CONSTRAINT fk_tronco_beneficencia_config_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE usuarios
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_usuarios_loja (loja_id),
  ADD CONSTRAINT fk_usuarios_loja FOREIGN KEY (loja_id) REFERENCES lojas(id),
  DROP KEY email,
  ADD UNIQUE KEY uq_usuarios_loja_email (loja_id, email),
  DROP KEY google_id,
  ADD UNIQUE KEY uq_usuarios_loja_google_id (loja_id, google_id),
  DROP KEY facebook_id,
  ADD UNIQUE KEY uq_usuarios_loja_facebook_id (loja_id, facebook_id);

ALTER TABLE usuarios_papeis
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_usuarios_papeis_loja (loja_id),
  ADD CONSTRAINT fk_usuarios_papeis_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE usuario_passkeys
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_usuario_passkeys_loja (loja_id),
  ADD CONSTRAINT fk_usuario_passkeys_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE usuario_totp
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_usuario_totp_loja (loja_id),
  ADD CONSTRAINT fk_usuario_totp_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

ALTER TABLE usuario_totp_codigos_backup
  ADD COLUMN loja_id CHAR(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  ADD KEY idx_usuario_totp_codigos_backup_loja (loja_id),
  ADD CONSTRAINT fk_usuario_totp_codigos_backup_loja FOREIGN KEY (loja_id) REFERENCES lojas(id);

