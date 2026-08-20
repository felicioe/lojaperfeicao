-- =============================================================================
-- Migração 0097: remove os DEFAULT transitórios de loja_id (issue #350)
--
-- A 0092 deu a toda coluna `loja_id` o DEFAULT do id da Loja semente. Foi uma
-- decisão consciente e temporária: mantinha o sistema inteiro funcionando
-- enquanto o backend e as rotinas ainda não informavam a loja. O preço é que
-- um INSERT que esquece `loja_id` não falha — ele grava calado na Loja
-- semente. Num SaaS isso é o pior comportamento possível: o dado aparece na
-- Loja errada e ninguém fica sabendo.
--
-- Com a #337 (backend) e a #349 (rotinas e views) concluídas, todo caminho de
-- escrita informa a loja explicitamente. Removendo o DEFAULT, o que antes era
-- um vazamento silencioso vira um erro na hora do INSERT — que é o que se quer
-- de uma rede de proteção.
--
-- PRÉ-REQUISITOS, nesta ordem:
--   1. o código da #337/#349 implantado (a Hostinger já compilou o commit);
--   2. a migração 0096 aplicada;
--   3. `npm run testar:isolamento` passando.
-- Aplicar esta migração antes disso quebra escrita em produção.
--
-- Reversível: para voltar atrás, basta recolocar o DEFAULT
-- (`ALTER TABLE x ALTER COLUMN loja_id SET DEFAULT '00000000-0000-4000-8000-000000000001'`).
-- Nenhum dado é alterado aqui — só a definição da coluna.
--
-- As tabelas de infra global (cnpj_*, tentativas_login, estado de OAuth) não
-- têm `loja_id` e não aparecem nesta lista, pelos motivos escritos na 0092.
-- `loja_convites` e `loja_parametros_email` nasceram já sem DEFAULT (0093 e
-- 0095), então também ficam de fora.
-- =============================================================================

ALTER TABLE auditoria ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE backups_gerados ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE cargos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE comissao_membros ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE comissoes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE comunicados ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE comunicado_leituras ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE conciliacao_lancamentos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE conciliacoes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE configuracoes_lgpd ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE contas_financeiras ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE contas_financeiras_pix ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE despesas_recorrentes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE documentos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE emails_enviados ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE enquetes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE enquete_opcoes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE enquete_votos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE eventos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE evento_rsvps ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE fechamentos_exercicio ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE fechamentos_exercicio_eventos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE filas_email ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE gestao_cargos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE gestoes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE irmaos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE irmao_elevacoes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE irmao_filhos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE irmao_formacao ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE irmao_orgs ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE irmao_parentes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE lancamentos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE lancamentos_contabeis ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE lancamentos_contabeis_itens ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE notificacoes_enviadas ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE ofx_extratos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE ofx_lancamentos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE orcamentos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE orcamento_itens ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE orgs ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE orgs_graus ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE parametros_financeiros ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE parcelamentos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE pecas_arquitetura ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE periodos_fechados ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE periodos_fechados_eventos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE planos_ensino ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE plano_contas ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE potencias ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE presencas ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE push_subscriptions ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE recibos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE recibos_avulsos ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE recibo_itens ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE sessao_responsaveis ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE sessoes ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE sgcab_cobrancas ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE sgcab_faturas ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE sgcab_fatura_itens ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE sgcab_valores_catalogo ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE tabela_valores ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE taxas_grau ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE terceiros ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE tronco_beneficencia_config ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE usuarios ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE usuarios_papeis ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE usuario_passkeys ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE usuario_totp ALTER COLUMN loja_id DROP DEFAULT;
ALTER TABLE usuario_totp_codigos_backup ALTER COLUMN loja_id DROP DEFAULT;
