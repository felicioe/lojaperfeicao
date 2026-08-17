-- =============================================================================
-- Prontidão para implantar o código multi-tenant (SaaS fase 1, issues #336/#337)
--
-- POR QUE ESTE ARQUIVO EXISTE
-- O código multi-tenant **exige** que a migração 0092 já esteja aplicada: toda
-- requisição autenticada roda
--   SET @current_loja_id = (SELECT loja_id FROM usuarios WHERE id = ?)
-- e `comSessao`/`comPapel` recusam usuário sem loja ou com loja inativa. Num
-- banco sem a 0092, isso é erro de SQL em toda requisição — o site inteiro para.
-- Foi exatamente o que aconteceu no deploy de 16/08/2026 (merge 1ecc1fc,
-- revertido em 6f26753).
--
-- Diferente de `verificacao_0092.sql` (que confere se a migração ficou correta,
-- e só roda DEPOIS dela), este arquivo é seguro rodar a QUALQUER momento,
-- inclusive num banco que nunca viu a 0092: a etapa 1 só lê information_schema.
--
-- COMO RODAR
--   mysql --default-character-set=utf8mb4 -u USUARIO -p BANCO < mysql/prontidao_multitenant.sql
-- ou colar a ETAPA 1 no phpMyAdmin da Hostinger (aba SQL), e só então a ETAPA 2.
--
-- COMO LER: qualquer linha com resultado != 'OK' impede o deploy do código
-- multi-tenant. Aplicar a 0092 primeiro e rodar de novo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ETAPA 1 — segura em qualquer banco (só information_schema).
-- Se `migracao_0092_aplicada` vier FALTA, pare aqui: a etapa 2 não roda ainda.
-- -----------------------------------------------------------------------------
SELECT 'migracao_0092_aplicada' AS verificacao,
       IF(COUNT(*) = 1, 'OK', 'FALTA — aplicar 0092 antes do deploy') AS resultado
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'lojas'
UNION ALL
SELECT 'usuarios_tem_coluna_loja_id',
       IF(COUNT(*) = 1, 'OK', 'FALTA — sem isto toda requisição autenticada falha')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'usuarios' AND column_name = 'loja_id'
UNION ALL
SELECT 'tabelas_com_loja_id',
       IF(COUNT(*) = 70, 'OK (70)', CONCAT('DIVERGENTE: ', COUNT(*), ' de 70'))
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND column_name = 'loja_id' AND table_name <> 'lojas'
UNION ALL
SELECT 'fks_para_lojas',
       IF(COUNT(*) = 70, 'OK (70)', CONCAT('DIVERGENTE: ', COUNT(*), ' de 70'))
  FROM information_schema.referential_constraints
 WHERE constraint_schema = DATABASE() AND referenced_table_name = 'lojas';

-- -----------------------------------------------------------------------------
-- ETAPA 2 — rodar SÓ se a etapa 1 disse que a 0092 está aplicada.
-- (Consulta tabelas/colunas que só existem depois da migração.)
-- -----------------------------------------------------------------------------
SELECT 'existe_loja_ativa' AS verificacao,
       IF(COUNT(*) >= 1, 'OK', 'FALHA — nenhuma loja ativa; todo login será barrado') AS resultado
  FROM lojas WHERE ativa = 1
UNION ALL
SELECT 'todo_usuario_tem_loja',
       IF(SUM(loja_id IS NULL) = 0, 'OK',
          CONCAT('FALHA — ', SUM(loja_id IS NULL), ' usuário(s) sem loja: ficam sem acesso'))
  FROM usuarios
UNION ALL
SELECT 'usuarios_apontam_para_loja_ativa',
       IF(COUNT(*) = 0, 'OK', CONCAT('FALHA — ', COUNT(*), ' usuário(s) em loja inexistente ou inativa'))
  FROM usuarios u LEFT JOIN lojas l ON l.id = u.loja_id
 WHERE u.loja_id IS NOT NULL AND (l.id IS NULL OR l.ativa = 0)
UNION ALL
-- Acento gravado errado por aplicar a migração sem utf8mb4 (ver README, seção
-- "Convenções de migração"). Não derruba o site, mas aparece na tela.
-- A checagem é por BYTE (HEX), não por LIKE: a collation utf8mb4_unicode_ci é
-- accent-insensitive, então `nome LIKE '%Ã%'` casaria com qualquer "a" e
-- acusaria mojibake em nome correto. 'C383' é o "Ã" de texto UTF-8 lido como
-- latin1 e regravado — a assinatura do mojibake.
SELECT 'seed_sem_mojibake',
       IF(SUM(HEX(nome) LIKE '%C383%' OR HEX(COALESCE(razao_social, '')) LIKE '%C383%') = 0, 'OK',
          'FALHA — corrigir com o UPDATE do seed da 0092, aplicado com utf8mb4')
  FROM lojas;
