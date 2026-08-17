-- =============================================================================
-- Verificação pós-migração 0092 (SaaS fase 1 — fundação multi-tenant).
-- Rodar com: mysql -u... -p... BANCO < mysql/verificacao_0092.sql
-- Toda seção imprime OK/FALHA — qualquer FALHA precisa ser investigada antes
-- de considerar a migração aplicada com sucesso.
-- =============================================================================

-- 1. A loja seed existe e está ativa
SELECT IF(COUNT(*) = 1, 'OK', 'FALHA') AS loja_seed_existe
FROM lojas WHERE id = '00000000-0000-4000-8000-000000000001' AND slug = 'adonhiram' AND ativa = 1;

-- 2. 70 tabelas têm loja_id (69 NOT NULL + auditoria NULL)
SELECT IF(COUNT(*) = 70, 'OK', CONCAT('FALHA: ', COUNT(*))) AS tabelas_com_loja_id
FROM information_schema.columns
WHERE table_schema = DATABASE() AND column_name = 'loja_id' AND table_name <> 'lojas';

-- 3. Toda coluna loja_id tem FK pra lojas
SELECT IF(COUNT(*) = 70, 'OK', CONCAT('FALHA: ', COUNT(*))) AS fks_para_lojas
FROM information_schema.referential_constraints
WHERE constraint_schema = DATABASE() AND referenced_table_name = 'lojas';

-- 4. Nenhuma linha órfã: todo loja_id preenchido aponta pra Adonhiram
--    (depois da 0092 e antes de existir segunda loja, qualquer valor diferente
--    é bug). Checagem por amostragem nas tabelas de maior movimento.
SELECT IF(SUM(errado) = 0, 'OK', CONCAT('FALHA: ', SUM(errado))) AS backfill_correto
FROM (
  SELECT COUNT(*) AS errado FROM usuarios      WHERE loja_id <> '00000000-0000-4000-8000-000000000001'
  UNION ALL
  SELECT COUNT(*) FROM irmaos                  WHERE loja_id <> '00000000-0000-4000-8000-000000000001'
  UNION ALL
  SELECT COUNT(*) FROM lancamentos             WHERE loja_id <> '00000000-0000-4000-8000-000000000001'
  UNION ALL
  SELECT COUNT(*) FROM plano_contas            WHERE loja_id <> '00000000-0000-4000-8000-000000000001'
  UNION ALL
  SELECT COUNT(*) FROM auditoria               WHERE loja_id <> '00000000-0000-4000-8000-000000000001'
) t;

-- 5. Singletons: PK agora é loja_id (uma linha de config por loja)
SELECT IF(COUNT(*) = 3, 'OK', CONCAT('FALHA: ', COUNT(*))) AS singletons_pk_loja
FROM information_schema.key_column_usage
WHERE constraint_schema = DATABASE() AND constraint_name = 'PRIMARY'
  AND column_name = 'loja_id'
  AND table_name IN ('parametros_financeiros', 'tronco_beneficencia_config', 'configuracoes_lgpd');

-- 6. UNIQUEs convertidos: e-mail de usuário é único POR LOJA, não mais global
SELECT IF(COUNT(*) = 1, 'OK', 'FALHA') AS usuarios_email_por_loja
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 'usuarios'
  AND index_name = 'uq_usuarios_loja_email' AND non_unique = 0
  AND seq_in_index = 1 AND column_name = 'loja_id';

-- 7. O UNIQUE global antigo de e-mail sumiu
SELECT IF(COUNT(*) = 0, 'OK', 'FALHA') AS unique_global_email_removido
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 'usuarios'
  AND index_name = 'email';

-- 8. Tabelas de infra global continuam SEM loja_id (decisão documentada na 0092)
SELECT IF(COUNT(*) = 0, 'OK', CONCAT('FALHA: ', COUNT(*))) AS infra_global_sem_loja_id
FROM information_schema.columns
WHERE table_schema = DATABASE() AND column_name = 'loja_id'
  AND table_name IN ('cnpj_consultas_cache', 'cnpj_rate_limit', 'tentativas_login',
                     'google_oauth_state', 'facebook_oauth_state',
                     'google_login_tickets', 'facebook_login_tickets');

-- 9. Views continuam válidas (uma consulta em cada; erro aqui = view quebrada)
SELECT IF(COUNT(*) >= 0, 'OK', 'FALHA') AS v_saldo_contas_ok FROM v_saldo_contas;
SELECT IF(COUNT(*) >= 0, 'OK', 'FALHA') AS v_saldo_plano_contas_ok FROM v_saldo_plano_contas;
SELECT IF(COUNT(*) >= 0, 'OK', 'FALHA') AS v_auditoria_contabil_ok FROM v_auditoria_contabil_desbalanceados;
